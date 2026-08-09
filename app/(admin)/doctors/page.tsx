'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Modal, Form, Input, InputNumber, Tabs, Space,
  Typography, Popconfirm, message, Alert, Spin, Drawer,
  Descriptions, Badge, Divider, Card, Empty, Select, Upload, Steps,
  TimePicker, Row, Col, Image, Dropdown, Tooltip,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, PlusOutlined, EyeOutlined,
  FileOutlined, UploadOutlined, DeleteOutlined, EditOutlined,
  MoreOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { api, apiCall } from '../../../lib/api';
import { env } from '../../../lib/env';
import type { TablePaginationConfig } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

type DoctorStatus = 'pending' | 'approved' | 'rejected' | 'all';

interface Doctor {
  id: string;
  userId: string;
  user?: {
    fullName?: string;
    phoneNumber?: string;
    email?: string;
    canCreateAgent?: boolean;
  };
  specialty?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  qualifications?: string[];
  languages?: string[];
  bio?: string;
  consultationFee?: number;
  approvalStatus: string;
  rejectionReason?: string;
  rating?: number;
  totalConsultations?: number;
  isAvailable?: boolean;
  createdAt: string;
  availabilities?: Array<{ id: string; dayOfWeek: string; startTime: string; endTime: string; slotDurationMinutes: number }>;
}

interface DoctorDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  signedUrl: string;
  mimeType: string;
  notes?: string;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  approved: 'green',
  pending: 'orange',
  rejected: 'red',
};

interface DoctorProfileFormValues {
  specialty?: string;
  licenseNumber?: string;
  yearsOfExperience?: number;
  consultationFee?: number;
  qualifications?: string[];
  languages?: string[];
  bio?: string;
}

type GenField = 'specialty' | 'bio' | 'qualifications' | 'languages';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DOC_TYPES = [
  { value: 'medical_license', label: 'Medical License' },
  { value: 'degree_certificate', label: 'Degree Certificate' },
  { value: 'id_proof', label: 'ID Proof' },
  { value: 'profile_photo', label: 'Profile Photo' },
  { value: 'other', label: 'Other' },
];

