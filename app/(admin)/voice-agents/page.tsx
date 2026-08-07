'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Space, Typography,
  Tag, Popconfirm, message, Alert, Spin, Badge, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, LinkOutlined, PhoneOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title, Text } = Typography;

interface PhoneNumber {
  id: string;
  phoneNumber: string;
  label: string | null;
  assignedDoctorId: string | null;
  assignedDoctor?: {
    id: string;
    user?: { fullName?: string; phoneNumber?: string };
    specialty?: string;
  } | null;
  inboundTrunkId: string | null;
  outboundTrunkId: string | null;
  inboundDispatchRuleId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DoctorOption {
  id: string;
  user?: { fullName?: string };
  specialty?: string;
}

export default function VoiceAgentsPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  // Add number modal
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm] = Form.useForm();

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignForm] = Form.useForm();
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);

  const fetchNumbers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', `/api/admin/voice-agent/phone-numbers?page=${page}&limit=20`);
      setNumbers(result.data || []);
      setPagination((prev) => ({ ...prev, current: page, total: result.total || 0 }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load phone numbers');
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNumbers(1); }, [fetchNumbers]);

  const fetchDoctors = async () => {
    setDoctorsLoading(true);
    try {
      const result = await apiCall('GET', '/api/admin/doctors?limit=200&status=approved');
      setDoctors(result.data || []);
    } catch {
      message.error('Failed to load doctors');
    } finally {
      setDoctorsLoading(false);
    }
  };

  // ── Add phone number ────────────────────────────────────────────────────────

  const openAddModal = () => {
    addForm.resetFields();
    setAddOpen(true);
  };

  const handleAdd = async () => {
    const values = await addForm.validateFields().catch(() => null);
    if (!values) return;
    setAddLoading(true);
    try {
      await apiCall('POST', '/api/admin/voice-agent/phone-numbers', values);
      message.success('Phone number added');
      setAddOpen(false);
      fetchNumbers(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add number');
      else message.error('Failed to add number');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Assign phone number ─────────────────────────────────────────────────────

  const openAssignModal = async (id: string) => {
    setAssigningId(id);
    assignForm.resetFields();
    setAssignOpen(true);
    await fetchDoctors();
  };

  const handleAssign = async () => {
    if (!assigningId) return;
    const values = await assignForm.validateFields().catch(() => null);
    if (!values) return;
    setAssignLoading(true);
    try {
      await apiCall('PATCH', `/api/admin/voice-agent/phone-numbers/${assigningId}/assign`, values);
      message.success('Phone number assigned — SIP trunks configured automatically');
      setAssignOpen(false);
      fetchNumbers(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to assign number');
      else message.error('Failed to assign number');
    } finally {
      setAssignLoading(false);
    }
  };

  // ── Delete phone number ─────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await apiCall('DELETE', `/api/admin/voice-agent/phone-numbers/${id}`);
      message.success('Phone number deleted');
      fetchNumbers(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete number');
      else message.error('Failed to delete number');
    }
  };

  // ── Table columns ───────────────────────────────────────────────────────────

  const columns = [
    {
      title: 'Phone Number',
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      render: (v: string) => (
        <Space>
          <PhoneOutlined style={{ color: '#1677ff' }} />
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    {
      title: 'Label',
      dataIndex: 'label',
      key: 'label',
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Assigned Doctor',
      key: 'assignedDoctor',
      render: (_: unknown, r: PhoneNumber) => {
        if (!r.assignedDoctorId) return <Tag>Unassigned</Tag>;
        const name = r.assignedDoctor?.user?.fullName;
        const specialty = r.assignedDoctor?.specialty;
        return (
          <Space orientation="vertical" size={0}>
            <Text>{name || r.assignedDoctorId}</Text>
            {specialty && <Text type="secondary" style={{ fontSize: 12 }}>{specialty}</Text>}
          </Space>
        );
      },
    },
    {
      title: 'SIP Status',
      key: 'sipStatus',
      render: (_: unknown, r: PhoneNumber) => {
        const hasInbound = !!r.inboundTrunkId;
        const hasOutbound = !!r.outboundTrunkId;
        const hasDispatch = !!r.inboundDispatchRuleId;
        if (!hasInbound && !hasOutbound) return <Badge status="default" text="Not configured" />;
        return (
          <Space orientation="vertical" size={2}>
            <Tooltip title={r.inboundTrunkId || 'none'}>
              <Badge status={hasInbound ? 'success' : 'error'} text="Inbound trunk" />
            </Tooltip>
            <Tooltip title={r.outboundTrunkId || 'none'}>
              <Badge status={hasOutbound ? 'success' : 'error'} text="Outbound trunk" />
            </Tooltip>
            <Tooltip title={r.inboundDispatchRuleId || 'none'}>
              <Badge status={hasDispatch ? 'success' : 'warning'} text="Dispatch rule" />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (v: boolean) => (
        <Badge status={v ? 'success' : 'error'} text={v ? 'Active' : 'Inactive'} />
      ),
    },
    {
      title: 'Added',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, r: PhoneNumber) => (
        <Space>
          <Tooltip title="Assign to doctor">
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => openAssignModal(r.id)}
            >
              Assign
            </Button>
          </Tooltip>
          <Popconfirm
            title="Delete this phone number?"
            description="This will also remove the associated SIP trunks and dispatch rule from LiveKit."
            onConfirm={() => handleDelete(r.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Voice Agent Phone Numbers</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Manage the pool of phone numbers available for voice agents. Assigning a number to a doctor automatically configures LiveKit SIP trunks and dispatch rules.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          Add Phone Number
        </Button>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={numbers.map((n) => ({ ...n, key: n.id }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
          }}
          onChange={(pag: TablePaginationConfig) => fetchNumbers(pag.current || 1)}
          bordered
          size="middle"
        />
      )}

      {/* ── Add Phone Number Modal ──────────────────────────────────────────── */}
      <Modal
        title="Add Phone Number"
        open={addOpen}
        onOk={handleAdd}
        onCancel={() => setAddOpen(false)}
        confirmLoading={addLoading}
        okText="Add Number"
        destroyOnHidden
        width={480}
      >
        <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Phone Number"
            name="phoneNumber"
            rules={[
              { required: true, message: 'Phone number is required' },
              { pattern: /^\+[1-9]\d{6,14}$/, message: 'Use E.164 format, e.g. +919876543210' },
            ]}
          >
            <Input placeholder="+919876543210" prefix={<PhoneOutlined />} />
          </Form.Item>
          <Form.Item label="Label" name="label">
            <Input placeholder="e.g. Mumbai DID, Toll-free 1…" />
          </Form.Item>
        </Form>
        <Alert
          type="info"
          showIcon
          message="The number must already be purchased from your SIP trunk provider (e.g. Twilio, Telnyx) and configured to route to your LiveKit SIP service."
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* ── Assign Doctor Modal ─────────────────────────────────────────────── */}
      <Modal
        title="Assign Phone Number to Doctor"
        open={assignOpen}
        onOk={handleAssign}
        onCancel={() => setAssignOpen(false)}
        confirmLoading={assignLoading}
        okText="Assign & Configure SIP"
        destroyOnHidden
        width={480}
      >
        <Form form={assignForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="Doctor"
            name="doctorId"
            rules={[{ required: true, message: 'Please select a doctor' }]}
          >
            <Select
              showSearch
              placeholder="Search approved doctors…"
              loading={doctorsLoading}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={doctors.map((d) => ({
                value: d.id,
                label: d.user?.fullName
                  ? `${d.user.fullName}${d.specialty ? ` — ${d.specialty}` : ''}`
                  : d.id,
              }))}
            />
          </Form.Item>
        </Form>
        <Alert
          type="info"
          showIcon
          message="Assigning will automatically create LiveKit SIP inbound/outbound trunks and an agent dispatch rule for this number. The doctor must have voice agent access and a published agent."
          style={{ marginTop: 8 }}
        />
      </Modal>
    </div>
  );
}
