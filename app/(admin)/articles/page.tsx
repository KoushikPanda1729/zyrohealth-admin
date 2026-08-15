'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input,
  InputNumber, Switch, Popconfirm,
} from 'antd';
import { PlusOutlined, ReadOutlined, EditOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import { getStoredUserRaw } from '../../../lib/session';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ArticleRow {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  category?: string;
  authorName?: string;
  readTimeMinutes: number;
  isPublished: boolean;
  createdAt: string;
}

export default function ArticlesPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [readTimeMinutes, setReadTimeMinutes] = useState<number>(3);
  const [isPublished, setIsPublished] = useState(true);

  const [editing, setEditing] = useState<ArticleRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAuthorName, setEditAuthorName] = useState('');
  const [editReadTimeMinutes, setEditReadTimeMinutes] = useState<number>(3);
  const [editIsPublished, setEditIsPublished] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/articles');
      setArticles(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load articles');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createArticle = async () => {
    if (!title.trim() || !body.trim()) return;
    setCreateSaving(true);
    try {
      await apiCall('POST', '/api/admin/articles', {
        title: title.trim(),
        body: body.trim(),
        imageUrl: imageUrl.trim() || undefined,
        category: category.trim() || undefined,
        authorName: authorName.trim() || undefined,
        readTimeMinutes,
        isPublished,
      });
      message.success('Article created');
      setCreating(false);
      setTitle(''); setBody(''); setImageUrl(''); setCategory(''); setAuthorName('');
      setReadTimeMinutes(3); setIsPublished(true);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create article');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const togglePublished = async (article: ArticleRow) => {
    setBusyId(article.id);
    try {
      await apiCall('PATCH', `/api/admin/articles/${article.id}`, { isPublished: !article.isPublished });
      message.success(article.isPublished ? 'Article unpublished' : 'Article published');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update article');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const openEdit = (article: ArticleRow) => {
    setEditing(article);
    setEditTitle(article.title);
    setEditBody(article.body);
    setEditImageUrl(article.imageUrl ?? '');
    setEditCategory(article.category ?? '');
    setEditAuthorName(article.authorName ?? '');
    setEditReadTimeMinutes(article.readTimeMinutes);
    setEditIsPublished(article.isPublished);
  };

  const saveEdit = async () => {
    if (!editing || !editTitle.trim() || !editBody.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/admin/articles/${editing.id}`, {
        title: editTitle.trim(),
        body: editBody.trim(),
        imageUrl: editImageUrl.trim() || undefined,
        category: editCategory.trim() || undefined,
        authorName: editAuthorName.trim() || undefined,
        readTimeMinutes: editReadTimeMinutes,
        isPublished: editIsPublished,
      });
      message.success('Article updated');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update article');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const columns = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Category', dataIndex: 'category', key: 'category', render: (v?: string) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Author', dataIndex: 'authorName', key: 'authorName', render: (v?: string) => v || '—' },
    {
      title: 'Read time', dataIndex: 'readTimeMinutes', key: 'readTimeMinutes',
      render: (v: number) => `${v} min`,
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, a: ArticleRow) => (
        a.isPublished
          ? <Tag icon={<CheckCircleOutlined />} color="green">Published</Tag>
          : <Tag color="default">Draft</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, a: ArticleRow) => (
        <Space>
          {!readOnly && <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(a)}>Edit</Button>}
          {!readOnly && (
            <Popconfirm
              title={a.isPublished ? 'Unpublish this article?' : 'Publish this article?'}
              onConfirm={() => togglePublished(a)}
            >
              <Button size="small" danger={a.isPublished} icon={a.isPublished ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === a.id}>
                {a.isPublished ? 'Unpublish' : 'Publish'}
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
          <ReadOutlined style={{ marginRight: 8 }} />Articles
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Add Article</Button>
        )}
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {articles.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No articles yet"
          description="Publish a health article — patients can read it in the app regardless of which tenant they belong to."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={articles.map((a) => ({ ...a, key: a.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><ReadOutlined style={{ marginRight: 8, color: '#1677ff' }} />Add Article</span>}
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
              disabled={!title.trim() || !body.trim()}
              onClick={createArticle}
            >
              Create
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Title</Text>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The 25 Healthiest Fruits You Can Eat" style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Body</Text>
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={6} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Image URL</Text>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Category</Text>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Diet, Fitness, Mental Health" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Author</Text>
            <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="e.g. Dr. Health Editorial" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Read time (minutes)</Text>
            <InputNumber value={readTimeMinutes} onChange={(v) => setReadTimeMinutes(v ?? 3)} min={1} max={60} style={{ marginTop: 4, width: '100%' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={isPublished} onChange={setIsPublished} />
            <Text style={{ fontSize: 13 }}>Published (visible to patients)</Text>
          </div>
        </Space>
      </Drawer>

      <Modal
        title="Edit Article"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editTitle.trim() || !editBody.trim() }}
        width={560}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Title</Text>
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Body</Text>
            <TextArea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={6} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Image URL</Text>
            <Input value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Category</Text>
            <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Author</Text>
            <Input value={editAuthorName} onChange={(e) => setEditAuthorName(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Read time (minutes)</Text>
            <InputNumber value={editReadTimeMinutes} onChange={(v) => setEditReadTimeMinutes(v ?? 3)} min={1} max={60} style={{ marginTop: 4, width: '100%' }} />
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
