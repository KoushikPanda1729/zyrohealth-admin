'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Tabs, Typography, message,
  Alert, Spin, Drawer, Descriptions, Badge, Divider, Space, Dropdown, Modal, Select,
} from 'antd';
import type { MenuProps, TablePaginationConfig } from 'antd';
import {
  StopOutlined, CheckCircleOutlined, EyeOutlined, MoreOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

type RoleFilter = 'all' | 'patient' | 'doctor';

interface User {
  id: string;
  fullName?: string;
  phoneNumber?: string;
  email?: string;
  role: string;
  roleId?: string;
  isActive: boolean;
  createdAt: string;
  patientProfile?: {
    bloodGroup?: string;
    allergies?: string[];
    chronicConditions?: string[];
    height?: number;
    weight?: number;
    dateOfBirth?: string;
    gender?: string;
  };
  doctorProfile?: {
    id: string;
    specialty?: string;
    licenseNumber?: string;
    yearsOfExperience?: number;
    qualifications?: string[];
    languages?: string[];
    bio?: string;
    consultationFee?: number;
    approvalStatus?: string;
    rejectionReason?: string;
    rating?: number;
    totalConsultations?: number;
    isAvailable?: boolean;
  };
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Role assignment (admin-type staff only)
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [assigningUser, setAssigningUser] = useState<User | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | undefined>();
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    apiCall('GET', '/api/admin/roles')
      .then((result) => setRoles(result.data ?? result))
      .catch(() => setRoles([]));
  }, []);

  const openAssignRole = (user: User) => {
    setAssigningUser(user);
    setSelectedRoleId(user.roleId);
  };

  const saveAssignRole = async () => {
    if (!assigningUser || !selectedRoleId) return;
    setAssignSaving(true);
    try {
      await apiCall('PATCH', `/api/admin/users/${assigningUser.id}/role`, {
        roleId: selectedRoleId,
      });
      message.success('Role assigned');
      setAssigningUser(null);
      fetchUsers(pagination.current, roleFilter);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to assign role');
      else message.error('An unexpected error occurred');
    } finally { setAssignSaving(false); }
  };

  const fetchUsers = useCallback(async (page = 1, role: RoleFilter = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (role !== 'all') params.append('role', role);
      const result = await apiCall('GET', `/api/admin/users?${params}`);
      setUsers(result.data || []);
      setPagination((prev) => ({ ...prev, current: page, total: result.total || 0 }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load users');
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(1, roleFilter); }, [roleFilter, fetchUsers]);

  const handleToggleBan = async (id: string, isActive: boolean) => {
    try {
      await apiCall('PATCH', `/api/admin/users/${id}/ban`);
      message.success(isActive ? 'User banned' : 'User unbanned');
      fetchUsers(pagination.current, roleFilter);
      if (selectedUser?.id === id) {
        setSelectedUser((prev) => prev ? { ...prev, isActive: !prev.isActive } : prev);
      }
    } catch { message.error('Failed to update user status'); }
  };

  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: User) => r.fullName || '—',
    },
    {
      title: 'Phone',
      key: 'phone',
      render: (_: unknown, r: User) => r.phoneNumber || '—',
    },
    {
      title: 'Email',
      key: 'email',
      render: (_: unknown, r: User) => r.email || '—',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'doctor' ? 'blue' : role === 'admin' ? 'purple' : 'green'}>
          {role?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'active',
      render: (_: unknown, r: User) => (
        <Badge status={r.isActive ? 'success' : 'error'} text={r.isActive ? 'Active' : 'Banned'} />
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: User) => {
        const openDrawer = async () => {
          setDrawerOpen(true);
          setDrawerLoading(true);
          setSelectedUser(record);
          try {
            const res = await apiCall('GET', `/api/admin/users/${record.id}`);
            setSelectedUser(res.data ?? record);
          } catch { /* show whatever we have from list */ }
          finally { setDrawerLoading(false); }
        };

        const confirmBan = () => {
          Modal.confirm({
            title: 'Ban this user?',
            content: "This will restrict the user's access.",
            okText: 'Ban',
            okButtonProps: { danger: true },
            onOk: () => handleToggleBan(record.id, true),
          });
        };

        const confirmUnban = () => {
          Modal.confirm({
            title: 'Unban this user?',
            content: "This will restore the user's access.",
            okText: 'Unban',
            onOk: () => handleToggleBan(record.id, false),
          });
        };

        const items: MenuProps['items'] = [
          { key: 'view', icon: <EyeOutlined />, label: 'View Details', onClick: openDrawer },
          ...(record.role === 'admin'
            ? [{
                key: 'role',
                icon: <SafetyCertificateOutlined />,
                label: 'Assign Role',
                onClick: () => openAssignRole(record),
              }]
            : []),
          record.isActive
            ? { key: 'ban', icon: <StopOutlined />, label: 'Ban', danger: true, onClick: confirmBan }
            : { key: 'unban', icon: <CheckCircleOutlined />, label: 'Unban', onClick: confirmUnban },
        ];

        return (
          <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Users Management</Title>

      <Tabs
        activeKey={roleFilter}
        onChange={(key) => setRoleFilter(key as RoleFilter)}
        items={[
          { key: 'all', label: 'All Users' },
          { key: 'patient', label: 'Patients' },
          { key: 'doctor', label: 'Doctors' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table
          columns={columns}
          dataSource={users.map((u) => ({ ...u, key: u.id }))}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false }}
          onChange={(pag: TablePaginationConfig) => fetchUsers(pag.current || 1, roleFilter)}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}

      {/* Detail Drawer */}
      <Drawer
        title={selectedUser?.fullName || 'User Details'}
        placement="right"
        styles={{ wrapper: { width: 520 } }}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          selectedUser && (
            selectedUser.isActive ? (
              <Button danger size="small" icon={<StopOutlined />} onClick={() =>
                Modal.confirm({
                  title: 'Ban this user?',
                  content: "This will restrict the user's access.",
                  okText: 'Ban',
                  okButtonProps: { danger: true },
                  onOk: () => handleToggleBan(selectedUser.id, true),
                })
              }>Ban</Button>
            ) : (
              <Button size="small" icon={<CheckCircleOutlined />} style={{ color: '#52c41a', borderColor: '#52c41a' }} onClick={() =>
                Modal.confirm({
                  title: 'Unban this user?',
                  content: "This will restore the user's access.",
                  okText: 'Unban',
                  onOk: () => handleToggleBan(selectedUser.id, false),
                })
              }>Unban</Button>
            )
          )
        }
      >
        {drawerLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : selectedUser && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Full Name">{selectedUser.fullName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selectedUser.phoneNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedUser.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Role">
                <Tag color={selectedUser.role === 'doctor' ? 'blue' : selectedUser.role === 'admin' ? 'purple' : 'green'}>
                  {selectedUser.role?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Badge status={selectedUser.isActive ? 'success' : 'error'} text={selectedUser.isActive ? 'Active' : 'Banned'} />
              </Descriptions.Item>
              <Descriptions.Item label="Joined">{new Date(selectedUser.createdAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            {selectedUser.patientProfile && (
              <>
                <Divider>Patient Profile</Divider>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="Gender">{selectedUser.patientProfile.gender || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Date of Birth">
                    {selectedUser.patientProfile.dateOfBirth
                      ? new Date(selectedUser.patientProfile.dateOfBirth).toLocaleDateString()
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Blood Group">{selectedUser.patientProfile.bloodGroup || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Height">{selectedUser.patientProfile.height ? `${selectedUser.patientProfile.height} cm` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Weight">{selectedUser.patientProfile.weight ? `${selectedUser.patientProfile.weight} kg` : '—'}</Descriptions.Item>
                  <Descriptions.Item label="Allergies">
                    {selectedUser.patientProfile.allergies?.length
                      ? <Space wrap>{selectedUser.patientProfile.allergies.map((a) => <Tag key={a} color="red">{a}</Tag>)}</Space>
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Chronic Conditions">
                    {selectedUser.patientProfile.chronicConditions?.length
                      ? <Space wrap>{selectedUser.patientProfile.chronicConditions.map((c) => <Tag key={c} color="orange">{c}</Tag>)}</Space>
                      : '—'}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            {selectedUser.doctorProfile && (
              <>
                <Divider>Doctor Profile</Divider>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="Specialty">{selectedUser.doctorProfile.specialty || '—'}</Descriptions.Item>
                  <Descriptions.Item label="License No.">{selectedUser.doctorProfile.licenseNumber || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Experience">
                    {selectedUser.doctorProfile.yearsOfExperience ? `${selectedUser.doctorProfile.yearsOfExperience} years` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Consultation Fee">
                    {selectedUser.doctorProfile.consultationFee ? `₹${selectedUser.doctorProfile.consultationFee}` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Rating">
                    {selectedUser.doctorProfile.rating ? `⭐ ${Number(selectedUser.doctorProfile.rating).toFixed(1)}` : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Total Consultations">
                    {selectedUser.doctorProfile.totalConsultations ?? '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Available">
                    <Badge
                      status={selectedUser.doctorProfile.isAvailable ? 'success' : 'error'}
                      text={selectedUser.doctorProfile.isAvailable ? 'Yes' : 'No'}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label="Approval Status">
                    <Tag color={selectedUser.doctorProfile.approvalStatus === 'approved' ? 'green' : selectedUser.doctorProfile.approvalStatus === 'rejected' ? 'red' : 'orange'}>
                      {selectedUser.doctorProfile.approvalStatus?.toUpperCase()}
                    </Tag>
                  </Descriptions.Item>
                  {selectedUser.doctorProfile.rejectionReason && (
                    <Descriptions.Item label="Rejection Reason">
                      <Text type="danger">{selectedUser.doctorProfile.rejectionReason}</Text>
                    </Descriptions.Item>
                  )}
                  {selectedUser.doctorProfile.bio && (
                    <Descriptions.Item label="Bio">{selectedUser.doctorProfile.bio}</Descriptions.Item>
                  )}
                  {selectedUser.doctorProfile.qualifications?.length ? (
                    <Descriptions.Item label="Qualifications">
                      <Space wrap>{selectedUser.doctorProfile.qualifications.map((q) => <Tag key={q}>{q}</Tag>)}</Space>
                    </Descriptions.Item>
                  ) : null}
                  {selectedUser.doctorProfile.languages?.length ? (
                    <Descriptions.Item label="Languages">
                      <Space wrap>{selectedUser.doctorProfile.languages.map((l) => <Tag key={l} color="blue">{l}</Tag>)}</Space>
                    </Descriptions.Item>
                  ) : null}
                </Descriptions>
              </>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title={assigningUser ? `Assign Role — ${assigningUser.fullName || assigningUser.email}` : ''}
        open={!!assigningUser}
        onCancel={() => setAssigningUser(null)}
        onOk={saveAssignRole}
        okText="Assign"
        confirmLoading={assignSaving}
        okButtonProps={{ disabled: !selectedRoleId }}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="Select a role"
          value={selectedRoleId}
          onChange={setSelectedRoleId}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          Manage available roles under Roles &amp; Permissions.
        </Text>
      </Modal>

    </div>
  );
}
