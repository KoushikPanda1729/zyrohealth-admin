'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Drawer, Input, Select, Breadcrumb,
} from 'antd';
import {
  PlusOutlined, SendOutlined, ArrowLeftOutlined, FileTextOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../../lib/api';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

interface GupshupTemplate {
  id: string;
  elementName: string;
  category: TemplateCategory;
  languageCode: string;
  status: string;
  templateType: string;
  data: string;
  reason?: string;
}

function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'APPROVED': return 'success';
    case 'PENDING': return 'processing';
    case 'REJECTED': return 'error';
    default: return 'default';
  }
}

// Templates use {{1}}, {{2}}, ... placeholders — count the highest index
// referenced so the Send form knows how many parameter inputs to render.
function countPlaceholders(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  const indices = matches.map((m) => Number(m.replace(/\D/g, '')));
  return indices.length ? Math.max(...indices) : 0;
}

export default function WhatsAppTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<GupshupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [elementName, setElementName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('UTILITY');
  const [languageCode, setLanguageCode] = useState('en');
  const [content, setContent] = useState('');
  const [example, setExample] = useState('');

  const [sendTarget, setSendTarget] = useState<GupshupTemplate | null>(null);
  const [sendPhone, setSendPhone] = useState('');
  const [sendParams, setSendParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/whatsapp/templates');
      setTemplates(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load templates');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const resetCreateForm = () => {
    setElementName('');
    setCategory('UTILITY');
    setLanguageCode('en');
    setContent('');
    setExample('');
  };

  const createTemplate = async () => {
    if (!elementName.trim() || !content.trim() || !example.trim()) {
      message.error('Template name, message body, and example are required');
      return;
    }
    setCreateSaving(true);
    try {
      await apiCall('POST', '/api/admin/whatsapp/templates', {
        elementName: elementName.trim(),
        category,
        languageCode: languageCode.trim() || 'en',
        content: content.trim(),
        example: example.trim(),
      });
      message.success('Template submitted for approval — Meta typically approves within 24-48 hours');
      setCreateOpen(false);
      resetCreateForm();
      fetchTemplates();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to submit template');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const openSend = (tpl: GupshupTemplate) => {
    setSendTarget(tpl);
    setSendPhone('');
    setSendParams(new Array(countPlaceholders(tpl.data)).fill(''));
  };

  const sendTemplate = async () => {
    if (!sendTarget || !sendPhone.trim()) {
      message.error('A phone number is required');
      return;
    }
    setSending(true);
    try {
      await apiCall('POST', '/api/admin/whatsapp/templates/send', {
        phone: sendPhone.trim(),
        templateName: sendTarget.elementName,
        languageCode: sendTarget.languageCode,
        params: sendParams,
      });
      message.success('Template message sent');
      setSendTarget(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to send template');
      else message.error('An unexpected error occurred');
    } finally { setSending(false); }
  };

  const placeholderCount = useMemo(
    () => (sendTarget ? countPlaceholders(sendTarget.data) : 0),
    [sendTarget],
  );

  const columns = [
    { title: 'Name', dataIndex: 'elementName', key: 'elementName', render: (v: string) => <Text strong>{v}</Text> },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusColor(v)}>{v?.toUpperCase()}</Tag>,
    },
    { title: 'Category', dataIndex: 'category', key: 'category' },
    { title: 'Language', dataIndex: 'languageCode', key: 'languageCode' },
    {
      title: 'Preview', dataIndex: 'data', key: 'data',
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, tpl: GupshupTemplate) => (
        <Button
          size="small"
          icon={<SendOutlined />}
          disabled={tpl.status?.toUpperCase() !== 'APPROVED'}
          onClick={() => openSend(tpl)}
        >
          Send
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <a onClick={() => router.push('/whatsapp')}>WhatsApp</a> },
          { title: 'Templates' },
        ]}
        style={{ marginBottom: 12 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/whatsapp')} style={{ marginRight: 4 }} />
          <FileTextOutlined style={{ marginRight: 8 }} />Message Templates
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Create Template
        </Button>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={templates.map((t) => ({ ...t, key: t.id }))}
          pagination={false}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'No templates yet — create one to send outbound campaign or OTP messages.' }}
        />
      )}

      <Drawer
        title={<span><PlusOutlined style={{ marginRight: 8 }} />Create Template</span>}
        open={createOpen}
        onClose={() => { setCreateOpen(false); resetCreateForm(); }}
        width={480}
        extra={
          <Space>
            <Button onClick={() => { setCreateOpen(false); resetCreateForm(); }}>Cancel</Button>
            <Button type="primary" loading={createSaving} onClick={createTemplate}>Submit for Approval</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Template Name</Text>
            <Input
              value={elementName}
              onChange={(e) => setElementName(e.target.value)}
              placeholder="e.g. order_confirmation"
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Lowercase letters, numbers, and underscores only — this is the name Meta reviews.
            </Text>
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Category</Text>
            <Select
              value={category}
              onChange={setCategory}
              style={{ width: '100%', marginTop: 4 }}
              options={[
                { value: 'UTILITY', label: 'Utility (order/account updates)' },
                { value: 'MARKETING', label: 'Marketing (promotions)' },
                { value: 'AUTHENTICATION', label: 'Authentication (OTP)' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Language</Text>
            <Input value={languageCode} onChange={(e) => setLanguageCode(e.target.value)} placeholder="en" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Message Body</Text>
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'Hi {{1}}, your order #{{2}} has been confirmed!'}
              rows={3}
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Use {'{{1}}'}, {'{{2}}'}, etc. for variables filled in at send time.
            </Text>
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Example (with sample values)</Text>
            <TextArea
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder={'Hi Ravi, your order #A1234 has been confirmed!'}
              rows={2}
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Required by Meta&apos;s review — same text as the body, but with real sample values in place of
              each {'{{n}}'}.
            </Text>
          </div>
          <Alert
            type="info"
            showIcon
            message="Meta typically approves templates within 24-48 hours"
            description="The template appears here as PENDING until reviewed. You can only Send once it shows APPROVED."
          />
        </Space>
      </Drawer>

      <Drawer
        title={<span><SendOutlined style={{ marginRight: 8 }} />Send &quot;{sendTarget?.elementName}&quot;</span>}
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        width={420}
        extra={
          <Space>
            <Button onClick={() => setSendTarget(null)}>Cancel</Button>
            <Button type="primary" loading={sending} onClick={sendTemplate}>Send</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {sendTarget && (
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
              {sendTarget.data}
            </Paragraph>
          )}
          <div>
            <Text strong style={{ fontSize: 13 }}>Phone Number</Text>
            <Input
              value={sendPhone}
              onChange={(e) => setSendPhone(e.target.value)}
              placeholder="919000000000"
              style={{ marginTop: 4 }}
            />
          </div>
          {Array.from({ length: placeholderCount }, (_, i) => (
            <div key={i}>
              <Text strong style={{ fontSize: 13 }}>{`{{${i + 1}}}`}</Text>
              <Input
                value={sendParams[i] ?? ''}
                onChange={(e) => {
                  const next = [...sendParams];
                  next[i] = e.target.value;
                  setSendParams(next);
                }}
                style={{ marginTop: 4 }}
              />
            </div>
          ))}
        </Space>
      </Drawer>
    </div>
  );
}
