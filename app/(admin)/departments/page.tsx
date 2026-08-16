'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Button, Space, Popconfirm, message, Modal, Input,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ClusterOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface DepartmentRow {
  id: string;
  name: string;
  description?: string;
  updatedAt: string;
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [isCreate, setIsCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/departments');
      setDepartments(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load departments');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setIsCreate(true);
    setEditing(null);
    setName('');
    setDescription('');
  };

  const openEdit = (dept: DepartmentRow) => {
    setIsCreate(false);
    setEditing(dept);
    setName(dept.name);
    setDescription(dept.description ?? '');
  };

  const closeModal = () => { setIsCreate(false); setEditing(null); };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isCreate) {
        await apiCall('POST', '/api/admin/departments', { name: name.trim(), description: description.trim() || undefined });
        message.success('Department created');
      } else if (editing) {
        await apiCall('PATCH', `/api/admin/departments/${editing.id}`, { name: name.trim(), description: description.trim() || undefined });
        message.success('Department updated');
      }
      closeModal();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save department');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const deleteDepartment = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/admin/departments/${id}`);
      message.success('Department deleted');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete department');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (v?: string) => v || '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, d: DepartmentRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(d)}>Edit</Button>
          <Popconfirm title="Delete this department?" onConfirm={() => deleteDepartment(d.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === d.id}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ClusterOutlined style={{ marginRight: 8 }} />Departments
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Department</Button>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {departments.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No departments yet"
          description="Departments are a simple way to organize your staff (e.g. Finance, Support) — they're labels, not permission boundaries. Assign staff to one when inviting them."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={departments.map((d) => ({ ...d, key: d.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Modal
        title={isCreate ? 'New Department' : `Edit Department — ${editing?.name ?? ''}`}
        open={isCreate || !!editing}
        onCancel={closeModal}
        onOk={save}
        okText="Save"
        confirmLoading={saving}
        okButtonProps={{ disabled: !name.trim() }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Department name</Text>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance" style={{ marginTop: 4 }} autoFocus />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Description</Text>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ marginTop: 4 }} />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
