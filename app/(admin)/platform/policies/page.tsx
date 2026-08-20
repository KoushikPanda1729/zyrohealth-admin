'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input,
  Switch, Popconfirm, Row, Col, Tooltip, Collapse,
} from 'antd';
import {
  PlusOutlined, FileProtectOutlined, EditOutlined, CheckCircleOutlined, StopOutlined,
  DeleteOutlined, LinkOutlined, ThunderboltOutlined, IdcardOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface PolicyRow {
  id: string;
  slug: string;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BusinessDetails {
  supportEmail: string;
  legalEntityName: string;
  registeredAddress: string;
  supportPhone: string;
}
const EMPTY_BUSINESS_DETAILS: BusinessDetails = {
  supportEmail: '', legalEntityName: '', registeredAddress: '', supportPhone: '',
};

// The site publicly serves any slug at /policies/[slug] — 'privacy-policy'
// additionally has the shorter, stable /privacy alias (that's the URL
// Play Console / App Store want). Suggested slugs just prefill the "Add
// Policy" form; any slug works.
const SUGGESTED_POLICIES = [
  { slug: 'privacy-policy', title: 'Privacy Policy' },
  { slug: 'terms-of-service', title: 'Terms of Service' },
  { slug: 'refund-policy', title: 'Refund & Cancellation Policy' },
  { slug: 'shipping-policy', title: 'Shipping & Delivery Policy' },
  { slug: 'cookie-policy', title: 'Cookie Policy' },
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function publicUrl(slug: string): string {
  return slug === 'privacy-policy' ? '/privacy' : `/policies/${slug}`;
}

export default function PoliciesPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/platform/policies');
      setPolicies(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load policies');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Business details — fed into every AI generation so it uses real
  // contact info instead of [bracketed placeholders]. Stored on the same
  // shared platform config row as the App Config toggles.

  const [business, setBusiness] = useState<BusinessDetails>(EMPTY_BUSINESS_DETAILS);
  const [businessLoading, setBusinessLoading] = useState(true);
  const [businessSaving, setBusinessSaving] = useState(false);
  const [businessDirty, setBusinessDirty] = useState(false);

  const fetchBusiness = useCallback(async () => {
    setBusinessLoading(true);
    try {
      const result = await apiCall('GET', '/api/platform/config');
      const data = result.data ?? result;
      setBusiness({
        supportEmail: data.supportEmail ?? '',
        legalEntityName: data.legalEntityName ?? '',
        registeredAddress: data.registeredAddress ?? '',
        supportPhone: data.supportPhone ?? '',
      });
      setBusinessDirty(false);
    } catch {
      // Non-fatal — the AI generator just falls back to placeholders.
    } finally { setBusinessLoading(false); }
  }, []);

  useEffect(() => { fetchBusiness(); }, [fetchBusiness]);

  const saveBusiness = async () => {
    setBusinessSaving(true);
    try {
      await apiCall('PATCH', '/api/platform/config', business);
      message.success('Business details saved');
      setBusinessDirty(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save');
      else message.error('An unexpected error occurred');
    } finally { setBusinessSaving(false); }
  };

  const businessComplete = Object.values(business).every((v) => v.trim());

  // ── Create ────────────────────────────────────────────────────────────

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const resetCreateForm = () => {
    setNewSlug(''); setNewTitle(''); setSlugTouched(false);
  };

  const applySuggestion = (s: { slug: string; title: string }) => {
    setNewSlug(s.slug);
    setNewTitle(s.title);
    setSlugTouched(true);
  };

  const createPolicy = async () => {
    if (!newSlug.trim() || !newTitle.trim()) return;
    setCreateSaving(true);
    try {
      await apiCall('POST', '/api/platform/policies', {
        slug: newSlug.trim(),
        title: newTitle.trim(),
        content: '',
        isPublished: false,
      });
      message.success('Policy created — add its content next');
      setCreating(false);
      resetCreateForm();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create policy');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  // ── Edit ──────────────────────────────────────────────────────────────

  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editIsPublished, setEditIsPublished] = useState(true);
  const [aiInstructions, setAiInstructions] = useState('');
  const [generating, setGenerating] = useState(false);

  const openEdit = (policy: PolicyRow) => {
    setEditing(policy);
    setEditTitle(policy.title);
    setEditContent(policy.content);
    setEditIsPublished(policy.isPublished);
    setAiInstructions('');
  };

  const runGeneration = async () => {
    if (!editTitle.trim()) { message.warning('Add a title first'); return; }
    setGenerating(true);
    try {
      const result = await apiCall('POST', '/api/platform/policies/generate', {
        title: editTitle.trim(),
        instructions: aiInstructions.trim() || undefined,
      });
      const content = (result.data ?? result).content;
      setEditContent(content);
      message.success('Draft generated — review before saving');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to generate draft');
      else message.error('An unexpected error occurred');
    } finally { setGenerating(false); }
  };

  const generateWithAI = () => {
    if (editContent.trim()) {
      Modal.confirm({
        title: 'Replace existing content?',
        content: 'This will overwrite what’s currently in the content box with an AI-generated draft.',
        okText: 'Generate',
        onOk: runGeneration,
      });
    } else {
      runGeneration();
    }
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/platform/policies/${editing.id}`, {
        title: editTitle.trim(),
        content: editContent,
        isPublished: editIsPublished,
      });
      message.success('Policy saved');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save policy');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const togglePublished = async (policy: PolicyRow) => {
    setBusyId(policy.id);
    try {
      await apiCall('PATCH', `/api/platform/policies/${policy.id}`, { isPublished: !policy.isPublished });
      message.success(policy.isPublished ? 'Policy unpublished' : 'Policy published');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update policy');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const deletePolicy = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/platform/policies/${id}`);
      message.success('Policy deleted');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete policy');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    {
      title: 'Public URL', dataIndex: 'slug', key: 'slug',
      render: (slug: string) => (
        <Tag icon={<LinkOutlined />} color="default" style={{ fontFamily: 'monospace' }}>
          {publicUrl(slug)}
        </Tag>
      ),
    },
    {
      title: 'Content', key: 'content',
      render: (_: unknown, p: PolicyRow) => (
        p.content.trim()
          ? <Text type="secondary" style={{ fontSize: 12 }}>{p.content.trim().length.toLocaleString()} chars</Text>
          : <Text type="warning" style={{ fontSize: 12 }}>Empty</Text>
      ),
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, p: PolicyRow) => (
        p.isPublished
          ? <Tag icon={<CheckCircleOutlined />} color="green">Published</Tag>
          : <Tag color="default">Draft</Tag>
      ),
    },
    {
      title: 'Updated', dataIndex: 'updatedAt', key: 'updatedAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, p: PolicyRow) => (
        <Space size={4}>
          {!readOnly && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)}>Edit</Button>
            </Tooltip>
          )}
          {!readOnly && (
            <Popconfirm
              title={p.isPublished ? 'Unpublish this policy?' : 'Publish this policy?'}
              description={!p.isPublished && !p.content.trim() ? 'This policy has no content yet.' : undefined}
              onConfirm={() => togglePublished(p)}
            >
              <Tooltip title={p.isPublished ? 'Unpublish' : 'Publish'}>
                <Button size="small" danger={p.isPublished} icon={p.isPublished ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === p.id} />
              </Tooltip>
            </Popconfirm>
          )}
          {!readOnly && (
            <Popconfirm title="Delete this policy permanently?" onConfirm={() => deletePolicy(p.id)}>
              <Tooltip title="Delete">
                <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === p.id} />
              </Tooltip>
            </Popconfirm>
          )}
          {readOnly && <Text type="secondary" style={{ fontSize: 12 }}>View only</Text>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <FileProtectOutlined style={{ marginRight: 8 }} />Policies
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Add Policy</Button>
        )}
      </div>

      <Alert
        type="info"
        showIcon
        message="Legal & policy documents shown publicly on the website"
        description="Privacy policy, terms of service, refund policy, and anything else you need a public URL for — e.g. the one Play Console / App Store ask for. Plain text only (line breaks preserved, no HTML/markdown)."
        style={{ marginBottom: 20 }}
      />

      <Collapse
        style={{ marginBottom: 20 }}
        defaultActiveKey={businessComplete ? [] : ['business']}
        items={[
          {
            key: 'business',
            label: (
              <Space>
                <IdcardOutlined />
                <span>Business Details</span>
                {businessComplete
                  ? <Tag color="green" style={{ marginLeft: 4 }}>Complete</Tag>
                  : <Tag color="orange" style={{ marginLeft: 4 }}>Fill this in for accurate AI drafts</Tag>}
              </Space>
            ),
            children: businessLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spin /></div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Used automatically whenever you click &ldquo;Generate with AI&rdquo; — so drafts use your real
                  contact details instead of placeholders like [support email]. Set this up once.
                </Text>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13 }}>Legal entity name</Text>
                    <Input
                      value={business.legalEntityName}
                      onChange={(e) => { setBusiness({ ...business, legalEntityName: e.target.value }); setBusinessDirty(true); }}
                      placeholder="e.g. ZyroHealth Technologies Pvt. Ltd."
                      disabled={readOnly}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13 }}>Support email</Text>
                    <Input
                      value={business.supportEmail}
                      onChange={(e) => { setBusiness({ ...business, supportEmail: e.target.value }); setBusinessDirty(true); }}
                      placeholder="support@zyrohealth.com"
                      disabled={readOnly}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13 }}>Support phone</Text>
                    <Input
                      value={business.supportPhone}
                      onChange={(e) => { setBusiness({ ...business, supportPhone: e.target.value }); setBusinessDirty(true); }}
                      placeholder="+91 ..."
                      disabled={readOnly}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong style={{ fontSize: 13 }}>Registered address</Text>
                    <Input
                      value={business.registeredAddress}
                      onChange={(e) => { setBusiness({ ...business, registeredAddress: e.target.value }); setBusinessDirty(true); }}
                      placeholder="Street, city, state, PIN, country"
                      disabled={readOnly}
                      style={{ marginTop: 4 }}
                    />
                  </Col>
                </Row>
                {!readOnly && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="primary" loading={businessSaving} disabled={!businessDirty} onClick={saveBusiness}>
                      Save Business Details
                    </Button>
                  </div>
                )}
              </Space>
            ),
          },
        ]}
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {policies.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No policies yet"
          description='Click "Add Policy" to create one — a privacy policy is required before you can submit to Play Console or the App Store.'
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={policies.map((p) => ({ ...p, key: p.id }))} bordered size="middle" scroll={{ x: 'max-content' }} pagination={false} />
      )}

      <Drawer
        title={<span><FileProtectOutlined style={{ marginRight: 8, color: '#1677ff' }} />Add Policy</span>}
        placement="right"
        open={creating}
        onClose={() => { setCreating(false); resetCreateForm(); }}
        size={440}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setCreating(false); resetCreateForm(); }}>Cancel</Button>
            <Button
              type="primary"
              loading={createSaving}
              disabled={!newSlug.trim() || !newTitle.trim()}
              onClick={createPolicy}
            >
              Create
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Quick start</Text>
            <Space wrap size={6}>
              {SUGGESTED_POLICIES.filter((s) => !policies.some((p) => p.slug === s.slug)).map((s) => (
                <Tag key={s.slug} style={{ cursor: 'pointer' }} onClick={() => applySuggestion(s)}>
                  + {s.title}
                </Tag>
              ))}
            </Space>
          </div>

          <div>
            <Text strong style={{ fontSize: 13 }}>Title</Text>
            <Input
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
                if (!slugTouched) setNewSlug(slugify(e.target.value));
              }}
              placeholder="e.g. Refund & Cancellation Policy"
              style={{ marginTop: 4 }}
              autoFocus
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>URL slug</Text>
            <Input
              value={newSlug}
              onChange={(e) => { setNewSlug(slugify(e.target.value)); setSlugTouched(true); }}
              placeholder="refund-policy"
              style={{ marginTop: 4, fontFamily: 'monospace' }}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              Public URL will be <Text code>{publicUrl(newSlug || 'your-slug')}</Text>
            </Text>
          </div>
          <Alert
            type="info"
            showIcon
            message="You'll add the content next"
            description="This creates an empty draft — write the content and publish it from the Edit screen right after."
          />
        </Space>
      </Drawer>

      <Drawer
        title={<span><EditOutlined style={{ marginRight: 8, color: '#1677ff' }} />{editing ? `Edit — ${editing.title}` : 'Edit Policy'}</span>}
        placement="right"
        open={!!editing}
        onClose={() => setEditing(null)}
        size={960}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="primary" loading={editSaving} disabled={!editTitle.trim()} onClick={saveEdit}>
              Save
            </Button>
          </Space>
        }
      >
        {editing && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Row gutter={16} align="middle">
              <Col flex="auto">
                <Text strong style={{ fontSize: 13 }}>Title</Text>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginTop: 4 }} />
              </Col>
              <Col>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Published</Text>
                <Switch checked={editIsPublished} onChange={setEditIsPublished} />
              </Col>
            </Row>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Public URL: <Text code>{publicUrl(editing.slug)}</Text>
              {!editIsPublished && ' — currently hidden, visitors see a "not published yet" placeholder'}
            </Text>

            <div style={{ background: 'rgba(24,144,255,0.06)', border: '1px solid rgba(24,144,255,0.2)', borderRadius: 8, padding: 12 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="Optional notes for the AI — e.g. our refund window is 7 days, support email is support@zyrohealth.com"
                  onPressEnter={generateWithAI}
                />
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={generating}
                  onClick={generateWithAI}
                >
                  Generate with AI
                </Button>
              </Space.Compact>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                Drafts a full document from the title above and ZyroHealth&rsquo;s actual data practices — always
                review and edit before publishing, this isn&rsquo;t legal advice.
              </Text>
            </div>

            <Row gutter={16}>
              <Col xs={24} lg={13}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Content</Text>
                <TextArea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={22}
                  placeholder="Write the policy content here..."
                  style={{ fontFamily: 'inherit', fontSize: 13 }}
                />
              </Col>
              <Col xs={24} lg={11}>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Live Preview</Text>
                <div
                  style={{
                    background: '#fff',
                    color: '#334155',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.08)',
                    padding: '20px 18px',
                    height: 480,
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                    {editTitle || 'Untitled Policy'}
                  </div>
                  {editContent.trim() ? (
                    <div style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{editContent}</div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12.5 }}>Nothing written yet.</Text>
                  )}
                </div>
              </Col>
            </Row>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
