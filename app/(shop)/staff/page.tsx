'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Button, Space, message, Drawer, Modal, Form, Input, Badge, Popconfirm, theme,
  Tabs, Select, Checkbox, DatePicker, InputNumber, Switch, Tag, Card, Statistic, Row, Col, Empty, Divider, Radio,
} from 'antd';
import {
  PlusOutlined, TeamOutlined, StopOutlined, CheckCircleOutlined, UserOutlined, MailOutlined, LockOutlined,
  CheckCircleFilled, CopyOutlined, SafetyCertificateOutlined, CalendarOutlined, FileDoneOutlined, DollarOutlined,
  EditOutlined, DeleteOutlined, LoginOutlined, LogoutOutlined, DownloadOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs, { Dayjs } from 'dayjs';
import { apiCall } from '../../../lib/api';
import { downloadFile } from '../../../lib/downloadFile';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

function errMsg(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback;
}

// Maps a permission key's prefix (e.g. "shop_catalog") to a friendly
// module label for grouping the permission checkboxes in the role editor.
const PERMISSION_GROUP_LABELS: Record<string, string> = {
  shop_catalog: 'Catalog',
  shop_suppliers: 'Suppliers',
  shop_purchase_orders: 'Purchase Orders',
  shop_supplier_prices: 'Distributor Prices',
  shop_reports: 'Reports',
  shop_staff: 'Staff Administration',
  shop_attendance: 'Attendance',
  shop_leave: 'Leave',
  shop_payroll: 'Payroll',
};

interface StaffRow {
  id: string;
  fullName?: string;
  email?: string;
  isActive: boolean;
  shopStaffRole: 'owner' | 'cashier';
  shopRoleId?: string | null;
  createdAt: string;
}

interface PermissionRow { key: string; module: string; description: string }
interface RoleRow { id: string; name: string; description?: string; isSystem: boolean }
interface RoleDetail extends RoleRow { permissionKeys: string[] }

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave';
interface AttendanceRow {
  id: string; staffUserId: string; date: string;
  checkInAt?: string | null; checkOutAt?: string | null;
  status: AttendanceStatus; markedBy: 'self' | 'owner'; notes?: string;
}

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
interface LeaveRequestRow {
  id: string; staffUserId: string; startDate: string; endDate: string; days: number;
  reason?: string; status: LeaveStatus; createdVia: 'staff_request' | 'owner_direct';
  decisionNote?: string; isPaid: boolean;
}
interface LeaveBalance { annualQuota: number; paidDaysTakenThisYear: number; remaining: number }

interface StaffProfileRow {
  id: string; userId: string; employeeCode?: string; joinedAt?: string;
  monthlyBaseSalaryCents: number; annualLeaveQuota: number; payrollMode: 'simple' | 'statutory';
  pfEnabled: boolean; pfEmployeePercent: number; esiEnabled: boolean; esiEmployeePercent: number;
  professionalTaxEnabled: boolean; professionalTaxCents: number; tdsEnabled: boolean; tdsPercent: number;
}

interface PayrollAdjustment { label: string; amountCents: number; type: 'bonus' | 'deduction' }
interface PayrollRecordRow {
  id: string; staffUserId: string; month: string; workingDaysInMonth: number;
  presentDays: number; halfDays: number; paidLeaveDays: number; unpaidLeaveDays: number; absentDays: number;
  baseSalaryCents: number; proRatedGrossCents: number; adjustments: PayrollAdjustment[];
  bonusCents: number; deductionCents: number; pfDeductionCents: number; esiDeductionCents: number;
  professionalTaxCents: number; tdsCents: number; netPayCents: number;
  status: 'draft' | 'finalized' | 'paid'; paidVia?: string;
}

export default function StaffPage() {
  const [me, setMe] = useState<{ id?: string; isOwner: boolean; permissions: string[] } | null>(null);
  const can = useCallback((perm: string) => !!me && (me.permissions.includes('*') || me.permissions.includes(perm)), [me]);

  useEffect(() => {
    apiCall('GET', '/api/shop/me').then((res) => {
      const data = res.data ?? res;
      setMe({ isOwner: !!data.isOwner, permissions: data.permissions ?? [] });
    }).catch(() => setMe({ isOwner: false, permissions: [] }));
  }, []);

  // ── Shared: staff + roles ────────────────────────────────────────────
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);

  const roleNameOf = useCallback((id?: string | null) => roles.find((r) => r.id === id)?.name || '—', [roles]);
  const staffNameOf = useCallback((id: string) => {
    const s = staff.find((x) => x.id === id);
    return s?.fullName || s?.email || id.slice(0, 8);
  }, [staff]);

  const fetchStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const result = await apiCall('GET', '/api/shop/staff');
      setStaff(result.data ?? result);
    } catch { /* surfaced via the Staff tab's own error state */ }
    finally { setStaffLoading(false); }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const result = await apiCall('GET', '/api/shop/roles');
      setRoles(result.data ?? result);
    } catch { /* Roles tab shows its own error state */ }
  }, []);

  const fetchPermissions = useCallback(async () => {
    try {
      const result = await apiCall('GET', '/api/shop/permissions');
      setPermissions(result.data ?? result);
    } catch { /* silent — only used to render the role editor's checkboxes */ }
  }, []);

  useEffect(() => {
    fetchStaff();
    if (me?.isOwner) { fetchRoles(); fetchPermissions(); }
  }, [fetchStaff, fetchRoles, fetchPermissions, me?.isOwner]);

  const [activeTab, setActiveTab] = useState('staff');

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>
        <TeamOutlined style={{ marginRight: 8 }} />Staff
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Staff accounts, custom roles &amp; permissions, attendance, leave, and payroll for your shop.
      </Text>

      {!me ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'staff',
              label: <span><TeamOutlined /> Staff</span>,
              children: (
                <StaffTab
                  me={me} staff={staff} loading={staffLoading} roles={roles}
                  roleNameOf={roleNameOf} onChanged={fetchStaff}
                />
              ),
            },
            ...(me.isOwner ? [{
              key: 'roles',
              label: <span><SafetyCertificateOutlined /> Roles &amp; Permissions</span>,
              children: (
                <RolesTab roles={roles} permissions={permissions} onChanged={fetchRoles} />
              ),
            }] : []),
            {
              key: 'attendance',
              label: <span><ClockCircleOutlined /> Attendance</span>,
              children: (
                <AttendanceTab me={me} can={can} staff={staff} staffNameOf={staffNameOf} />
              ),
            },
            {
              key: 'leave',
              label: <span><CalendarOutlined /> Leave</span>,
              children: (
                <LeaveTab me={me} can={can} staff={staff} staffNameOf={staffNameOf} />
              ),
            },
            {
              key: 'payroll',
              label: <span><DollarOutlined /> Payroll</span>,
              children: (
                <PayrollTab me={me} can={can} staff={staff} staffNameOf={staffNameOf} />
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 1 — Staff accounts
// ════════════════════════════════════════════════════════════════════════
function StaffTab({
  me, staff, loading, roles, roleNameOf, onChanged,
}: {
  me: { isOwner: boolean };
  staff: StaffRow[];
  loading: boolean;
  roles: RoleRow[];
  roleNameOf: (id?: string | null) => string;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm<{ fullName: string; email: string; password?: string; shopRoleId?: string }>();
  const [saving, setSaving] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);
  const { token } = theme.useToken();

  const openInvite = () => { form.resetFields(); setDrawerOpen(true); };

  const inviteStaff = async (values: { fullName: string; email: string; password?: string; shopRoleId?: string }) => {
    setSaving(true);
    try {
      const result = await apiCall('POST', '/api/shop/staff', {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        password: values.password?.trim() || undefined,
        shopRoleId: values.shopRoleId,
      });
      const { user, inviteLink } = result.data ?? result;
      setDrawerOpen(false);
      setProvisioned({ email: user.email, inviteLink });
      onChanged();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to add staff account'));
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
      onChanged();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to update staff account'));
    } finally { setBusyId(null); }
  };

  const changeRole = async (member: StaffRow, roleId: string) => {
    setBusyId(member.id);
    try {
      await apiCall('PATCH', `/api/shop/staff/${member.id}/role`, { roleId });
      message.success('Role updated');
      onChanged();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to update role'));
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'fullName', key: 'fullName', render: (v?: string) => v || '—' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Owner?', dataIndex: 'shopStaffRole', key: 'shopStaffRole',
      render: (v: StaffRow['shopStaffRole']) => v === 'owner' ? <Tag color="gold">Owner</Tag> : <Tag>Staff</Tag>,
    },
    {
      title: 'Role', key: 'role',
      render: (_: unknown, s: StaffRow) => (
        s.shopStaffRole === 'owner' ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Full access</Text>
        ) : me.isOwner ? (
          <Select
            size="small"
            style={{ width: 160 }}
            value={s.shopRoleId ?? undefined}
            placeholder="No role"
            loading={busyId === s.id}
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(roleId) => changeRole(s, roleId)}
          />
        ) : (
          <Text>{roleNameOf(s.shopRoleId)}</Text>
        )
      ),
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, s: StaffRow) => <Badge status={s.isActive ? 'success' : 'error'} text={s.isActive ? 'Active' : 'Banned'} />,
    },
    ...(me.isOwner ? [{
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
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {me.isOwner && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openInvite}>New Staff Account</Button>
        )}
      </div>

      {me.isOwner && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Assign a role to control exactly what each staff member can do — see the Roles &amp; Permissions tab.
          A staff account with no role assigned falls back to the default Cashier role.
        </Text>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={staff.map((s) => ({ ...s, key: s.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Drawer
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />New Staff Account</span>}
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>Add Account</Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Creates a login for your shop. Pick a role to control what they can do — leave blank for the default
          Cashier role (bill at the counter, view-only elsewhere).
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
            <Input placeholder="staff@example.com" />
          </Form.Item>
          <Form.Item label="Role" name="shopRoleId" extra="Defaults to the Cashier role if left blank">
            <Select
              allowClear
              placeholder="Cashier (default)"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
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
              <Alert type="success" showIcon message="This account can log in immediately at the shop login page with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 2 — Roles & Permissions (owner only)
// ════════════════════════════════════════════════════════════════════════
function RolesTab({
  roles, permissions, onChanged,
}: {
  roles: RoleRow[];
  permissions: PermissionRow[];
  onChanged: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RoleDetail | null>(null);
  const [form] = Form.useForm<{ name: string; description?: string; permissionKeys: string[] }>();
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const grouped = permissions.reduce<Record<string, PermissionRow[]>>((acc, p) => {
    const prefix = p.key.split('.')[0];
    (acc[prefix] ||= []).push(p);
    return acc;
  }, {});

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = async (role: RoleRow) => {
    try {
      const result = await apiCall('GET', `/api/shop/roles/${role.id}`);
      const detail: RoleDetail = result.data ?? result;
      setEditing(detail);
      form.setFieldsValue({ name: detail.name, description: detail.description, permissionKeys: detail.permissionKeys });
      setDrawerOpen(true);
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to load role'));
    }
  };

  const save = async (values: { name: string; description?: string; permissionKeys?: string[] }) => {
    setSaving(true);
    try {
      const payload = { name: values.name, description: values.description, permissionKeys: values.permissionKeys ?? [] };
      if (editing) {
        await apiCall('PATCH', `/api/shop/roles/${editing.id}`, payload);
        message.success('Role updated');
      } else {
        await apiCall('POST', '/api/shop/roles', payload);
        message.success('Role created');
      }
      setDrawerOpen(false);
      onChanged();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to save role'));
    } finally { setSaving(false); }
  };

  const remove = async (role: RoleRow) => {
    setDeletingId(role.id);
    try {
      await apiCall('DELETE', `/api/shop/roles/${role.id}`);
      message.success('Role deleted');
      onChanged();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to delete role'));
    } finally { setDeletingId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string, r: RoleRow) => (
      <span>{v} {r.isSystem && <Tag style={{ marginLeft: 6 }}>Default</Tag>}</span>
    ) },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (v?: string) => v || '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: RoleRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Edit</Button>
          {!r.isSystem && (
            <Popconfirm title="Delete this role? Staff assigned to it must be reassigned first." onConfirm={() => remove(r)}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === r.id}>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Role</Button>
      </div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Create roles with exactly the permissions each job needs — e.g. a &quot;Manager&quot; who can manage catalog
        and approve leave but can&apos;t see payroll. Creating and editing roles is always owner-only, so a
        delegated permission can never grant more power than you intended.
      </Text>

      <Table columns={columns} dataSource={roles.map((r) => ({ ...r, key: r.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />

      <Drawer
        title={editing ? `Edit "${editing.name}"` : 'New Role'}
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={460}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Manager" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input placeholder="What is this role for?" />
          </Form.Item>
          <Divider style={{ margin: '12px 0' }}>Permissions</Divider>
          <Form.Item name="permissionKeys" initialValue={[]}>
            <Checkbox.Group style={{ width: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {Object.entries(grouped).map(([prefix, perms]) => (
                  <div key={prefix}>
                    <Text strong style={{ fontSize: 12, color: '#666' }}>
                      {PERMISSION_GROUP_LABELS[prefix] || prefix}
                    </Text>
                    <div style={{ marginTop: 4 }}>
                      {perms.map((p) => (
                        <div key={p.key} style={{ marginBottom: 4 }}>
                          <Checkbox value={p.key}>
                            <Text style={{ fontSize: 13 }}>{p.description}</Text>
                          </Checkbox>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 3 — Attendance
// ════════════════════════════════════════════════════════════════════════
function AttendanceTab({
  me, can, staff, staffNameOf,
}: {
  me: { id?: string; isOwner: boolean };
  can: (perm: string) => boolean;
  staff: StaffRow[];
  staffNameOf: (id: string) => string;
}) {
  const canManage = me.isOwner || can('shop_attendance.manage');

  const [today, setToday] = useState<AttendanceRow | null>(null);
  const [selfLoading, setSelfLoading] = useState(false);
  const fetchToday = useCallback(async () => {
    try {
      const result = await apiCall('GET', '/api/shop/attendance/me/today');
      // 'data' can legitimately be null (no attendance marked yet today) —
      // `result.data ?? result` would wrongly fall through to the whole
      // response envelope in that case, so check the key's presence first.
      const value = result && typeof result === 'object' && 'data' in result ? result.data : result;
      setToday(value ?? null);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { fetchToday(); }, [fetchToday]);

  const checkIn = async () => {
    setSelfLoading(true);
    try {
      await apiCall('POST', '/api/shop/attendance/check-in');
      message.success('Checked in');
      fetchToday();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to check in')); }
    finally { setSelfLoading(false); }
  };
  const checkOut = async () => {
    setSelfLoading(true);
    try {
      await apiCall('POST', '/api/shop/attendance/check-out');
      message.success('Checked out');
      fetchToday();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to check out')); }
    finally { setSelfLoading(false); }
  };

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStaff, setFilterStaff] = useState<string | undefined>(undefined);
  const [filterRange, setFilterRange] = useState<[Dayjs, Dayjs] | null>([dayjs().startOf('month'), dayjs().endOf('month')]);

  const fetchRows = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStaff) params.set('staffId', filterStaff);
      if (filterRange) {
        params.set('from', filterRange[0].format('YYYY-MM-DD'));
        params.set('to', filterRange[1].format('YYYY-MM-DD'));
      }
      const result = await apiCall('GET', `/api/shop/attendance?${params.toString()}`);
      setRows(result.data ?? result);
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to load attendance')); }
    finally { setLoading(false); }
  }, [canManage, filterStaff, filterRange]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const [markOpen, setMarkOpen] = useState(false);
  const [markForm] = Form.useForm<{ staffUserId: string; date: Dayjs; status: AttendanceStatus; notes?: string }>();
  const [marking, setMarking] = useState(false);
  const submitMark = async (values: { staffUserId: string; date: Dayjs; status: AttendanceStatus; notes?: string }) => {
    setMarking(true);
    try {
      await apiCall('PUT', `/api/shop/attendance/${values.staffUserId}`, {
        date: values.date.format('YYYY-MM-DD'), status: values.status, notes: values.notes,
      });
      message.success('Attendance updated');
      setMarkOpen(false);
      fetchRows();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to mark attendance')); }
    finally { setMarking(false); }
  };

  const statusTag = (s: AttendanceStatus) => {
    const colorMap: Record<AttendanceStatus, string> = {
      present: 'green', absent: 'red', half_day: 'orange', leave: 'blue',
    };
    return <Tag color={colorMap[s]}>{s.replace('_', ' ')}</Tag>;
  };

  const columns = [
    { title: 'Staff', key: 'staff', render: (_: unknown, r: AttendanceRow) => staffNameOf(r.staffUserId) },
    { title: 'Date', dataIndex: 'date', key: 'date' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    { title: 'Check In', dataIndex: 'checkInAt', key: 'checkInAt', render: (v?: string) => v ? dayjs(v).format('HH:mm') : '—' },
    { title: 'Check Out', dataIndex: 'checkOutAt', key: 'checkOutAt', render: (v?: string) => v ? dayjs(v).format('HH:mm') : '—' },
    { title: 'Marked By', dataIndex: 'markedBy', key: 'markedBy', render: (v: string) => v === 'self' ? 'Self' : 'Owner/Manager' },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 20, maxWidth: 420 }}>
        <Text strong style={{ display: 'block', marginBottom: 8 }}>My Attendance — Today ({dayjs().format('D MMM YYYY')})</Text>
        {today ? (
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Checked in {today.checkInAt ? dayjs(today.checkInAt).format('HH:mm') : '—'}
              {today.checkOutAt ? ` · Checked out ${dayjs(today.checkOutAt).format('HH:mm')}` : ''}
            </Text>
            {statusTag(today.status)}
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>Not checked in yet today.</Text>
        )}
        <div style={{ marginTop: 12 }}>
          <Space>
            <Button icon={<LoginOutlined />} loading={selfLoading} disabled={!!today?.checkInAt} onClick={checkIn}>
              Check In
            </Button>
            <Button icon={<LogoutOutlined />} loading={selfLoading} disabled={!today?.checkInAt || !!today?.checkOutAt} onClick={checkOut}>
              Check Out
            </Button>
          </Space>
        </div>
      </Card>

      {canManage && (
        <>
          <Divider />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Space wrap>
              <Select
                allowClear
                placeholder="All staff"
                style={{ width: 200 }}
                value={filterStaff}
                onChange={setFilterStaff}
                options={staff.map((s) => ({ value: s.id, label: s.fullName || s.email }))}
              />
              <RangePicker value={filterRange} onChange={(v) => setFilterRange(v as [Dayjs, Dayjs] | null)} />
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { markForm.resetFields(); setMarkOpen(true); }}>
              Mark Attendance
            </Button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
          ) : rows.length === 0 ? (
            <Empty description="No attendance records for this range" />
          ) : (
            <Table columns={columns} dataSource={rows.map((r) => ({ ...r, key: r.id }))} bordered size="middle" pagination={{ pageSize: 15 }} scroll={{ x: 'max-content' }} />
          )}
        </>
      )}

      <Modal
        title="Mark Attendance"
        open={markOpen}
        onCancel={() => setMarkOpen(false)}
        onOk={() => markForm.submit()}
        confirmLoading={marking}
      >
        <Form form={markForm} layout="vertical" onFinish={submitMark}>
          <Form.Item label="Staff" name="staffUserId" rules={[{ required: true, message: 'Pick a staff member' }]}>
            <Select
              placeholder="Select staff member"
              options={staff.filter((s) => s.shopStaffRole !== 'owner').map((s) => ({ value: s.id, label: s.fullName || s.email }))}
            />
          </Form.Item>
          <Form.Item label="Date" name="date" rules={[{ required: true, message: 'Pick a date' }]} initialValue={dayjs()}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Status" name="status" rules={[{ required: true }]} initialValue="present">
            <Radio.Group>
              <Radio.Button value="present">Present</Radio.Button>
              <Radio.Button value="half_day">Half Day</Radio.Button>
              <Radio.Button value="absent">Absent</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="Notes (optional)" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 4 — Leave
// ════════════════════════════════════════════════════════════════════════
function LeaveTab({
  me, can, staff, staffNameOf,
}: {
  me: { id?: string; isOwner: boolean };
  can: (perm: string) => boolean;
  staff: StaffRow[];
  staffNameOf: (id: string) => string;
}) {
  const canManage = me.isOwner || can('shop_leave.manage');

  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const fetchBalance = useCallback(async () => {
    try {
      const result = await apiCall('GET', '/api/shop/leave/me/balance');
      setBalance(result.data ?? result);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm] = Form.useForm<{ range: [Dayjs, Dayjs]; reason?: string }>();
  const [requesting, setRequesting] = useState(false);

  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchRequests = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const result = await apiCall('GET', '/api/shop/leave/requests');
      setRequests(result.data ?? result);
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to load leave requests')); }
    finally { setLoading(false); }
  }, [canManage]);
  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const submitRequest = async (values: { range: [Dayjs, Dayjs]; reason?: string }) => {
    setRequesting(true);
    try {
      await apiCall('POST', '/api/shop/leave/requests', {
        startDate: values.range[0].format('YYYY-MM-DD'),
        endDate: values.range[1].format('YYYY-MM-DD'),
        reason: values.reason,
      });
      message.success('Leave requested');
      setRequestOpen(false);
      fetchBalance();
      fetchRequests();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to request leave')); }
    finally { setRequesting(false); }
  };

  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = async (req: LeaveRequestRow, approve: boolean) => {
    setDecidingId(req.id);
    try {
      await apiCall('PATCH', `/api/shop/leave/requests/${req.id}/decide`, { approve });
      message.success(approve ? 'Leave approved' : 'Leave rejected');
      fetchRequests();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to decide leave request')); }
    finally { setDecidingId(null); }
  };

  const [markOpen, setMarkOpen] = useState(false);
  const [markForm] = Form.useForm<{ staffUserId: string; range: [Dayjs, Dayjs]; reason?: string }>();
  const [marking, setMarking] = useState(false);
  const submitDirectMark = async (values: { staffUserId: string; range: [Dayjs, Dayjs]; reason?: string }) => {
    setMarking(true);
    try {
      await apiCall('POST', `/api/shop/leave/${values.staffUserId}/mark`, {
        startDate: values.range[0].format('YYYY-MM-DD'),
        endDate: values.range[1].format('YYYY-MM-DD'),
        reason: values.reason,
      });
      message.success('Leave marked');
      setMarkOpen(false);
      fetchRequests();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to mark leave')); }
    finally { setMarking(false); }
  };

  const statusTag = (s: LeaveStatus) => {
    const colorMap: Record<LeaveStatus, string> = { pending: 'orange', approved: 'green', rejected: 'red', cancelled: 'default' };
    return <Tag color={colorMap[s]}>{s}</Tag>;
  };

  const columns = [
    { title: 'Staff', key: 'staff', render: (_: unknown, r: LeaveRequestRow) => staffNameOf(r.staffUserId) },
    { title: 'Dates', key: 'dates', render: (_: unknown, r: LeaveRequestRow) => `${r.startDate} → ${r.endDate}` },
    { title: 'Days', dataIndex: 'days', key: 'days' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', render: (v?: string) => v || '—' },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    { title: 'Paid?', dataIndex: 'isPaid', key: 'isPaid', render: (v: boolean, r: LeaveRequestRow) => r.status === 'approved' ? (v ? 'Paid' : 'Unpaid') : '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: LeaveRequestRow) => r.status === 'pending' ? (
        <Space>
          <Button size="small" type="primary" loading={decidingId === r.id} onClick={() => decide(r, true)}>Approve</Button>
          <Button size="small" danger loading={decidingId === r.id} onClick={() => decide(r, false)}>Reject</Button>
        </Space>
      ) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <Statistic title="Annual Leave Quota" value={balance?.annualQuota ?? '—'} suffix="days" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <Statistic title="Taken This Year (paid)" value={balance?.paidDaysTakenThisYear ?? '—'} suffix="days" />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <Statistic title="Remaining" value={balance?.remaining ?? '—'} suffix="days" styles={{ content: { color: '#3f8600' } }} />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => { requestForm.resetFields(); setRequestOpen(true); }}>
          Request Leave
        </Button>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { markForm.resetFields(); setMarkOpen(true); }}>
            Mark Leave for Staff
          </Button>
        )}
      </div>

      {canManage ? (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : requests.length === 0 ? (
          <Empty description="No leave requests yet" />
        ) : (
          <Table columns={columns} dataSource={requests.map((r) => ({ ...r, key: r.id }))} bordered size="middle" pagination={{ pageSize: 15 }} scroll={{ x: 'max-content' }} />
        )
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>
          You can request leave above. Approving requests requires the &quot;Leave&quot; permission.
        </Text>
      )}

      <Modal title="Request Leave" open={requestOpen} onCancel={() => setRequestOpen(false)} onOk={() => requestForm.submit()} confirmLoading={requesting}>
        <Form form={requestForm} layout="vertical" onFinish={submitRequest}>
          <Form.Item label="Dates" name="range" rules={[{ required: true, message: 'Pick a date range' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Reason (optional)" name="reason">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Mark Leave for Staff" open={markOpen} onCancel={() => setMarkOpen(false)} onOk={() => markForm.submit()} confirmLoading={marking}>
        <Form form={markForm} layout="vertical" onFinish={submitDirectMark}>
          <Form.Item label="Staff" name="staffUserId" rules={[{ required: true, message: 'Pick a staff member' }]}>
            <Select
              placeholder="Select staff member"
              options={staff.filter((s) => s.shopStaffRole !== 'owner').map((s) => ({ value: s.id, label: s.fullName || s.email }))}
            />
          </Form.Item>
          <Form.Item label="Dates" name="range" rules={[{ required: true, message: 'Pick a date range' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Reason (optional)" name="reason">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="Auto-approved immediately. Paid if within their remaining leave balance, unpaid otherwise."
          />
        </Form>
      </Modal>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 5 — Payroll
// ════════════════════════════════════════════════════════════════════════
function PayrollTab({
  me, can, staff, staffNameOf,
}: {
  me: { id?: string; isOwner: boolean };
  can: (perm: string) => boolean;
  staff: StaffRow[];
  staffNameOf: (id: string) => string;
}) {
  const canManage = me.isOwner || can('shop_payroll.manage');
  const canViewAll = me.isOwner || can('shop_payroll.view') || canManage;

  // ── My own payroll records (always visible to self) ──────────────────
  const [myRecords, setMyRecords] = useState<PayrollRecordRow[]>([]);
  const fetchMyRecords = useCallback(async () => {
    try {
      const result = await apiCall('GET', '/api/shop/payroll/records');
      setMyRecords(result.data ?? result);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { fetchMyRecords(); }, [fetchMyRecords]);

  const downloadPayslip = async (record: PayrollRecordRow) => {
    try {
      await downloadFile(`/api/shop/payroll/records/${record.id}/payslip.pdf`, `payslip-${record.month}.pdf`);
    } catch {
      message.error('Failed to download payslip');
    }
  };

  // ── Salary profiles (owner / shop_payroll.manage) ────────────────────
  const [profiles, setProfiles] = useState<StaffProfileRow[]>([]);
  const fetchProfiles = useCallback(async () => {
    if (!canViewAll) return;
    try {
      const result = await apiCall('GET', '/api/shop/payroll/staff-profiles');
      setProfiles(result.data ?? result);
    } catch { /* ignore */ }
  }, [canViewAll]);
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const [profileOpen, setProfileOpen] = useState(false);
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null);
  const [profileForm] = Form.useForm();
  const [savingProfile, setSavingProfile] = useState(false);

  const openProfile = (staffId: string) => {
    const existing = profiles.find((p) => p.userId === staffId);
    setProfileStaffId(staffId);
    profileForm.setFieldsValue({
      employeeCode: existing?.employeeCode,
      joinedAt: existing?.joinedAt ? dayjs(existing.joinedAt) : undefined,
      monthlyBaseSalary: existing ? existing.monthlyBaseSalaryCents / 100 : undefined,
      annualLeaveQuota: existing?.annualLeaveQuota ?? 12,
      payrollMode: existing?.payrollMode ?? 'simple',
      pfEnabled: existing?.pfEnabled ?? false,
      pfEmployeePercent: existing ? Number(existing.pfEmployeePercent) : 12,
      esiEnabled: existing?.esiEnabled ?? false,
      esiEmployeePercent: existing ? Number(existing.esiEmployeePercent) : 0.75,
      professionalTaxEnabled: existing?.professionalTaxEnabled ?? false,
      professionalTax: existing ? existing.professionalTaxCents / 100 : 0,
      tdsEnabled: existing?.tdsEnabled ?? false,
      tdsPercent: existing ? Number(existing.tdsPercent) : 0,
    });
    setProfileOpen(true);
  };

  const saveProfile = async (values: Record<string, unknown>) => {
    if (!profileStaffId) return;
    setSavingProfile(true);
    try {
      await apiCall('PUT', `/api/shop/payroll/staff-profiles/${profileStaffId}`, {
        employeeCode: values.employeeCode,
        joinedAt: values.joinedAt ? (values.joinedAt as Dayjs).format('YYYY-MM-DD') : undefined,
        monthlyBaseSalaryCents: Math.round(Number(values.monthlyBaseSalary || 0) * 100),
        annualLeaveQuota: Number(values.annualLeaveQuota ?? 12),
        payrollMode: values.payrollMode,
        pfEnabled: !!values.pfEnabled,
        pfEmployeePercent: Number(values.pfEmployeePercent ?? 12),
        esiEnabled: !!values.esiEnabled,
        esiEmployeePercent: Number(values.esiEmployeePercent ?? 0.75),
        professionalTaxEnabled: !!values.professionalTaxEnabled,
        professionalTaxCents: Math.round(Number(values.professionalTax || 0) * 100),
        tdsEnabled: !!values.tdsEnabled,
        tdsPercent: Number(values.tdsPercent ?? 0),
      });
      message.success('Salary profile saved');
      setProfileOpen(false);
      fetchProfiles();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to save salary profile')); }
    finally { setSavingProfile(false); }
  };

  // ── Payroll records for everyone (owner / shop_payroll.view+) ────────
  const [allRecords, setAllRecords] = useState<PayrollRecordRow[]>([]);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [loadingRecords, setLoadingRecords] = useState(false);
  const fetchAllRecords = useCallback(async () => {
    if (!canViewAll) return;
    setLoadingRecords(true);
    try {
      const result = await apiCall('GET', `/api/shop/payroll/records?month=${month.format('YYYY-MM')}`);
      setAllRecords(result.data ?? result);
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to load payroll records')); }
    finally { setLoadingRecords(false); }
  }, [canViewAll, month]);
  useEffect(() => { fetchAllRecords(); }, [fetchAllRecords]);

  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const generate = async (staffId: string) => {
    setGeneratingId(staffId);
    try {
      await apiCall('POST', `/api/shop/payroll/${staffId}/generate`, { month: month.format('YYYY-MM') });
      message.success('Payroll generated');
      fetchAllRecords();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to generate payroll')); }
    finally { setGeneratingId(null); }
  };

  const [adjustOpen, setAdjustOpen] = useState<PayrollRecordRow | null>(null);
  const [adjustForm] = Form.useForm<{ label: string; amount: number; type: 'bonus' | 'deduction' }>();
  const [adjusting, setAdjusting] = useState(false);
  const submitAdjustment = async (values: { label: string; amount: number; type: 'bonus' | 'deduction' }) => {
    if (!adjustOpen) return;
    setAdjusting(true);
    try {
      await apiCall('POST', `/api/shop/payroll/records/${adjustOpen.id}/adjustments`, {
        label: values.label, amountCents: Math.round(values.amount * 100), type: values.type,
      });
      message.success('Adjustment added');
      setAdjustOpen(null);
      fetchAllRecords();
      fetchMyRecords();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to add adjustment')); }
    finally { setAdjusting(false); }
  };

  const [actingId, setActingId] = useState<string | null>(null);
  const finalize = async (record: PayrollRecordRow) => {
    setActingId(record.id);
    try {
      await apiCall('PATCH', `/api/shop/payroll/records/${record.id}/finalize`);
      message.success('Payroll finalized');
      fetchAllRecords();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to finalize payroll')); }
    finally { setActingId(null); }
  };
  const markPaid = async (record: PayrollRecordRow) => {
    setActingId(record.id);
    try {
      await apiCall('PATCH', `/api/shop/payroll/records/${record.id}/mark-paid`, { paidVia: 'bank_transfer' });
      message.success('Marked as paid');
      fetchAllRecords();
    } catch (err: unknown) { message.error(errMsg(err, 'Failed to mark as paid')); }
    finally { setActingId(null); }
  };

  const statusTag = (s: PayrollRecordRow['status']) => {
    const colorMap = { draft: 'default', finalized: 'blue', paid: 'green' } as const;
    return <Tag color={colorMap[s]}>{s}</Tag>;
  };

  const recordColumns = [
    { title: 'Staff', key: 'staff', render: (_: unknown, r: PayrollRecordRow) => staffNameOf(r.staffUserId) },
    { title: 'Month', dataIndex: 'month', key: 'month' },
    { title: 'Present', dataIndex: 'presentDays', key: 'presentDays' },
    { title: 'Paid Leave', dataIndex: 'paidLeaveDays', key: 'paidLeaveDays' },
    { title: 'Gross', key: 'gross', render: (_: unknown, r: PayrollRecordRow) => money(r.proRatedGrossCents) },
    { title: 'Net Pay', key: 'net', render: (_: unknown, r: PayrollRecordRow) => <Text strong>{money(r.netPayCents)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: PayrollRecordRow) => (
        <Space wrap>
          {r.status === 'draft' && canManage && (
            <>
              <Button size="small" onClick={() => { adjustForm.resetFields(); setAdjustOpen(r); }}>+ Adjustment</Button>
              <Button size="small" type="primary" loading={actingId === r.id} onClick={() => finalize(r)}>Finalize</Button>
            </>
          )}
          {r.status === 'finalized' && canManage && (
            <Button size="small" type="primary" loading={actingId === r.id} onClick={() => markPaid(r)}>Mark Paid</Button>
          )}
          <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadPayslip(r)}>Payslip</Button>
        </Space>
      ),
    },
  ];

  const myRecordColumns = [
    { title: 'Month', dataIndex: 'month', key: 'month' },
    { title: 'Net Pay', key: 'net', render: (_: unknown, r: PayrollRecordRow) => <Text strong>{money(r.netPayCents)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: statusTag },
    {
      title: '', key: 'actions',
      render: (_: unknown, r: PayrollRecordRow) => (
        <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadPayslip(r)}>Payslip</Button>
      ),
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 24 }} title={<span><FileDoneOutlined style={{ marginRight: 6 }} />My Payslips</span>}>
        {myRecords.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>No payroll records yet.</Text>
        ) : (
          <Table columns={myRecordColumns} dataSource={myRecords.map((r) => ({ ...r, key: r.id }))} size="small" pagination={false} scroll={{ x: 'max-content' }} />
        )}
      </Card>

      {canViewAll && (
        <>
          <Divider />
          <Text strong style={{ display: 'block', marginBottom: 12 }}>Salary Profiles</Text>
          <Table
            size="small"
            bordered
            style={{ marginBottom: 24 }}
            scroll={{ x: 'max-content' }}
            dataSource={staff.filter((s) => s.shopStaffRole !== 'owner').map((s) => ({ ...s, key: s.id }))}
            columns={[
              { title: 'Staff', dataIndex: 'fullName', key: 'fullName', render: (v: string, s: StaffRow) => v || s.email },
              {
                title: 'Base Salary', key: 'salary',
                render: (_: unknown, s: StaffRow) => {
                  const p = profiles.find((pr) => pr.userId === s.id);
                  return p ? money(p.monthlyBaseSalaryCents) + '/mo' : <Text type="secondary">Not set</Text>;
                },
              },
              {
                title: 'Mode', key: 'mode',
                render: (_: unknown, s: StaffRow) => profiles.find((pr) => pr.userId === s.id)?.payrollMode ?? '—',
              },
              {
                title: 'Actions', key: 'actions',
                render: (_: unknown, s: StaffRow) => canManage && (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openProfile(s.id)}>Edit Salary</Button>
                ),
              },
            ]}
            pagination={false}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <Space>
              <Text strong>Payroll Records —</Text>
              <DatePicker picker="month" value={month} onChange={(v) => v && setMonth(v)} allowClear={false} />
            </Space>
            {canManage && (
              <Select
                placeholder="Generate for staff…"
                style={{ width: 220 }}
                value={undefined}
                onChange={(staffId: string) => generate(staffId)}
                options={staff.filter((s) => s.shopStaffRole !== 'owner').map((s) => ({
                  value: s.id, label: s.fullName || s.email,
                  disabled: generatingId === s.id,
                }))}
              />
            )}
          </div>

          {loadingRecords ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
          ) : allRecords.length === 0 ? (
            <Empty description="No payroll records for this month yet" />
          ) : (
            <Table columns={recordColumns} dataSource={allRecords.map((r) => ({ ...r, key: r.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
          )}
        </>
      )}

      <Modal
        title="Salary Profile"
        open={profileOpen}
        onCancel={() => setProfileOpen(false)}
        onOk={() => profileForm.submit()}
        confirmLoading={savingProfile}
        width={560}
      >
        <Form form={profileForm} layout="vertical" onFinish={saveProfile}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item label="Employee Code" name="employeeCode">
                <Input placeholder="e.g. EMP-001" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Joined On" name="joinedAt">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item label="Monthly Base Salary (₹)" name="monthlyBaseSalary" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Annual Leave Quota (days)" name="annualLeaveQuota">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Payroll Mode" name="payrollMode">
            <Radio.Group>
              <Radio.Button value="simple">Simple</Radio.Button>
              <Radio.Button value="statutory">With Statutory Deductions</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.payrollMode !== cur.payrollMode}>
            {({ getFieldValue }) => getFieldValue('payrollMode') === 'statutory' && (
              <>
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="These are standard-rate starting points, not certified tax/compliance advice — verify with your accountant."
                />
                <Row gutter={12} align="middle">
                  <Col xs={24} sm={8}><Form.Item name="pfEnabled" valuePropName="checked" label="PF"><Switch /></Form.Item></Col>
                  <Col xs={24} sm={16}><Form.Item label="Employee %" name="pfEmployeePercent"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
                </Row>
                <Row gutter={12} align="middle">
                  <Col xs={24} sm={8}><Form.Item name="esiEnabled" valuePropName="checked" label="ESI"><Switch /></Form.Item></Col>
                  <Col xs={24} sm={16}><Form.Item label="Employee %" name="esiEmployeePercent"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
                </Row>
                <Row gutter={12} align="middle">
                  <Col xs={24} sm={8}><Form.Item name="professionalTaxEnabled" valuePropName="checked" label="Prof. Tax"><Switch /></Form.Item></Col>
                  <Col xs={24} sm={16}><Form.Item label="Flat Amount (₹/mo)" name="professionalTax"><InputNumber style={{ width: '100%' }} min={0} /></Form.Item></Col>
                </Row>
                <Row gutter={12} align="middle">
                  <Col xs={24} sm={8}><Form.Item name="tdsEnabled" valuePropName="checked" label="TDS"><Switch /></Form.Item></Col>
                  <Col xs={24} sm={16}><Form.Item label="Percent" name="tdsPercent"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item></Col>
                </Row>
              </>
            )}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Add Adjustment${adjustOpen ? ` — ${staffNameOf(adjustOpen.staffUserId)} (${adjustOpen.month})` : ''}`}
        open={!!adjustOpen}
        onCancel={() => setAdjustOpen(null)}
        onOk={() => adjustForm.submit()}
        confirmLoading={adjusting}
      >
        <Form form={adjustForm} layout="vertical" onFinish={submitAdjustment}>
          <Form.Item label="Label" name="label" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Diwali Bonus, Advance Recovery" />
          </Form.Item>
          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="Type" name="type" initialValue="bonus">
            <Radio.Group>
              <Radio.Button value="bonus">Bonus</Radio.Button>
              <Radio.Button value="deduction">Deduction</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