export default function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DoctorStatus>('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // Create doctor modal (multi-step)
  const [createOpen, setCreateOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [createLoading, setCreateLoading] = useState(false);
  const [createdDoctorId, setCreatedDoctorId] = useState<string | null>(null);
  const [profileValues, setProfileValues] = useState<DoctorProfileFormValues | null>(null);
  const [generating, setGenerating] = useState<GenField | null>(null);
  const [basicForm] = Form.useForm();
  const [profileForm] = Form.useForm();

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [documents, setDocuments] = useState<DoctorDocument[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // PDF preview modal
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Edit profile modal
  const [editOpen, setEditOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm] = Form.useForm();

  // Upload document state (inside drawer)
  const [uploadDocType, setUploadDocType] = useState('medical_license');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploading, setUploading] = useState(false);

  // Add availability state (inside drawer)
  const [availForm] = Form.useForm();
  const [addingAvail, setAddingAvail] = useState(false);

  const fetchDoctors = useCallback(async (page = 1, status: DoctorStatus = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status !== 'all') params.append('status', status);
      const result = await apiCall('GET', `/api/admin/doctors?${params}`);
      setDoctors(result.data || []);
      setPagination((prev) => ({ ...prev, current: page, total: result.total || 0 }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load doctors');
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDoctors(1, statusFilter); }, [statusFilter, fetchDoctors]);

  const refreshDrawer = async (id: string) => {
    try {
      const [detailRes, docsRes] = await Promise.all([
        apiCall('GET', `/api/admin/doctors/${id}`),
        apiCall('GET', `/api/admin/doctors/${id}/documents`),
      ]);
      setSelectedDoctor(detailRes.data ?? detailRes);
      setDocuments(docsRes.data ?? docsRes ?? []);
    } catch { /* keep stale */ }
  };

  const openDrawer = async (doctor: Doctor) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDocuments([]);
    try {
      await refreshDrawer(doctor.id);
    } catch {
      setSelectedDoctor(doctor);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiCall('PATCH', `/api/admin/doctors/${id}/approve`);
      message.success('Doctor approved');
      fetchDoctors(pagination.current, statusFilter);
      if (selectedDoctor?.id === id) await refreshDrawer(id);
    } catch { message.error('Failed to approve doctor'); }
  };

  const openRejectModal = (id: string) => { setRejectingId(id); setRejectReason(''); setRejectModalOpen(true); };

  const handleReject = async () => {
    if (!rejectingId) return;
    setRejectLoading(true);
    try {
      await apiCall('PATCH', `/api/admin/doctors/${rejectingId}/reject`, { reason: rejectReason });
      message.success('Doctor rejected');
      setRejectModalOpen(false);
      fetchDoctors(pagination.current, statusFilter);
      if (selectedDoctor?.id === rejectingId) await refreshDrawer(rejectingId);
    } catch { message.error('Failed to reject doctor'); }
    finally { setRejectLoading(false); }
  };

  // ── Edit Doctor Profile ────────────────────────────────────────────────────

  const openEditModal = () => {
    if (!selectedDoctor) return;
    editForm.setFieldsValue({
      specialty: selectedDoctor.specialty,
      licenseNumber: selectedDoctor.licenseNumber,
      yearsOfExperience: selectedDoctor.yearsOfExperience,
      consultationFee: selectedDoctor.consultationFee,
      qualifications: selectedDoctor.qualifications ?? [],
      languages: selectedDoctor.languages ?? [],
      bio: selectedDoctor.bio,
    });
    setEditOpen(true);
  };

  const handleEditProfile = async () => {
    if (!selectedDoctor) return;
    const values = await editForm.validateFields().catch(() => null);
    if (!values) return;
    setEditLoading(true);
    try {
      await apiCall('PATCH', `/api/admin/doctors/${selectedDoctor.id}/profile`, values);
      message.success('Profile updated');
      setEditOpen(false);
      await refreshDrawer(selectedDoctor.id);
      fetchDoctors(pagination.current, statusFilter);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Update failed');
      else message.error('Update failed');
    } finally {
      setEditLoading(false);
    }
  };

  // ── Create Doctor (multi-step) ─────────────────────────────────────────────

  const openCreateModal = () => {
    setCreateStep(0);
    setCreatedDoctorId(null);
    setProfileValues(null);
    basicForm.resetFields();
    profileForm.resetFields();
    setCreateOpen(true);
  };

  const generateProfileField = async (field: GenField) => {
    setGenerating(field);
    try {
      const current = profileForm.getFieldsValue();
      const basic = basicForm.getFieldsValue();
      const result = await apiCall('POST', '/api/admin/doctors/generate', {
        field,
        fullName: basic.fullName,
        specialty: current.specialty,
        yearsOfExperience: current.yearsOfExperience,
        bio: current.bio,
        qualifications: current.qualifications,
        languages: current.languages,
      });
      const { value } = result.data ?? result;
      if (field === 'qualifications' || field === 'languages') {
        const list = (value as string).split(',').map((s) => s.trim()).filter(Boolean);
        profileForm.setFieldValue(field, list);
      } else {
        profileForm.setFieldValue(field, value);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'AI generation failed');
      else message.error('AI generation failed');
    } finally {
      setGenerating(null);
    }
  };

  const genButton = (field: GenField) => (
    <Tooltip title="Generate with AI">
      <Button
        type="text"
        size="small"
        icon={<ThunderboltOutlined />}
        loading={generating === field}
        onClick={() => generateProfileField(field)}
        style={{ color: '#1677ff' }}
      >
        AI
      </Button>
    </Tooltip>
  );

  const fieldLabel = (text: string, field: GenField) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span>{text}</span>
      {genButton(field)}
    </div>
  );

  const handleCreateBasic = async () => {
    const values = await basicForm.validateFields();
    setCreateLoading(true);
    try {
      const result = await apiCall('POST', '/api/admin/doctors/create', values);
      const profileId = result.data?.profile?.id ?? result.profile?.id;
      setCreatedDoctorId(profileId);
      setCreateStep(1);
      message.success('Doctor account created — OTP sent to their phone');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create doctor');
      else message.error('Failed');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleCreateProfile = async () => {
    const values = await profileForm.validateFields().catch(() => null);
    if (!values) return;
    setProfileValues(values as DoctorProfileFormValues);
    setCreateStep(2);
  };

  const handleConfirmAndSave = async () => {
    if (!createdDoctorId) return;
    const values = profileValues;

    const payload: Record<string, unknown> = {};
    if (values?.specialty) payload.specialty = values.specialty;
    if (values?.licenseNumber) payload.licenseNumber = values.licenseNumber;
    if (values?.yearsOfExperience != null) payload.yearsOfExperience = values.yearsOfExperience;
    if (values?.bio) payload.bio = values.bio;
    if (values?.consultationFee != null) payload.consultationFee = values.consultationFee;
    if (values?.qualifications?.length) payload.qualifications = values.qualifications;
    if (values?.languages?.length) payload.languages = values.languages;

    if (Object.keys(payload).length > 0) {
      setCreateLoading(true);
      try {
        await apiCall('PATCH', `/api/admin/doctors/${createdDoctorId}/profile`, payload);
        message.success('Profile details saved');
      } catch {
        message.warning('Profile save failed — you can update it from the drawer later');
      } finally {
        setCreateLoading(false);
      }
    }

    setCreateStep(3);
    fetchDoctors(pagination.current, statusFilter);
  };

  const finishCreate = async () => {
    setCreateOpen(false);
    if (createdDoctorId) {
      const result = await apiCall('GET', `/api/admin/doctors/${createdDoctorId}`).catch(() => null);
      if (result?.data) {
        setDrawerOpen(true);
        setDrawerLoading(true);
        await refreshDrawer(createdDoctorId);
        setDrawerLoading(false);
      }
    }
  };

  // ── Document upload (inside drawer) ────────────────────────────────────────

  const handleDocUpload = async (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
    if (!selectedDoctor) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', options.file as File);
    fd.append('documentType', uploadDocType);
    if (uploadNotes) fd.append('notes', uploadNotes);
    try {
      await api.post(
        `${env.API_URL}/api/admin/doctors/${selectedDoctor.id}/documents`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      message.success('Document uploaded');
      setUploadNotes('');
      await refreshDrawer(selectedDoctor.id);
    } catch {
      message.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    // No admin delete endpoint yet; just warn
    message.info('Document deletion coming soon');
    void docId;
  };

  // ── Availability (inside drawer) ────────────────────────────────────────────

  const handleAddAvailability = async () => {
    if (!selectedDoctor) return;
    const values = await availForm.validateFields().catch(() => null);
    if (!values) return;
    setAddingAvail(true);
    try {
      await apiCall('POST', `/api/admin/doctors/${selectedDoctor.id}/availability`, {
        dayOfWeek: values.dayOfWeek,
        startTime: (values.startTime as dayjs.Dayjs).format('HH:mm'),
        endTime: (values.endTime as dayjs.Dayjs).format('HH:mm'),
        slotDurationMinutes: values.slotDurationMinutes ?? 30,
      });
      message.success('Availability added');
      availForm.resetFields();
      await refreshDrawer(selectedDoctor.id);
    } catch { message.error('Failed to add availability'); }
    finally { setAddingAvail(false); }
  };

  const handleDeleteAvailability = async (availId: string) => {
    if (!selectedDoctor) return;
    try {
      await apiCall('DELETE', `/api/admin/doctors/${selectedDoctor.id}/availability/${availId}`);
      message.success('Availability removed');
      await refreshDrawer(selectedDoctor.id);
    } catch { message.error('Failed to remove availability'); }
  };

  // ── Grant / revoke agent access ────────────────────────────────────────────

  const [agentAccessLoading, setAgentAccessLoading] = useState(false);

  const handleGrantAgentAccess = async () => {
    if (!selectedDoctor) return;
    setAgentAccessLoading(true);
    try {
      await apiCall('PATCH', `/api/admin/doctors/${selectedDoctor.id}/grant-agent-access`);
      message.success('Voice agent access granted');
      await refreshDrawer(selectedDoctor.id);
      fetchDoctors(pagination.current, statusFilter);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to grant access');
      else message.error('Failed to grant access');
    } finally {
      setAgentAccessLoading(false);
    }
  };

  const handleRevokeAgentAccess = async () => {
    if (!selectedDoctor) return;
    setAgentAccessLoading(true);
    try {
      await apiCall('PATCH', `/api/admin/doctors/${selectedDoctor.id}/revoke-agent-access`);
      message.success('Voice agent access revoked');
      await refreshDrawer(selectedDoctor.id);
      fetchDoctors(pagination.current, statusFilter);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to revoke access');
      else message.error('Failed to revoke access');
    } finally {
      setAgentAccessLoading(false);
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: Doctor) => r.user?.fullName || '—',
    },
    {
      title: 'Phone',
      key: 'phone',
      render: (_: unknown, r: Doctor) => r.user?.phoneNumber || '—',
    },
    {
      title: 'Specialty',
      dataIndex: 'specialty',
      key: 'specialty',
      render: (val: string) => val || '—',
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      render: (s: string) => <Tag color={statusColor[s] || 'default'}>{s?.toUpperCase()}</Tag>,
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      render: (v: number | string) => v ? `⭐ ${Number(v).toFixed(1)}` : '—',
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
      render: (_: unknown, record: Doctor) => {
        const items = [
          {
            key: 'view',
            icon: <EyeOutlined />,
            label: 'View Details',
            onClick: () => openDrawer(record),
          },
          ...(record.approvalStatus !== 'approved' ? [{
            key: 'approve',
            icon: <CheckOutlined />,
            label: 'Approve',
            onClick: () => handleApprove(record.id),
          }] : []),
          ...(record.approvalStatus !== 'rejected' ? [{
            key: 'reject',
            icon: <CloseOutlined />,
            label: 'Reject',
            danger: true,
            onClick: () => openRejectModal(record.id),
          }] : []),
        ];
        return (
          <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined style={{ fontSize: 18 }} />} />
          </Dropdown>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Doctors Management</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Add Doctor
        </Button>
      </div>

      <Tabs
        activeKey={statusFilter}
        onChange={(key) => setStatusFilter(key as DoctorStatus)}
        items={[
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table
          columns={columns}
          dataSource={doctors.map((d) => ({ ...d, key: d.id }))}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false }}
          onChange={(pag: TablePaginationConfig) => fetchDoctors(pag.current || 1, statusFilter)}
          bordered
          size="middle"
        />
      )}

      {/* ── Detail Drawer ──────────────────────────────────────────────────── */}
      <Drawer
        title={selectedDoctor?.user?.fullName || 'Doctor Details'}
        placement="right"
        styles={{ wrapper: { width: 620 } }}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          selectedDoctor && (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={openEditModal}>Edit</Button>
              {selectedDoctor.approvalStatus !== 'approved' && (
                <Button type="primary" size="small" style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => handleApprove(selectedDoctor.id)}>
                  Approve
                </Button>
              )}
              {selectedDoctor.approvalStatus !== 'rejected' && (
                <Button danger size="small" onClick={() => openRejectModal(selectedDoctor.id)}>Reject</Button>
              )}
            </Space>
          )
        }
      >
        {drawerLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : selectedDoctor ? (
          <>
            {/* Profile Info */}
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Full Name">{selectedDoctor.user?.fullName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selectedDoctor.user?.phoneNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Email">{selectedDoctor.user?.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Specialty">{selectedDoctor.specialty || '—'}</Descriptions.Item>
              <Descriptions.Item label="License No.">{selectedDoctor.licenseNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Experience">{selectedDoctor.yearsOfExperience ? `${selectedDoctor.yearsOfExperience} years` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Consultation Fee">{selectedDoctor.consultationFee ? `₹${selectedDoctor.consultationFee}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Rating">{selectedDoctor.rating ? `⭐ ${Number(selectedDoctor.rating).toFixed(1)}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Total Consultations">{selectedDoctor.totalConsultations ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Available">
                <Badge status={selectedDoctor.isAvailable ? 'success' : 'error'} text={selectedDoctor.isAvailable ? 'Yes' : 'No'} />
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor[selectedDoctor.approvalStatus] || 'default'}>
                  {selectedDoctor.approvalStatus?.toUpperCase()}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Voice Agent Access">
                <Space>
                  <Badge
                    status={selectedDoctor.user?.canCreateAgent ? 'success' : 'default'}
                    text={selectedDoctor.user?.canCreateAgent ? 'Granted' : 'Not granted'}
                  />
                  {selectedDoctor.user?.canCreateAgent ? (
                    <Popconfirm
                      title="Revoke voice agent access?"
                      description="The doctor will no longer be able to use the voice agent feature."
                      onConfirm={handleRevokeAgentAccess}
                      okText="Revoke"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger loading={agentAccessLoading}>Revoke Access</Button>
                    </Popconfirm>
                  ) : (
                    <Button
                      size="small"
                      type="primary"
                      loading={agentAccessLoading}
                      onClick={handleGrantAgentAccess}
                    >
                      Grant Access
                    </Button>
                  )}
                </Space>
              </Descriptions.Item>
              {selectedDoctor.rejectionReason && (
                <Descriptions.Item label="Rejection Reason">
                  <Text type="danger">{selectedDoctor.rejectionReason}</Text>
                </Descriptions.Item>
              )}
              {selectedDoctor.bio && (
                <Descriptions.Item label="Bio">{selectedDoctor.bio}</Descriptions.Item>
              )}
              {selectedDoctor.qualifications?.length ? (
                <Descriptions.Item label="Qualifications">
                  <Space wrap>{selectedDoctor.qualifications.map((q) => <Tag key={q}>{q}</Tag>)}</Space>
                </Descriptions.Item>
              ) : null}
              {selectedDoctor.languages?.length ? (
                <Descriptions.Item label="Languages">
                  <Space wrap>{selectedDoctor.languages.map((l) => <Tag key={l} color="blue">{l}</Tag>)}</Space>
                </Descriptions.Item>
              ) : null}
              <Descriptions.Item label="Joined">{new Date(selectedDoctor.createdAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>

            {/* Availability */}
            <Divider>Availability</Divider>
            {selectedDoctor.availabilities && selectedDoctor.availabilities.length > 0 ? (
              <Space wrap style={{ marginBottom: 12 }}>
                {selectedDoctor.availabilities.map((a) => (
                  <Tag
                    key={a.id}
                    color="blue"
                    closable
                    onClose={(e) => { e.preventDefault(); void handleDeleteAvailability(a.id); }}
                  >
                    {a.dayOfWeek.charAt(0).toUpperCase() + a.dayOfWeek.slice(1)}: {a.startTime} – {a.endTime} ({a.slotDurationMinutes}min slots)
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty description="No availability set" style={{ marginBottom: 12 }} />
            )}
            <Form form={availForm} layout="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Form.Item name="dayOfWeek" rules={[{ required: true }]} style={{ minWidth: 120 }}>
                <Select placeholder="Day" options={DAYS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))} />
              </Form.Item>
              <Form.Item name="startTime" rules={[{ required: true }]}>
                <TimePicker format="HH:mm" placeholder="Start" minuteStep={15} />
              </Form.Item>
              <Form.Item name="endTime" rules={[{ required: true }]}>
                <TimePicker format="HH:mm" placeholder="End" minuteStep={15} />
              </Form.Item>
              <Form.Item name="slotDurationMinutes">
                <InputNumber min={10} max={120} step={5} placeholder="Slot (min)" style={{ width: 110 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" size="small" icon={<PlusOutlined />} loading={addingAvail} onClick={handleAddAvailability}>
                  Add Slot
                </Button>
              </Form.Item>
            </Form>

            {/* Documents */}
            <Divider>Documents ({documents.length})</Divider>
            {documents.length === 0 ? (
              <Empty description="No documents uploaded" style={{ marginBottom: 12 }} />
            ) : (
              <Space orientation="vertical" style={{ width: '100%', marginBottom: 12 }}>
                {documents.map((doc) => {
                  const isImage = doc.mimeType.startsWith('image/');
                  const isPdf = doc.mimeType === 'application/pdf';
                  return (
                    <Card key={doc.id} size="small" style={{ borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Space align="start">
                          <FileOutlined style={{ fontSize: 20, color: '#1677ff', marginTop: 2 }} />
                          <div>
                            <div><Text strong>{doc.documentType.replace(/_/g, ' ').toUpperCase()}</Text></div>
                            <div><Text type="secondary" style={{ fontSize: 12 }}>{doc.fileName}</Text></div>
                            {doc.notes && <div><Text type="secondary" style={{ fontSize: 12 }}>{doc.notes}</Text></div>}
                          </div>
                        </Space>
                        <Popconfirm title="Delete document?" onConfirm={() => handleDeleteDoc(doc.id)} okText="Delete" okButtonProps={{ danger: true }}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>

                      {/* Inline preview */}
                      {isImage && (
                        <div style={{ marginTop: 8 }}>
                          <Image
                            src={doc.signedUrl}
                            alt={doc.fileName}
                            style={{ maxHeight: 160, borderRadius: 6, objectFit: 'cover' }}
                            width="100%"
                          />
                        </div>
                      )}
                      {isPdf && (
                        <div style={{ marginTop: 8 }}>
                          <Button
                            size="small"
                            type="dashed"
                            block
                            onClick={() => setPdfPreviewUrl(doc.signedUrl)}
                          >
                            Preview PDF
                          </Button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </Space>
            )}

            {/* Upload new document */}
            <Card size="small" style={{ borderRadius: 8, background: '#fafafa' }}>
              <Row gutter={8} align="middle">
                <Col span={7}>
                  <Select
                    value={uploadDocType}
                    onChange={setUploadDocType}
                    options={DOC_TYPES}
                    style={{ width: '100%' }}
                    size="small"
                  />
                </Col>
                <Col span={8}>
                  <Input
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    size="small"
                  />
                </Col>
                <Col span={9}>
                  <Upload
                    accept=".jpg,.jpeg,.png,.pdf"
                    showUploadList={false}
                    customRequest={(opts) => { void handleDocUpload(opts); }}
                    disabled={uploading}
                  >
                    <Button icon={<UploadOutlined />} size="small" loading={uploading} style={{ width: '100%' }}>
                      Upload Document
                    </Button>
                  </Upload>
                </Col>
              </Row>
            </Card>
          </>
        ) : null}
      </Drawer>

      {/* ── Create Doctor Drawer (multi-step) ──────────────────────────────── */}
      <Drawer
        title="Add New Doctor"
        placement="right"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size={620}
        destroyOnClose
        footer={
          createStep < 3 ? (
            <div style={{ textAlign: 'right' }}>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            </div>
          ) : null
        }
      >
        <Steps
          current={createStep}
          items={[
            { title: 'Account' },
            { title: 'Profile Details' },
            { title: 'Preview' },
            { title: 'Done' },
          ]}
          style={{ marginBottom: 24, marginTop: 8 }}
        />

        {/* Step 0 — Basic account */}
        {createStep === 0 && (
          <Form form={basicForm} layout="vertical">
            <Form.Item label="Phone Number" name="phone" rules={[{ required: true, message: 'Phone is required' }]}>
              <Input placeholder="+91 9876543210" />
            </Form.Item>
            <Form.Item label="Full Name" name="fullName" rules={[{ required: true, message: 'Name is required' }]}>
              <Input placeholder="Dr. John Smith" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Button type="primary" loading={createLoading} onClick={handleCreateBasic}>
                Create Account & Send OTP →
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* Step 1 — Profile details */}
        {createStep === 1 && (
          <Form form={profileForm} layout="vertical">
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              Tap <ThunderboltOutlined /> AI next to a field to have it suggested for you — it uses
              the doctor&apos;s name and whatever you&apos;ve filled in already as context. License number and
              numeric fields are never auto-filled since they&apos;re real credentials you should enter yourself.
            </Text>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label={fieldLabel('Specialty', 'specialty')} name="specialty">
                  <Input placeholder="Cardiologist, General Physician…" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="License Number" name="licenseNumber">
                  <Input placeholder="MCI-123456" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Years of Experience" name="yearsOfExperience">
                  <InputNumber min={0} max={60} style={{ width: '100%' }} placeholder="10" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label="Consultation Fee (₹)" name="consultationFee">
                  <InputNumber min={0} style={{ width: '100%' }} placeholder="500" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label={fieldLabel('Qualifications', 'qualifications')} name="qualifications">
              <Select mode="tags" placeholder="MBBS, MD, DNB…" />
            </Form.Item>
            <Form.Item label={fieldLabel('Languages', 'languages')} name="languages">
              <Select mode="tags" placeholder="English, Hindi, Tamil…" />
            </Form.Item>
            <Form.Item label={fieldLabel('Bio', 'bio')} name="bio">
              <TextArea rows={3} placeholder="Brief professional summary…" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCreateStep(3)}>Skip</Button>
                <Button type="primary" onClick={handleCreateProfile}>
                  Preview →
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}

        {/* Step 2 — Preview */}
        {createStep === 2 && (
          <div>
            <Alert
              type="info"
              showIcon
              message="Review before saving"
              description="Double-check the details below — you can go back to edit, or confirm to save this profile."
              style={{ marginBottom: 16 }}
            />
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Full Name">{basicForm.getFieldValue('fullName') || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{basicForm.getFieldValue('phone') || '—'}</Descriptions.Item>
              <Descriptions.Item label="Specialty">{profileValues?.specialty || '—'}</Descriptions.Item>
              <Descriptions.Item label="License Number">{profileValues?.licenseNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Years of Experience">
                {profileValues?.yearsOfExperience ? `${profileValues.yearsOfExperience} years` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Consultation Fee">
                {profileValues?.consultationFee ? `₹${profileValues.consultationFee}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Qualifications">
                {profileValues?.qualifications?.length ? (
                  <Space wrap>{profileValues.qualifications.map((q) => <Tag key={q}>{q}</Tag>)}</Space>
                ) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Languages">
                {profileValues?.languages?.length ? (
                  <Space wrap>{profileValues.languages.map((l) => <Tag key={l} color="blue">{l}</Tag>)}</Space>
                ) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Bio">{profileValues?.bio || '—'}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 24, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => setCreateStep(1)}>← Back</Button>
                <Button type="primary" loading={createLoading} onClick={handleConfirmAndSave}>
                  Confirm & Save →
                </Button>
              </Space>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {createStep === 3 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <Title level={4} style={{ marginBottom: 8 }}>Doctor account created!</Title>
            <Text type="secondary">
              An OTP has been sent to the doctor&apos;s phone. You can now upload their documents
              and set their availability from the detail drawer.
            </Text>
            <div style={{ marginTop: 24 }}>
              <Button type="primary" onClick={finishCreate}>
                Open Doctor Profile →
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ── PDF Preview Modal ─────────────────────────────────────────────── */}
      <Modal
        open={!!pdfPreviewUrl}
        onCancel={() => setPdfPreviewUrl(null)}
        footer={null}
        width="80vw"
        style={{ top: 20 }}
        styles={{ body: { padding: 0, height: '80vh' } }}
      >
        {pdfPreviewUrl && (
          <iframe
            src={pdfPreviewUrl}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
            title="PDF Preview"
          />
        )}
      </Modal>

      {/* ── Edit Profile Modal ────────────────────────────────────────────── */}
      <Modal
        title={`Edit Profile — ${selectedDoctor?.user?.fullName || ''}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditProfile}
        confirmLoading={editLoading}
        okText="Save Changes"
        width={580}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Specialty" name="specialty">
                <Input placeholder="Cardiologist, General Physician…" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="License Number" name="licenseNumber">
                <Input placeholder="MCI-123456" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Years of Experience" name="yearsOfExperience">
                <InputNumber min={0} max={60} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Consultation Fee (₹)" name="consultationFee">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Qualifications" name="qualifications">
            <Select mode="tags" placeholder="MBBS, MD, DNB…" />
          </Form.Item>
          <Form.Item label="Languages" name="languages">
            <Select mode="tags" placeholder="English, Hindi, Tamil…" />
          </Form.Item>
          <Form.Item label="Bio" name="bio">
            <TextArea rows={3} placeholder="Brief professional summary…" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Reject Modal ──────────────────────────────────────────────────── */}
      <Modal title="Reject Doctor" open={rejectModalOpen} onOk={handleReject}
        onCancel={() => setRejectModalOpen(false)} confirmLoading={rejectLoading}
        okText="Reject" okButtonProps={{ danger: true }}>
        <p style={{ marginBottom: 12 }}>Please provide a reason for rejection:</p>
        <TextArea rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Enter rejection reason..." />
      </Modal>
    </div>
  );
}
