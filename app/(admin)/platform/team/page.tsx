'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Button, Space, message, Modal, Drawer, Input, Badge, Popconfirm, Form, theme,
} from 'antd';
import {
  PlusOutlined, SafetyCertificateOutlined, StopOutlined, CheckCircleOutlined,
  UserOutlined, MailOutlined, LockOutlined, CheckCircleFilled, CopyOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../lib/api';

const { Title, Text } = Typography;

interface PlatformSupportAccount {
  id: string;
  fullName?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
}

export default function PlatformTeamPage() {
  const [accounts, setAccounts] = useState<PlatformSupportAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);
  const { token } = theme.useToken();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/platform/support-accounts');
      setAccounts(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load platform team');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    createForm.resetFields();
    setCreating(true);
  };

  const createAccount = async (values: { fullName: string; email: string; password?: string }) => {
    setSaving(true);
    try {
      const result = await apiCall('POST', '/api/platform/support-accounts', {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password?.trim() || undefined,
      });
      const { user, inviteLink } = result.data ?? result;
      setCreating(false);
      setProvisioned({ email: user.email, inviteLink });
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create account');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  const toggleActive = async (account: PlatformSupportAccount) => {
    setBusyId(account.id);
    try {
      await apiCall('PATCH', `/api/platform/support-accounts/${account.id}/toggle-active`);
      message.success(account.isActive ? 'Account banned' : 'Account unbanned');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update account');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'fullName', key: 'fullName', render: (v?: string) => v || '—' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, a: PlatformSupportAccount) => (
        <Badge status={a.isActive ? 'success' : 'error'} text={a.isActive ? 'Active' : 'Banned'} />
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, a: PlatformSupportAccount) => (
        <Popconfirm
          title={a.isActive ? 'Ban this account?' : 'Unban this account?'}
          onConfirm={() => toggleActive(a)}
        >
          <Button size="small" danger={a.isActive} icon={a.isActive ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === a.id}>
            {a.isActive ? 'Ban' : 'Unban'}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />Platform Team
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Support Account</Button>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Platform Support accounts can view every tenant and medicine shop for troubleshooting, but can't create, edit, deactivate, impersonate, or invite anything — and can't see or manage this page."
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={accounts.map((a) => ({ ...a, key: a.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Support Account</span>}
        placement="right"
        open={creating}
        onClose={() => setCreating(false)}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => createForm.submit()}>
              Add Account
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Grants view-only access to every tenant and medicine shop across the platform.
        </Text>
        <Form form={createForm} layout="vertical" onFinish={createAccount}>
          <Form.Item
            label={<span><UserOutlined style={{ marginRight: 6 }} />Full Name</span>}
            name="fullName"
            rules={[{ required: true, message: 'Full name is required' }]}
          >
            <Input placeholder="e.g. Arjun Mehta" autoFocus />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Email</span>}
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="arjun@example.com" />
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
        title="Support Account Created"
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
