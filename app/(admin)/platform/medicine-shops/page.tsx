'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Modal, Drawer, Form, Input, Divider, Checkbox, message, theme,
} from 'antd';
import {
  ShopOutlined, LoginOutlined, PlusOutlined, PhoneOutlined, MailOutlined, EnvironmentOutlined, UserOutlined,
  LockOutlined, CheckCircleFilled, CopyOutlined, SafetyCertificateOutlined, TeamOutlined, GlobalOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;

interface MedicineShopRow {
  id: string;
  name: string;
  tenantId: string;
  tenantName?: string;
  contactPhone: string;
  city?: string;
  isActive: boolean;
  whatsappLinked: boolean;
  whatsappModuleEnabled: boolean;
  whatsappModuleFromNumber?: string;
  ownershipType: 'in_house' | 'third_party';
  isStandaloneMedicineShop?: boolean;
  createdAt: string;
}

interface TenantRow {
  id: string;
  name: string;
}

interface Permission {
  id: string;
  key: string;
  module: string;
  description: string;
}

interface CreateShopFormValues {
  shopName: string;
  contactPhone: string;
  contactEmail?: string;
  addressLine1?: string;
  city?: string;
  loginFullName: string;
  loginEmail: string;
  loginPassword?: string;
}

// Platform-wide, read-only registry of every medicine shop across every
// tenant — a shop is always onboarded under exactly one tenant (see
// MedicineShop.tenantId), so there's no separate top-level entity to
// manage here for shops already attached to a clinic. What this page
// ADDS on top of that is "+ New Medicine Shop": provisioning a genuinely
// standalone pharmacy — one with no clinic behind it — which needs its
// own dedicated tenant (scoped to only the medicine_shops.* module) and
// a shop-role login, created together in one step.
export default function PlatformMedicineShopsPage() {
  const router = useRouter();
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);
  const [shops, setShops] = useState<MedicineShopRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const { token } = theme.useToken();

  const [editingEntitlements, setEditingEntitlements] = useState<MedicineShopRow | null>(null);
  const [entitlementModules, setEntitlementModules] = useState<string[]>([]);
  const [entitlementsSaving, setEntitlementsSaving] = useState(false);

  const [waModuleShop, setWaModuleShop] = useState<MedicineShopRow | null>(null);
  const [waModuleEnabled, setWaModuleEnabled] = useState(false);
  const [waModuleNumber, setWaModuleNumber] = useState('');
  const [waModuleSaving, setWaModuleSaving] = useState(false);

  const [invitingAdminFor, setInvitingAdminFor] = useState<MedicineShopRow | null>(null);
  const [inviteAdminForm] = Form.useForm<{ fullName: string; email: string; password?: string }>();
  const [inviteAdminSaving, setInviteAdminSaving] = useState(false);
  const [provisionedAdmin, setProvisionedAdmin] = useState<{ email: string; inviteLink?: string } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CreateShopFormValues>();
  const [provisioned, setProvisioned] = useState<{
    shopName: string;
    tenantName: string;
    email: string;
    inviteLink?: string;
  } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [shopsResult, tenantsResult, catalogResult] = await Promise.all([
        apiCall('GET', '/api/platform/medicine-shops'),
        apiCall('GET', '/api/platform/tenants'),
        apiCall('GET', '/api/platform/permissions'),
      ]);
      setShops(shopsResult.data ?? shopsResult);
      setTenants(tenantsResult.data ?? tenantsResult);
      setCatalog(catalogResult.data ?? catalogResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load medicine shops');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    form.resetFields();
    setDrawerOpen(true);
  };

  const createStandaloneShop = async (values: CreateShopFormValues) => {
    setSaving(true);
    try {
      const result = await apiCall('POST', '/api/platform/medicine-shops', values);
      const { tenant, shop, user, inviteLink } = result.data ?? result;
      setDrawerOpen(false);
      setProvisioned({ shopName: shop.name, tenantName: tenant.name, email: user.email, inviteLink });
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to onboard medicine shop');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  // A standalone shop's tenant already has a dormant "Admin" role seeded
  // (see createStandaloneMedicineShop) for exactly this — this reuses the
  // same endpoint the generic Tenant Admin page uses, just scoped to this
  // one tenant directly instead of picking it from a dropdown (that
  // dropdown only lists real clinics, since standalone shops are
  // deliberately hidden from the Tenants page).
  const openInviteAdmin = (shop: MedicineShopRow) => {
    setInvitingAdminFor(shop);
    inviteAdminForm.resetFields();
  };

  const inviteAdminLogin = async (values: { fullName: string; email: string; password?: string }) => {
    if (!invitingAdminFor) return;
    setInviteAdminSaving(true);
    try {
      const result = await apiCall('POST', '/api/platform/admins', {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        tenantId: invitingAdminFor.tenantId,
        password: values.password?.trim() || undefined,
      });
      const { user, inviteLink } = result.data ?? result;
      setInvitingAdminFor(null);
      setProvisionedAdmin({ email: user.email, inviteLink });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create admin login');
      else message.error('An unexpected error occurred');
    } finally { setInviteAdminSaving(false); }
  };

  const copyAdminInviteLink = () => {
    if (!provisionedAdmin?.inviteLink) return;
    navigator.clipboard.writeText(provisionedAdmin.inviteLink);
    message.success('Invite link copied');
  };

  // Same impersonation mechanism as the Tenants page's "Switch to Tenant"
  // — but lands directly on that tenant's own shop-management surface
  // instead of a generic dashboard. A tenant with a real admin account
  // (a shop onboarded as a clinic's vendor) lands on the admin panel's
  // Medicine Shops page; a standalone pharmacy tenant has no admin at all
  // — only its shop-role login — so it lands in the dedicated shop portal.
  const manageInTenant = async (shop: MedicineShopRow) => {
    setSwitchingId(shop.id);
    try {
      const result = await apiCall('POST', `/api/platform/tenants/${shop.tenantId}/impersonate`);
      const { user, accessToken, refreshToken } = result.data ?? result;

      localStorage.setItem('platformToken', localStorage.getItem('token') || '');
      localStorage.setItem('platformRefreshToken', localStorage.getItem('refreshToken') || '');
      localStorage.setItem('platformUser', localStorage.getItem('user') || '');
      localStorage.setItem('impersonatingTenantName', shop.tenantName ?? '');
      localStorage.setItem('impersonatingTenantId', shop.tenantId);
      localStorage.setItem('platformTenants', JSON.stringify(tenants));

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));

      router.push(user.role === 'shop' ? '/shop-dashboard' : '/medicine-shops');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to switch to tenant');
      else message.error('An unexpected error occurred');
    } finally { setSwitchingId(null); }
  };

  // This page only ever edits a standalone shop's tenant, and only the
  // medicine_shops.* keys do anything for a shop-role login (see
  // (shop)/layout.tsx's hardcoded menu + the admin-panel's role guard) —
  // so the checklist only shows those, instead of every module in the
  // system like the generic Tenants page's editor does.
  const medicineShopPermissions = catalog.filter((p) => p.module === 'medicine_shops');
  const modulesByGroup = medicineShopPermissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const renderModuleCheckboxes = (value: string[], onChange: (v: string[]) => void) => (
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

  // A standalone pharmacy's tenant only has this page as its "home" — the
  // generic Tenants (Home) page never shows it (see isStandaloneMedicineShop),
  // so module entitlements need to be editable right here instead.
  const openEditEntitlements = async (shop: MedicineShopRow) => {
    setEditingEntitlements(shop);
    try {
      const result = await apiCall('GET', `/api/platform/tenants/${shop.tenantId}`);
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
      await apiCall('PUT', `/api/platform/tenants/${editingEntitlements.tenantId}/entitlements`, {
        moduleKeys: entitlementModules,
      });
      message.success('Modules updated');
      setEditingEntitlements(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update modules');
      else message.error('An unexpected error occurred');
    } finally { setEntitlementsSaving(false); }
  };

  const openWaModule = (shop: MedicineShopRow) => {
    setWaModuleShop(shop);
    setWaModuleEnabled(shop.whatsappModuleEnabled);
    setWaModuleNumber(shop.whatsappModuleFromNumber ?? '');
  };

  const saveWaModule = async () => {
    if (!waModuleShop) return;
    setWaModuleSaving(true);
    try {
      await apiCall('PATCH', `/api/platform/medicine-shops/${waModuleShop.id}/whatsapp-module`, {
        enabled: waModuleEnabled,
        fromNumber: waModuleNumber.trim() || undefined,
      });
      message.success(waModuleEnabled ? 'WhatsApp module enabled' : 'WhatsApp module disabled');
      setWaModuleShop(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update WhatsApp module');
      else message.error('An unexpected error occurred');
    } finally { setWaModuleSaving(false); }
  };

  const columns = [
    { title: 'Shop', dataIndex: 'name', key: 'name' },
    { title: 'Tenant', dataIndex: 'tenantName', key: 'tenantName', render: (v?: string) => v || '—' },
    { title: 'Phone', dataIndex: 'contactPhone', key: 'contactPhone' },
    { title: 'City', dataIndex: 'city', key: 'city', render: (v?: string) => v || '—' },
    {
      title: 'Ownership', dataIndex: 'ownershipType', key: 'ownershipType',
      render: (v: MedicineShopRow['ownershipType']) => (
        <Tag color={v === 'in_house' ? 'purple' : 'default'}>{v === 'in_house' ? 'In-House' : 'Third-Party'}</Tag>
      ),
    },
    {
      title: 'Status', key: 'isActive',
      render: (_: unknown, s: MedicineShopRow) => (
        <Tag color={s.isActive ? 'green' : 'default'}>{s.isActive ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'WhatsApp', key: 'whatsappLinked',
      render: (_: unknown, s: MedicineShopRow) => (
        s.whatsappLinked ? <Tag color="blue">Linked</Tag> : <Tag>Not linked yet</Tag>
      ),
    },
    {
      title: 'WA Module', key: 'whatsappModuleEnabled',
      render: (_: unknown, s: MedicineShopRow) => (
        s.whatsappModuleEnabled ? <Tag color="green">Enabled</Tag> : <Tag>Off</Tag>
      ),
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, s: MedicineShopRow) => (
        readOnly ? <Text type="secondary" style={{ fontSize: 12 }}>View only</Text> : (
          <Space>
            {s.isStandaloneMedicineShop && (
              <>
                <Button size="small" icon={<SafetyCertificateOutlined />} onClick={() => openEditEntitlements(s)}>
                  Modules
                </Button>
                <Button size="small" icon={<TeamOutlined />} onClick={() => openInviteAdmin(s)}>
                  Invite Admin Login
                </Button>
                <Button size="small" icon={<GlobalOutlined />} onClick={() => openWaModule(s)}>
                  WA Module
                </Button>
              </>
            )}
            <Button
              size="small"
              type="primary"
              ghost
              icon={<LoginOutlined />}
              loading={switchingId === s.id}
              onClick={() => manageInTenant(s)}
            >
              Manage in Tenant
            </Button>
          </Space>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ShopOutlined style={{ marginRight: 8 }} />Medicine Shops
        </Title>
        {!readOnly && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Medicine Shop</Button>
        )}
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Every medicine shop across every tenant — shops a clinic has onboarded as a vendor, plus any standalone
        pharmacy you&apos;ve signed up directly. Use &quot;New Medicine Shop&quot; for the latter (a real pharmacy
        business with no clinic behind it); for a shop already tied to a clinic, manage it from that clinic&apos;s
        own Medicine Shops page via &quot;Manage in Tenant&quot;.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {shops.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No medicine shops onboarded yet"
          description="A clinic can onboard a shop as a quoting vendor from its own Medicine Shops page, or you can onboard a standalone pharmacy directly with the button above."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={shops.map((s) => ({ ...s, key: s.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      {/* Onboards a genuinely standalone pharmacy — creates its own
          dedicated tenant (scoped to only medicine_shops.*), the shop
          record, and a shop-role login, all in one step. */}
      <Drawer
        title={<span><ShopOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Standalone Medicine Shop</span>}
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={440}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>Onboard</Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 12 }}>
          This creates a brand new, self-contained tenant for this pharmacy — it&apos;s not tied to any existing
          clinic. Their login lands them in the dedicated shop portal (dashboard, prescription requests, full
          inventory management), not the general admin panel.
        </Text>
        <Form form={form} layout="vertical" onFinish={createStandaloneShop}>
          <Form.Item
            label={<span><ShopOutlined style={{ marginRight: 6 }} />Shop / Business Name</span>}
            name="shopName"
            rules={[{ required: true, message: 'Shop name is required' }]}
          >
            <Input placeholder="e.g. Green Cross Pharmacy" autoFocus />
          </Form.Item>
          <Form.Item
            label={<span><PhoneOutlined style={{ marginRight: 6 }} />WhatsApp Number</span>}
            name="contactPhone"
            rules={[{ required: true, message: 'Contact phone is required' }]}
          >
            <Input placeholder="+91 98765 43210" />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Contact Email (optional)</span>}
            name="contactEmail"
            rules={[{ type: 'email', message: 'Enter a valid email' }]}
          >
            <Input placeholder="shop@example.com" />
          </Form.Item>
          <Form.Item
            label={<span><EnvironmentOutlined style={{ marginRight: 6 }} />Address (optional)</span>}
            name="addressLine1"
          >
            <Input placeholder="Street address" />
          </Form.Item>
          <Form.Item label="City (optional)" name="city">
            <Input placeholder="e.g. Bengaluru" />
          </Form.Item>

          <Divider style={{ margin: '4px 0 16px' }} />
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>Shop Portal Login</Text>

          <Form.Item
            label={<span><UserOutlined style={{ marginRight: 6 }} />Contact Person</span>}
            name="loginFullName"
            rules={[{ required: true, message: 'Full name is required' }]}
          >
            <Input placeholder="e.g. Ramesh Kumar" />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Login Email</span>}
            name="loginEmail"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="owner@example.com" />
          </Form.Item>
          <Form.Item
            label={<span><LockOutlined style={{ marginRight: 6 }} />Password (optional)</span>}
            name="loginPassword"
            rules={[{ min: 8, message: 'Must be at least 8 characters' }]}
            extra="Set a password to activate the login immediately. Leave blank to get a one-time invite link they can use to set their own password."
          >
            <Input.Password placeholder="Set a password (optional)" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="Medicine Shop Onboarded"
        open={!!provisioned}
        onCancel={() => setProvisioned(null)}
        footer={<Button type="primary" onClick={() => setProvisioned(null)}>Done</Button>}
      >
        {provisioned && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircleFilled style={{ fontSize: 22, color: token.colorSuccess }} />
              <Text strong>
                {provisioned.shopName} is ready (new tenant: {provisioned.tenantName})
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Login email</Text>
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
              <Alert type="success" showIcon message="This shop can log in immediately at the medicine shop portal with the password you set." />
            )}
          </Space>
        )}
      </Modal>

      <Modal
        title={<span><GlobalOutlined style={{ marginRight: 8 }} />WhatsApp Module — {waModuleShop?.name ?? ''}</span>}
        open={!!waModuleShop}
        onCancel={() => setWaModuleShop(null)}
        onOk={saveWaModule}
        okText="Save"
        confirmLoading={waModuleSaving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary" style={{ fontSize: 12 }}>
            Grants this shop its own independent WhatsApp Business presence — a dedicated number their customers
            message directly, with their own provider account and flow builder, separate from the regular
            shop-quotes-a-tenant&apos;s-prescription-requests relationship.
          </Text>
          <Checkbox checked={waModuleEnabled} onChange={(e) => setWaModuleEnabled(e.target.checked)}>
            Enabled
          </Checkbox>
          <div>
            <Text strong style={{ fontSize: 13 }}>Registered number (for routing)</Text>
            <Input
              value={waModuleNumber}
              onChange={(e) => setWaModuleNumber(e.target.value)}
              placeholder="+919876543210"
              style={{ marginTop: 4 }}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              The real phone number the shop&apos;s own module will run on — used only to route incoming webhook
              messages to this shop instead of a tenant. The shop still needs to enter their own Twilio/Meta
              credentials in their own portal before the number actually works.
            </Text>
          </div>
        </Space>
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
          <Button size="small" onClick={() => setEntitlementModules(medicineShopPermissions.map((p) => p.key))}>Select All</Button>
          <Button size="small" onClick={() => setEntitlementModules([])}>Clear</Button>
        </Space>
        {renderModuleCheckboxes(entitlementModules, setEntitlementModules)}
        <Text type="secondary" style={{ fontSize: 11 }}>
          Unchecking both would lock this shop out of its own portal entirely.
        </Text>
      </Drawer>

      {/* A second, admin-style login for a standalone shop's tenant — the
          shop-role login only ever sees the shop portal, so this is the
          only way anyone gets an admin panel view of this tenant (whatever
          it's entitled to via Modules above). */}
      <Drawer
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />Invite Admin Login — {invitingAdminFor?.name}</span>}
        placement="right"
        open={!!invitingAdminFor}
        onClose={() => setInvitingAdminFor(null)}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setInvitingAdminFor(null)}>Cancel</Button>
            <Button type="primary" loading={inviteAdminSaving} onClick={() => inviteAdminForm.submit()}>
              Create Login
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          This creates a separate, admin-style login for this shop&apos;s tenant — landing in the regular admin
          panel, following whatever&apos;s enabled in Modules, rather than the shop portal.
        </Text>
        <Form form={inviteAdminForm} layout="vertical" onFinish={inviteAdminLogin}>
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
            <Input placeholder="owner@example.com" />
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
        title="Admin Login Created"
        open={!!provisionedAdmin}
        onCancel={() => setProvisionedAdmin(null)}
        footer={<Button type="primary" onClick={() => setProvisionedAdmin(null)}>Done</Button>}
      >
        {provisionedAdmin && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircleFilled style={{ fontSize: 22, color: token.colorSuccess }} />
              <Text strong>{provisionedAdmin.inviteLink ? 'Invite link ready to share' : 'Account activated'}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Email</Text>
              <div><Text code>{provisionedAdmin.email}</Text></div>
            </div>
            {provisionedAdmin.inviteLink ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Invite link · expires in 7 days
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input readOnly value={provisionedAdmin.inviteLink} />
                  <Button icon={<CopyOutlined />} onClick={copyAdminInviteLink} title="Copy link" />
                </Space.Compact>
              </div>
            ) : (
              <Alert type="success" showIcon message="This account can log in immediately at the regular admin login with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
