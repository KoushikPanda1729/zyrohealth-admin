'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Popconfirm, message, Modal, Drawer, Input, Checkbox, Select, Form, theme,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, SafetyCertificateOutlined, UserAddOutlined,
  UserOutlined, MailOutlined, ClusterOutlined, LockOutlined, CheckCircleFilled, CopyOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface RoleRow {
  id: string;
  name: string;
  isSystem: boolean;
  updatedAt: string;
}

interface Permission {
  id: string;
  key: string;
  module: string;
  description: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [available, setAvailable] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [isCreate, setIsCreate] = useState(false);
  const [name, setName] = useState('');
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [inviteForm] = Form.useForm();
  const [inviteSaving, setInviteSaving] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);
  const { token } = theme.useToken();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesResult, availableResult] = await Promise.all([
        apiCall('GET', '/api/admin/roles'),
        apiCall('GET', '/api/admin/roles/available-permissions'),
      ]);
      setRoles(rolesResult.data ?? rolesResult);
      setAvailable(availableResult.data ?? availableResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load roles');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }

    // Separate from the block above — a tenant admin might have
    // roles.manage without users.manage, and departments are optional
    // context for the invite form, not something worth failing the page over.
    try {
      const departmentsResult = await apiCall('GET', '/api/admin/departments');
      setDepartments(departmentsResult.data ?? departmentsResult);
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const availableByModule = available.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const openCreate = () => {
    setIsCreate(true);
    setEditing(null);
    setName('');
    setPermissionKeys([]);
  };

  const openEdit = async (role: RoleRow) => {
    setIsCreate(false);
    setEditing(role);
    setName(role.name);
    try {
      const result = await apiCall('GET', `/api/admin/roles/${role.id}`);
      const detail = result.data ?? result;
      setPermissionKeys(detail.permissionKeys ?? []);
    } catch {
      setPermissionKeys([]);
    }
  };

  const closeModal = () => { setIsCreate(false); setEditing(null); };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isCreate) {
        await apiCall('POST', '/api/admin/roles', { name: name.trim(), permissionKeys });
        message.success('Role created');
      } else if (editing) {
        await apiCall('PATCH', `/api/admin/roles/${editing.id}`, { name: name.trim(), permissionKeys });
        message.success('Role updated');
      }
      closeModal();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save role');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const openInvite = () => {
    inviteForm.resetFields();
    setInviting(true);
  };

  const inviteStaff = async (values: {
    fullName: string;
    email: string;
    roleId: string;
    departmentId?: string;
    password?: string;
  }) => {
    setInviteSaving(true);
    try {
      const result = await apiCall('POST', '/api/admin/staff', {
        email: values.email.trim(),
        fullName: values.fullName.trim(),
        roleId: values.roleId,
        departmentId: values.departmentId,
        password: values.password?.trim() || undefined,
      });
      const { user, inviteLink } = result.data ?? result;
      setInviting(false);
      setProvisioned({ email: user.email, inviteLink });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to invite staff');
      else message.error('An unexpected error occurred');
    } finally { setInviteSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  const deleteRole = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/admin/roles/${id}`);
      message.success('Role deleted');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete role');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Type', key: 'type',
      render: (_: unknown, r: RoleRow) => (
        r.isSystem ? <Tag color="blue">System</Tag> : <Tag color="default">Custom</Tag>
      ),
    },
    {
      title: 'Last Updated', dataIndex: 'updatedAt', key: 'updatedAt',
      render: (v: string) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: RoleRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          {!r.isSystem && (
            <Popconfirm title="Delete this role?" onConfirm={() => deleteRole(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === r.id}>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8 }} />Roles &amp; Permissions
        </Title>
        <Space>
          <Button icon={<UserAddOutlined />} onClick={openInvite} disabled={roles.length === 0}>Invite Staff</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Role</Button>
        </Space>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {available.length === 0 && !loading && !error && (
        <Alert
          type="warning"
          showIcon
          message="No modules enabled"
          description="Your tenant isn't entitled to any modules yet — ask your platform admin to enable some before creating roles."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={roles.map((r) => ({ ...r, key: r.id }))} bordered size="middle" />
      )}

      <Modal
        title={isCreate ? 'New Role' : `Edit Role — ${editing?.name ?? ''}`}
        open={isCreate || !!editing}
        onCancel={closeModal}
        onOk={save}
        okText="Save"
        confirmLoading={saving}
        okButtonProps={{ disabled: !name.trim() }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Role name</Text>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Receptionist"
              style={{ marginTop: 4 }}
              autoFocus
              disabled={editing?.isSystem}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Permissions</Text>
            <div style={{ marginTop: 4 }}>
              <Checkbox.Group
                value={permissionKeys}
                onChange={(v) => setPermissionKeys(v as string[])}
                style={{ width: '100%' }}
              >
                {Object.entries(availableByModule).map(([mod, perms]) => (
                  <div key={mod} style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: '#888' }}>
                      {mod.replace(/_/g, ' ')}
                    </Text>
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                      {perms.map((p) => (
                        <Checkbox key={p.key} value={p.key}>
                          <Text style={{ fontSize: 13 }}>{p.description}</Text>
                        </Checkbox>
                      ))}
                    </div>
                  </div>
                ))}
              </Checkbox.Group>
            </div>
          </div>
        </Space>
      </Modal>

      <Drawer
        title={<span><UserAddOutlined style={{ marginRight: 8, color: '#1677ff' }} />Invite Staff</span>}
        placement="right"
        open={inviting}
        onClose={() => setInviting(false)}
        width={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setInviting(false)}>Cancel</Button>
            <Button type="primary" loading={inviteSaving} onClick={() => inviteForm.submit()}>
              Invite
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Create a new staff account under one of your tenant&apos;s custom roles.
        </Text>
        <Form form={inviteForm} layout="vertical" onFinish={inviteStaff}>
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
            label={<span><SafetyCertificateOutlined style={{ marginRight: 6 }} />Role</span>}
            name="roleId"
            rules={[{ required: true, message: 'Select a role' }]}
          >
            <Select
              placeholder="Select a role"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
            />
          </Form.Item>
          <Form.Item
            label={<span><ClusterOutlined style={{ marginRight: 6 }} />Department (optional)</span>}
            name="departmentId"
          >
            <Select
              placeholder="Select a department"
              allowClear
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>No departments yet — create one under Departments.</Text>}
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
              <Alert type="success" showIcon message="This account can log in immediately with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
