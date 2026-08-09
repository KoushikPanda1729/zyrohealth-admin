'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Drawer, Input,
  Checkbox, Divider, Popconfirm,
} from 'antd';
import {
  PlusOutlined, ApartmentOutlined, EditOutlined, CheckCircleOutlined, StopOutlined,
  SafetyCertificateOutlined, LoginOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;

interface Tenant {
  id: string;
  name: string;
  contactEmail?: string;
  whatsappFromNumber?: string;
  isActive: boolean;
  createdAt: string;
}

interface Permission {
  id: string;
  key: string;
  module: string;
  description: string;
}

export default function TenantsPage() {
  const router = useRouter();
  // Platform Support is a view-only tier — see AddPlatformSupportRole
  // migration & platform.routes.ts's canView/canManage split on the backend.
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [whatsappFromNumber, setWhatsappFromNumber] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);

  const [provisioned, setProvisioned] = useState<{
    tenantName: string;
    adminEmail: string;
    tempPassword: string;
  } | null>(null);

  const [editingEntitlements, setEditingEntitlements] = useState<Tenant | null>(
    null,
  );
  const [entitlementModules, setEntitlementModules] = useState<string[]>([]);
  const [entitlementsSaving, setEntitlementsSaving] = useState(false);

  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editWhatsappFromNumber, setEditWhatsappFromNumber] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantsResult, catalogResult] = await Promise.all([
        apiCall('GET', '/api/platform/tenants'),
        apiCall('GET', '/api/platform/permissions'),
      ]);
      setTenants(tenantsResult.data ?? tenantsResult);
      setCatalog(catalogResult.data ?? catalogResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load tenants');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const modulesByGroup = catalog.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const createTenant = async () => {
    if (!name.trim() || !adminEmail.trim() || !adminFullName.trim()) return;
    setCreateSaving(true);
    try {
      const result = await apiCall('POST', '/api/platform/tenants', {
        name: name.trim(),
        contactEmail: contactEmail.trim() || undefined,
        whatsappFromNumber: whatsappFromNumber.trim() || undefined,
        moduleKeys: selectedModules,
        adminEmail: adminEmail.trim(),
        adminFullName: adminFullName.trim(),
      });
      const { tenant, adminUser, tempPassword } = result.data ?? result;
      setCreating(false);
      setName(''); setContactEmail(''); setWhatsappFromNumber('');
      setAdminEmail(''); setAdminFullName(''); setSelectedModules([]);
      setProvisioned({
        tenantName: tenant.name,
        adminEmail: adminUser.email,
        tempPassword,
      });
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create tenant');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const toggleActive = async (tenant: Tenant) => {
    setBusyId(tenant.id);
    try {
      await apiCall('PATCH', `/api/platform/tenants/${tenant.id}`, {
        isActive: !tenant.isActive,
      });
      message.success(tenant.isActive ? 'Tenant deactivated' : 'Tenant activated');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update tenant');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const switchToTenant = async (tenant: Tenant) => {
    setSwitchingId(tenant.id);
    try {
      const result = await apiCall('POST', `/api/platform/tenants/${tenant.id}/impersonate`);
      const { user, accessToken, refreshToken } = result.data ?? result;

      // Stash the super admin's own session so "Switch back to Platform"
      // can restore it, then swap in the tenant admin's session. Also
      // stash the full tenant list so the quick-switch dropdown in the
      // impersonation banner doesn't need a super_admin-only API call.
      localStorage.setItem('platformToken', localStorage.getItem('token') || '');
      localStorage.setItem('platformRefreshToken', localStorage.getItem('refreshToken') || '');
      localStorage.setItem('platformUser', localStorage.getItem('user') || '');
      localStorage.setItem('impersonatingTenantName', tenant.name);
      localStorage.setItem('impersonatingTenantId', tenant.id);
      localStorage.setItem(
        'platformTenants',
        JSON.stringify(tenants.map((t) => ({ id: t.id, name: t.name }))),
      );

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      router.push('/dashboard');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to switch to tenant');
      else message.error('An unexpected error occurred');
    } finally { setSwitchingId(null); }
  };

  const openEditEntitlements = async (tenant: Tenant) => {
    setEditingEntitlements(tenant);
    try {
      const result = await apiCall('GET', `/api/platform/tenants/${tenant.id}`);
      const detail = result.data ?? result;
      setEntitlementModules(detail.enabledModules ?? []);
    } catch {
      setEntitlementModules([]);
    }
  };

  const saveEntitlements = async () => {
    if (!editingEntitlements) return;
    setEntitlementsSaving(true);
    try {
      await apiCall('PUT', `/api/platform/tenants/${editingEntitlements.id}/entitlements`, {
        moduleKeys: entitlementModules,
      });
      message.success('Entitlements updated');
      setEditingEntitlements(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update entitlements');
      else message.error('An unexpected error occurred');
    } finally { setEntitlementsSaving(false); }
  };

  const openEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setEditName(tenant.name);
    setEditContactEmail(tenant.contactEmail ?? '');
    setEditWhatsappFromNumber(tenant.whatsappFromNumber ?? '');
  };

  const saveEditTenant = async () => {
    if (!editingTenant || !editName.trim()) return;
    setEditSaving(true);
    try {
      await apiCall('PATCH', `/api/platform/tenants/${editingTenant.id}`, {
        name: editName.trim(),
        contactEmail: editContactEmail.trim() || undefined,
        whatsappFromNumber: editWhatsappFromNumber.trim() || undefined,
      });
      message.success('Tenant updated');
      setEditingTenant(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update tenant');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const renderModuleCheckboxes = (
    value: string[],
    onChange: (v: string[]) => void,
  ) => (
    <Checkbox.Group value={value} onChange={(v) => onChange(v as string[])} style={{ width: '100%' }}>
      {Object.entries(modulesByGroup).map(([mod, perms]) => (
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
  );

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Contact Email', dataIndex: 'contactEmail', key: 'contactEmail', render: (v?: string) => v || '—' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, t: Tenant) => (
        t.isActive
          ? <Tag icon={<CheckCircleOutlined />} color="green">Active</Tag>
          : <Tag color="default">Inactive</Tag>
      ),
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, t: Tenant) => (
        <Space>
          {!readOnly && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditTenant(t)}>Edit</Button>
          )}
          {!readOnly && (
            <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openEditEntitlements(t)}>
              Modules
            </Button>
          )}
          {!readOnly && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<LoginOutlined />}
              loading={switchingId === t.id}
              disabled={!t.isActive}
              onClick={() => switchToTenant(t)}
            >
              Switch to Tenant
            </Button>
          )}
          {!readOnly && (
            <Popconfirm
              title={t.isActive ? 'Deactivate this tenant?' : 'Activate this tenant?'}
              onConfirm={() => toggleActive(t)}
            >
              <Button size="small" danger={t.isActive} icon={t.isActive ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === t.id}>
                {t.isActive ? 'Deactivate' : 'Activate'}
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
          <ApartmentOutlined style={{ marginRight: 8 }} />Tenants
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New Tenant</Button>
        )}
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {tenants.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No tenants yet"
          description="Create a tenant to onboard a new client — pick which modules they're entitled to, and their first admin account gets provisioned automatically."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={tenants.map((t) => ({ ...t, key: t.id }))} bordered size="middle" />
      )}

      <Drawer
        title={<span><ApartmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Tenant</span>}
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
              disabled={!name.trim() || !adminEmail.trim() || !adminFullName.trim()}
              onClick={createTenant}
            >
              Create
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13 }}>Tenant name</Text>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Apollo Clinic" style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Contact email</Text>
            <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="ops@client.com" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>WhatsApp number (optional)</Text>
            <Input value={whatsappFromNumber} onChange={(e) => setWhatsappFromNumber(e.target.value)} placeholder="+1415..." style={{ marginTop: 4 }} />
            <Text type="secondary" style={{ fontSize: 11 }}>Leave blank to share the default number for now.</Text>
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>First admin account</Text>
            <Input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} placeholder="Full name" style={{ marginTop: 4, marginBottom: 8 }} />
            <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Email" />
          </div>
          <Divider style={{ margin: '4px 0' }} />
          <div>
            <Text strong style={{ fontSize: 13 }}>Enabled modules</Text>
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <Space wrap size="small">
                <Button size="small" onClick={() => setSelectedModules(catalog.map((p) => p.key))}>
                  Select All
                </Button>
                <Button size="small" onClick={() => setSelectedModules([])}>Clear</Button>
              </Space>
            </div>
            <div style={{ marginTop: 4 }}>
              {renderModuleCheckboxes(selectedModules, setSelectedModules)}
            </div>
          </div>
        </Space>
      </Drawer>

      <Modal
        title="Tenant Created"
        open={!!provisioned}
        onCancel={() => setProvisioned(null)}
        footer={<Button type="primary" onClick={() => setProvisioned(null)}>Done</Button>}
      >
        {provisioned && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              <Text strong>{provisioned.tenantName}</Text> is ready. Share these one-time credentials with the client
              &mdash; the password won&apos;t be shown again:
            </Text>
            <Alert
              type="warning"
              message={
                <div>
                  <div>Email: <Text code>{provisioned.adminEmail}</Text></div>
                  <div>Temporary password: <Text code copyable>{provisioned.tempPassword}</Text></div>
                </div>
              }
            />
          </Space>
        )}
      </Modal>

      <Drawer
        title={<span><SafetyCertificateOutlined style={{ marginRight: 8, color: '#1677ff' }} />Modules — {editingEntitlements?.name ?? ''}</span>}
        placement="right"
        open={!!editingEntitlements}
        onClose={() => setEditingEntitlements(null)}
        size={480}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setEditingEntitlements(null)}>Cancel</Button>
            <Button type="primary" loading={entitlementsSaving} onClick={saveEntitlements}>Save</Button>
          </Space>
        }
      >
        <Space wrap size="small" style={{ marginBottom: 8 }}>
          <Button size="small" onClick={() => setEntitlementModules(catalog.map((p) => p.key))}>Select All</Button>
          <Button size="small" onClick={() => setEntitlementModules([])}>Clear</Button>
        </Space>
        {renderModuleCheckboxes(entitlementModules, setEntitlementModules)}
        <Text type="secondary" style={{ fontSize: 11 }}>
          Revoking a module immediately strips it from any of this tenant&apos;s custom staff roles that reference it.
        </Text>
      </Drawer>

      <Modal
        title="Edit Tenant"
        open={!!editingTenant}
        onCancel={() => setEditingTenant(null)}
        onOk={saveEditTenant}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editName.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Tenant name</Text>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Contact email</Text>
            <Input value={editContactEmail} onChange={(e) => setEditContactEmail(e.target.value)} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>WhatsApp number</Text>
            <Input value={editWhatsappFromNumber} onChange={(e) => setEditWhatsappFromNumber(e.target.value)} style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
