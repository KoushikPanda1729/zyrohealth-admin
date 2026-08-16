'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Tag,
  Button,
  Drawer,
  Form,
  Input,
  Switch,
  Popconfirm,
  Typography,
  Space,
  message,
  Alert,
  Spin,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  UserOutlined,
  MedicineBoxOutlined,
  FileTextOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface AIDoctor {
  id: string;
  name: string;
  specialty: string;
  description: string;
  systemPrompt: string;
  isActive: boolean;
  createdAt: string;
}

type ModalMode = 'create' | 'edit';
type GenField = 'name' | 'specialty' | 'description' | 'systemPrompt';

export default function AIDoctorsPage() {
  const [doctors, setDoctors] = useState<AIDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [generating, setGenerating] = useState<GenField | null>(null);
  const [form] = Form.useForm();

  const fetchDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/ai-doctors');
      setDoctors(result.data || result.aiDoctors || result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to load AI doctors');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (doctor: AIDoctor) => {
    setModalMode('edit');
    setEditingId(doctor.id);
    form.setFieldsValue({
      name: doctor.name,
      specialty: doctor.specialty,
      description: doctor.description,
      systemPrompt: doctor.systemPrompt,
    });
    setModalOpen(true);
  };

  const generateField = async (field: GenField) => {
    setGenerating(field);
    try {
      const current = form.getFieldsValue();
      const result = await apiCall('POST', '/api/admin/ai-doctors/generate', {
        field,
        name: current.name,
        specialty: current.specialty,
        description: current.description,
        systemPrompt: current.systemPrompt,
      });
      const { value } = result.data ?? result;
      form.setFieldValue(field, value);
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
        onClick={() => generateField(field)}
        style={{ color: '#1677ff' }}
      >
        AI
      </Button>
    </Tooltip>
  );

  const fieldLabel = (icon: React.ReactNode, text: string, field: GenField) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span>{icon}{text}</span>
      {genButton(field)}
    </div>
  );

  const handleSubmit = async (values: {
    name: string;
    specialty: string;
    description: string;
    systemPrompt: string;
  }) => {
    setModalLoading(true);
    try {
      if (modalMode === 'create') {
        await apiCall('POST', '/api/admin/ai-doctors', values);
        message.success('AI Doctor created successfully');
      } else if (editingId) {
        await apiCall('PATCH', `/api/admin/ai-doctors/${editingId}`, values);
        message.success('AI Doctor updated successfully');
      }
      setModalOpen(false);
      form.resetFields();
      fetchDoctors();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        message.error(err.response?.data?.message || 'Operation failed');
      } else {
        message.error('Operation failed');
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiCall('DELETE', `/api/admin/ai-doctors/${id}`);
      message.success('AI Doctor deleted successfully');
      fetchDoctors();
    } catch {
      message.error('Failed to delete AI doctor');
    }
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    try {
      await apiCall('PATCH', `/api/admin/ai-doctors/${id}/toggle-active`);
      message.success(`AI Doctor ${currentValue ? 'deactivated' : 'activated'}`);
      fetchDoctors();
    } catch {
      message.error('Failed to toggle status');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => (
        <Space>
          <RobotOutlined style={{ color: '#1677ff' }} />
          <strong>{val}</strong>
        </Space>
      ),
    },
    {
      title: 'Specialty',
      dataIndex: 'specialty',
      key: 'specialty',
      render: (val: string) => val ? <Tag color="blue">{val}</Tag> : '—',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (val: string) => {
        if (!val) return '—';
        const truncated = val.length > 80 ? val.slice(0, 80) + '...' : val;
        return (
          <Tooltip title={val.length > 80 ? val : undefined}>
            <Text type="secondary">{truncated}</Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (val: boolean, record: AIDoctor) => (
        <Switch
          checked={val}
          onChange={() => handleToggleActive(record.id, val)}
          size="small"
        />
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) =>
        val ? new Date(val).toLocaleDateString() : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, record: AIDoctor) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete AI Doctor"
            description="Are you sure you want to delete this AI doctor? This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Tooltip title="Delete">
              <Button type="text" icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 8 }} />AI Doctors
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Create AI Doctor
        </Button>
      </div>

      {error && (
        <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={doctors.map((d) => ({ ...d, key: d.id }))}
          pagination={{ pageSize: 20 }}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}

      {/* Create / Edit Drawer */}
      <Drawer
        title={
          <span>
            <RobotOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            {modalMode === 'create' ? 'Create AI Doctor' : 'Edit AI Doctor'}
          </span>
        }
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        size={520}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button
              onClick={() => {
                setModalOpen(false);
                form.resetFields();
              }}
            >
              Cancel
            </Button>
            <Button type="primary" loading={modalLoading} onClick={() => form.submit()}>
              {modalMode === 'create' ? 'Create' : 'Save Changes'}
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Tap <ThunderboltOutlined /> AI next to any field to have it generated for you — it uses whatever
          you&apos;ve already filled in as context, so filling Specialty first gives better results for the rest.
          Tap it again for a fresh alternative.
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label={fieldLabel(<UserOutlined style={{ marginRight: 6 }} />, 'Name', 'name')}
            name="name"
            rules={[{ required: true, message: 'Name is required' }]}
          >
            <Input placeholder="e.g. Dr. Aria (General Physician)" />
          </Form.Item>

          <Form.Item
            label={fieldLabel(<MedicineBoxOutlined style={{ marginRight: 6 }} />, 'Specialty', 'specialty')}
            name="specialty"
          >
            <Input placeholder="e.g. General Medicine, Cardiology, Dermatology" />
          </Form.Item>

          <Form.Item
            label={fieldLabel(<FileTextOutlined style={{ marginRight: 6 }} />, 'Description', 'description')}
            name="description"
          >
            <TextArea
              rows={3}
              placeholder="Brief description of what this AI doctor specializes in..."
            />
          </Form.Item>

          <Form.Item
            label={fieldLabel(<RobotOutlined style={{ marginRight: 6 }} />, 'System Prompt', 'systemPrompt')}
            name="systemPrompt"
            rules={[{ required: true, message: 'System prompt is required' }]}
          >
            <TextArea
              rows={10}
              placeholder={`You are Dr. Aria, a compassionate and knowledgeable General Physician AI assistant for ZyroHealth, a telemedicine platform. Your role is to:
1. Listen carefully to patient symptoms and concerns
2. Ask relevant follow-up questions to better understand the condition
3. Provide general health guidance and information
4. Recommend seeking in-person or specialist consultation when necessary
5. Never provide definitive diagnoses or replace professional medical advice`}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
