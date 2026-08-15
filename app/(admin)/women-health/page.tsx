'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input,
  Select, Switch, Popconfirm, ColorPicker,
} from 'antd';
import { PlusOutlined, WomanOutlined, EditOutlined, CheckCircleOutlined, StopOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import { getStoredUserRaw } from '../../../lib/session';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface WomenHealthTip {
  title: string;
  body: string;
}

interface WomenHealthCategoryRow {
  id: string;
  label: string;
  icon: string;
  colorStart: string;
  colorEnd: string;
  description: string;
  facts: string[];
  tips: WomenHealthTip[];
  isPublished: boolean;
  createdAt: string;
}

function TipsEditor({ tips, onChange }: { tips: WomenHealthTip[]; onChange: (tips: WomenHealthTip[]) => void }) {
  const update = (i: number, field: keyof WomenHealthTip, value: string) => {
    const next = tips.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const remove = (i: number) => onChange(tips.filter((_, idx) => idx !== i));
  const add = () => onChange([...tips, { title: '', body: '' }]);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="small">
      {tips.map((tip, i) => (
        <Space key={i} direction="vertical" style={{ width: '100%', border: '1px solid #303030', borderRadius: 8, padding: 10 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Input
              value={tip.title}
              onChange={(e) => update(i, 'title', e.target.value)}
              placeholder="Tip title"
              style={{ width: 260 }}
            />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
          <TextArea
            value={tip.body}
            onChange={(e) => update(i, 'body', e.target.value)}
            placeholder="Tip body"
            rows={2}
          />
        </Space>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={add}>Add Tip</Button>
    </Space>
  );
}

export default function WomenHealthPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [categories, setCategories] = useState<WomenHealthCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('');
  const [colorStart, setColorStart] = useState('#FF5C7A');
  const [colorEnd, setColorEnd] = useState('#FF8FAB');
  const [description, setDescription] = useState('');
  const [facts, setFacts] = useState<string[]>([]);
  const [tips, setTips] = useState<WomenHealthTip[]>([]);
  const [isPublished, setIsPublished] = useState(true);

  const [editing, setEditing] = useState<WomenHealthCategoryRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColorStart, setEditColorStart] = useState('#FF5C7A');
  const [editColorEnd, setEditColorEnd] = useState('#FF8FAB');
  const [editDescription, setEditDescription] = useState('');
  const [editFacts, setEditFacts] = useState<string[]>([]);
  const [editTips, setEditTips] = useState<WomenHealthTip[]>([]);
  const [editIsPublished, setEditIsPublished] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/women-health-categories');
      setCategories(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load categories');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetCreateForm = () => {
    setLabel(''); setIcon(''); setColorStart('#FF5C7A'); setColorEnd('#FF8FAB');
    setDescription(''); setFacts([]); setTips([]); setIsPublished(true);
  };

  const createCategory = async () => {
    if (!label.trim() || !description.trim()) return;
    setCreateSaving(true);
    try {
      await apiCall('POST', '/api/admin/women-health-categories', {
        label: label.trim(),
        icon: icon.trim() || '💗',
        colorStart,
        colorEnd,
        description: description.trim(),
        facts,
        tips,
        isPublished,
      });
      message.success('Category created');
      setCreating(false);
      resetCreateForm();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create category');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const togglePublished = async (category: WomenHealthCategoryRow) => {
    setBusyId(category.id);
    try {
      await apiCall('PATCH', `/api/admin/women-health-categories/${category.id}`, { isPublished: !category.isPublished });
      message.success(category.isPublished ? 'Category unpublished' : 'Category published');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update category');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const openEdit = (category: WomenHealthCategoryRow) => {
    setEditing(category);
    setEditLabel(category.label);
    setEditIcon(category.icon);
    setEditColorStart(category.colorStart);
    setEditColorEnd(category.colorEnd);
    setEditDescription(category.description);
    setEditFacts(category.facts ?? []);
    setEditTips(category.tips ?? []);
    setEditIsPublished(category.isPublished);
  };

  const saveEdit = async () => {
    if (!editing || !editLabel.trim() || !editDescription.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/admin/women-health-categories/${editing.id}`, {
        label: editLabel.trim(),
        icon: editIcon.trim() || '💗',
        colorStart: editColorStart,
        colorEnd: editColorEnd,
        description: editDescription.trim(),
        facts: editFacts,
        tips: editTips,
        isPublished: editIsPublished,
      });
      message.success('Category updated');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update category');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const columns = [
    {
      title: 'Category', key: 'label',
      render: (_: unknown, c: WomenHealthCategoryRow) => (
        <Space>
          <span style={{ fontSize: 18 }}>{c.icon}</span>
          <Text strong>{c.label}</Text>
        </Space>
      ),
    },
    {
      title: 'Gradient', key: 'colors',
      render: (_: unknown, c: WomenHealthCategoryRow) => (
        <div style={{
          width: 60, height: 20, borderRadius: 6,
          background: `linear-gradient(90deg, ${c.colorStart}, ${c.colorEnd})`,
        }} />
      ),
    },
    { title: 'Facts', dataIndex: 'facts', key: 'facts', render: (v: string[]) => v?.length ?? 0 },
    { title: 'Tips', dataIndex: 'tips', key: 'tips', render: (v: WomenHealthTip[]) => v?.length ?? 0 },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, c: WomenHealthCategoryRow) => (
        c.isPublished
          ? <Tag icon={<CheckCircleOutlined />} color="green">Published</Tag>
          : <Tag color="default">Draft</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, c: WomenHealthCategoryRow) => (
        <Space>
          {!readOnly && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(c)}>Edit</Button>}
          {!readOnly && (
            <Popconfirm
              title={c.isPublished ? 'Unpublish this category?' : 'Publish this category?'}
              onConfirm={() => togglePublished(c)}
            >
              <Button size="small" danger={c.isPublished} icon={c.isPublished ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === c.id}>
                {c.isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            </Popconfirm>
          )}
          {readOnly && <Text type="secondary" style={{ fontSize: 12 }}>View only</Text>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WomanOutlined style={{ marginRight: 8 }} />Women&apos;s Health
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Add Category</Button>
        )}
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {categories.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No categories yet"
          description="Publish a women's health category (e.g. Periods, Pregnancy, Fertility) — patients can browse it in the app regardless of which tenant they belong to."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={categories.map((c) => ({ ...c, key: c.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><WomanOutlined style={{ marginRight: 8, color: '#1677ff' }} />Add Category</span>}
        placement="right"
        open={creating}
        onClose={() => setCreating(false)}
        size={480}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              type="primary"
              loading={createSaving}
              disabled={!label.trim() || !description.trim()}
              onClick={createCategory}
            >
              Create
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Label</Text>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Periods" style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Icon (emoji)</Text>
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🩸" style={{ marginTop: 4 }} />
          </div>
          <Space size="large">
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Gradient start</Text>
              <ColorPicker value={colorStart} onChange={(v) => setColorStart(v.toHexString())} showText />
            </div>
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Gradient end</Text>
              <ColorPicker value={colorEnd} onChange={(v) => setColorEnd(v.toHexString())} showText />
            </div>
          </Space>
          <div>
            <Text strong style={{ fontSize: 13 }}>Description</Text>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Quick facts</Text>
            <Select
              mode="tags"
              value={facts}
              onChange={setFacts}
              style={{ width: '100%', marginTop: 4 }}
              placeholder="e.g. Average cycle length: 21-35 days"
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Tips &amp; guidance</Text>
            <div style={{ marginTop: 4 }}>
              <TipsEditor tips={tips} onChange={setTips} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={isPublished} onChange={setIsPublished} />
            <Text style={{ fontSize: 13 }}>Published (visible to patients)</Text>
          </div>
        </Space>
      </Drawer>

      <Modal
        title="Edit Category"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editLabel.trim() || !editDescription.trim() }}
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Label</Text>
            <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Icon (emoji)</Text>
            <Input value={editIcon} onChange={(e) => setEditIcon(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <Space size="large">
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Gradient start</Text>
              <ColorPicker value={editColorStart} onChange={(v) => setEditColorStart(v.toHexString())} showText />
            </div>
            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Gradient end</Text>
              <ColorPicker value={editColorEnd} onChange={(v) => setEditColorEnd(v.toHexString())} showText />
            </div>
          </Space>
          <div>
            <Text strong style={{ fontSize: 13 }}>Description</Text>
            <TextArea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Quick facts</Text>
            <Select mode="tags" value={editFacts} onChange={setEditFacts} style={{ width: '100%', marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Tips &amp; guidance</Text>
            <div style={{ marginTop: 4 }}>
              <TipsEditor tips={editTips} onChange={setEditTips} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={editIsPublished} onChange={setEditIsPublished} />
            <Text style={{ fontSize: 13 }}>Published (visible to patients)</Text>
          </div>
        </Space>
      </Modal>
    </div>
  );
}
