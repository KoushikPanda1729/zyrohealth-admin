'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Button, Space, message, Drawer, Modal, Form, Input, Badge, Popconfirm, theme,
} from 'antd';
import {
  PlusOutlined, TeamOutlined, StopOutlined, CheckCircleOutlined, UserOutlined, MailOutlined, LockOutlined,
  CheckCircleFilled, CopyOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface StaffRow {
  id: string;
  fullName?: string;
  email?: string;
  isActive: boolean;
  shopStaffRole: 'owner' | 'cashier';
  createdAt: string;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm<{ fullName: string; email: string; password?: string }>();
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);
  const { token } = theme.useToken();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/shop/staff');
      setStaff(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load staff');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openInvite = () => { form.resetFields(); setDrawerOpen(true); };

  const inviteStaff = async (values: { fullName: string; email: string; password?: string }) => {
    setSaving(true);
    try {
      const result = await apiCall('POST', '/api/shop/staff', {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password?.trim() || undefined,
      });
      const { user, inviteLink } = result.data ?? result;
      setDrawerOpen(false);
      setProvisioned({ email: user.email, inviteLink });
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add staff account');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  const toggleActive = async (member: StaffRow) => {
    setBusyId(member.id);
    try {
      await apiCall('PATCH', `/api/shop/staff/${member.id}/toggle-active`);
      message.success(member.isActive ? 'Staff account banned' : 'Staff account unbanned');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update staff account');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'fullName', key: 'fullName', render: (v?: string) => v || '—' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role', dataIndex: 'shopStaffRole', key: 'shopStaffRole',
      render: (v: StaffRow['shopStaffRole']) => v === 'owner' ? <Text strong>Owner</Text> : <Text>Cashier</Text>,
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, s: StaffRow) => <Badge status={s.isActive ? 'success' : 'error'} text={s.isActive ? 'Active' : 'Banned'} />,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, s: StaffRow) => (
        s.shopStaffRole === 'owner' ? (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ) : (
          <Popconfirm title={s.isActive ? 'Ban this staff account?' : 'Unban this staff account?'} onConfirm={() => toggleActive(s)}>
            <Button size="small" danger={s.isActive} icon={s.isActive ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === s.id}>
              {s.isActive ? 'Ban' : 'Unban'}
            </Button>
          </Popconfirm>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <TeamOutlined style={{ marginRight: 8 }} />Staff
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openInvite}>New Staff Account</Button>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        A cashier account can bill customers at the counter and view your Medicine List, but can&apos;t edit stock,
        manage suppliers or purchase orders, see financial reports, or invite more staff — those stay with you as
        the owner.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={staff.map((s) => ({ ...s, key: s.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Staff Account</span>}
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>Add Account</Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Creates a cashier login for your shop — they&apos;ll see the same Dashboard, Prescription Requests, Medicine
          List (view only), and Billing (minus Reconciliation/Analytics) as you, just without the ability to change
          stock, suppliers, or invite anyone else.
        </Text>
        <Form form={form} layout="vertical" onFinish={inviteStaff}>
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
            <Input placeholder="cashier@example.com" />
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
        title="Staff Account Created"
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
              <Alert type="success" showIcon message="This account can log in immediately at the shop login page with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
