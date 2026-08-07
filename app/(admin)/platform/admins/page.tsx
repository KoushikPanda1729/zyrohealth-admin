'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input, Select, Badge, Popconfirm, Form, theme,
} from 'antd';
import {
  PlusOutlined, TeamOutlined, StopOutlined, CheckCircleOutlined, EditOutlined,
  UserOutlined, MailOutlined, ApartmentOutlined, LockOutlined, CheckCircleFilled, CopyOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;

interface TenantAdmin {
  id: string;
  fullName?: string;
  email?: string;
  isActive: boolean;
  tenantName?: string;
  createdAt: string;
}

interface TenantOption {
  id: string;
  name: string;
}

export default function TenantAdminsPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);
  const [admins, setAdmins] = useState<TenantAdmin[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);
  const { token } = theme.useToken();

  const [editing, setEditing] = useState<TenantAdmin | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adminsResult, tenantsResult] = await Promise.all([
        apiCall('GET', '/api/platform/admins'),
        apiCall('GET', '/api/platform/tenants'),
      ]);
      setAdmins(adminsResult.data ?? adminsResult);
      setTenants(tenantsResult.data ?? tenantsResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load tenant admins');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    createForm.resetFields();
    setCreating(true);
  };

  const createAdmin = async (values: {
    fullName: string;
    email: string;
    tenantId: string;
    password?: string;
  }) => {
    setSaving(true);
    try {
      const result = await apiCall('POST', '/api/platform/admins', {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        tenantId: values.tenantId,
        password: values.password?.trim() || undefined,
      });
      const { user, inviteLink } = result.data ?? result;
      setCreating(false);
      setProvisioned({ email: user.email, inviteLink });
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create tenant admin');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  const openEdit = (admin: TenantAdmin) => {
    setEditing(admin);
    setEditFullName(admin.fullName ?? '');
    setEditEmail(admin.email ?? '');
  };

  const saveEdit = async () => {
    if (!editing || !editFullName.trim() || !editEmail.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/platform/admins/${editing.id}`, {
        fullName: editFullName.trim(),
        email: editEmail.trim(),
      });
      message.success('Tenant admin updated');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update admin');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const toggleActive = async (admin: TenantAdmin) => {
    setBusyId(admin.id);
    try {
      await apiCall('PATCH', `/api/platform/admins/${admin.id}/toggle-active`);
      message.success(admin.isActive ? 'Admin banned' : 'Admin unbanned');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update admin');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Admin Name', dataIndex: 'fullName', key: 'fullName', render: (v?: string) => v || '—' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, a: TenantAdmin) => (
        <Badge status={a.isActive ? 'success' : 'error'} text={a.isActive ? 'Active' : 'Banned'} />
      ),
    },
    {
      title: 'Tenant', key: 'tenant',
      render: (_: unknown, a: TenantAdmin) => a.tenantName ? <Tag color="blue">{a.tenantName}</Tag> : '—',
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, a: TenantAdmin) => (
        readOnly ? <Text type="secondary" style={{ fontSize: 12 }}>View only</Text> : (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(a)}>Edit</Button>
            <Popconfirm
              title={a.isActive ? 'Ban this admin?' : 'Unban this admin?'}
              onConfirm={() => toggleActive(a)}
            >
              <Button size="small" danger={a.isActive} icon={a.isActive ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === a.id}>
                {a.isActive ? 'Ban' : 'Unban'}
              </Button>
            </Popconfirm>
          </Space>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />Tenant Admin
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Tenant Admin</Button>
        )}
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={admins.map((a) => ({ ...a, key: a.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Tenant Admin</span>}
        placement="right"
        open={creating}
        onClose={() => setCreating(false)}
        width={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => createForm.submit()}>
              Add Admin
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Create the first admin account for one of your tenants.
        </Text>
        <Form form={createForm} layout="vertical" onFinish={createAdmin}>
          <Form.Item
            label={<span><UserOutlined style={{ marginRight: 6 }} />Full Name</span>}
            name="fullName"
            rules={[{ required: true, message: 'Full name is required' }]}
          >
            <Input placeholder="e.g. Priya Sharma" autoFocus />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Email</span>}
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="priya@example.com" />
          </Form.Item>
          <Form.Item
            label={<span><ApartmentOutlined style={{ marginRight: 6 }} />Tenant</span>}
            name="tenantId"
            rules={[{ required: true, message: 'Select a tenant' }]}
          >
            <Select
              placeholder="Select a tenant"
              options={tenants.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item
            label={<span><LockOutlined style={{ marginRight: 6 }} />Password (optional)</span>}
            name="password"
            rules={[{ min: 8, message: 'Must be at least 8 characters' }]}
            extra="Set a password to activate the account immediately. Leave blank to get a one-time invite link they can use to set their own password."
          >
            <Input.Password placeholder="Set a password (optional)" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="Edit Tenant Admin"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editFullName.trim() || !editEmail.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Full name</Text>
            <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Email</Text>
            <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          {editing?.tenantName && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tenant: {editing.tenantName} (not editable here)
            </Text>
          )}
        </Space>
      </Modal>

      <Modal
        title="Tenant Admin Created"
        open={!!provisioned}
        onCancel={() => setProvisioned(null)}
        footer={<Button type="primary" onClick={() => setProvisioned(null)}>Done</Button>}
      >
        {provisioned && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircleFilled style={{ fontSize: 22, color: token.colorSuccess }} />
              <Text strong>{provisioned.inviteLink ? 'Invite link ready to share' : 'Account activated'}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Email</Text>
              <div><Text code>{provisioned.email}</Text></div>
            </div>
            {provisioned.inviteLink ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Invite link · expires in 7 days
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input readOnly value={provisioned.inviteLink} />
                  <Button icon={<CopyOutlined />} onClick={copyInviteLink} title="Copy link" />
                </Space.Compact>
              </div>
            ) : (
              <Alert type="success" showIcon message="This account can log in immediately with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
