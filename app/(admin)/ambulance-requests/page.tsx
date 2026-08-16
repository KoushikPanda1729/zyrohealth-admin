'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Table, Typography, Alert, Spin, Tag, Button, Space, message, Modal, Input, Select } from 'antd';
import { AlertOutlined, EditOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import { getStoredUserRaw } from '../../../lib/session';

const { Title, Text } = Typography;

type RequestStatus = 'requested' | 'acknowledged' | 'completed' | 'cancelled';

interface AmbulanceRequestRow {
  id: string;
  hospitalId: string;
  patientId: string;
  patient?: { fullName?: string; phoneNumber?: string };
  pickupAddress: string;
  contactPhone: string;
  notes?: string;
  status: RequestStatus;
  adminNotes?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<RequestStatus, string> = {
  requested: 'orange',
  acknowledged: 'blue',
  completed: 'green',
  cancelled: 'red',
};

export default function AmbulanceRequestsPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [requests, setRequests] = useState<AmbulanceRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AmbulanceRequestRow | null>(null);
  const [editStatus, setEditStatus] = useState<RequestStatus>('requested');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/ambulance-requests');
      setRequests(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load requests');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openEdit = (row: AmbulanceRequestRow) => {
    setEditing(row);
    setEditStatus(row.status);
    setEditAdminNotes(row.adminNotes ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await apiCall('PATCH', `/api/admin/ambulance-requests/${editing.id}`, {
        status: editStatus,
        adminNotes: editAdminNotes.trim() || undefined,
      });
      message.success('Request updated');
      setEditing(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update request');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const columns = [
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, r: AmbulanceRequestRow) => (
        <div>
          <div>{r.patient?.fullName || 'Unknown'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.patient?.phoneNumber}</Text>
        </div>
      ),
    },
    { title: 'Pickup Address', dataIndex: 'pickupAddress', key: 'pickupAddress' },
    { title: 'Contact', dataIndex: 'contactPhone', key: 'contactPhone' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', render: (v?: string) => v || '—' },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: RequestStatus) => <Tag color={STATUS_COLORS[v]}>{v[0].toUpperCase() + v.slice(1)}</Tag>,
    },
    {
      title: 'Requested', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: AmbulanceRequestRow) => (
        !readOnly
          ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>Update</Button>
          : <Text type="secondary" style={{ fontSize: 12 }}>View only</Text>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <AlertOutlined style={{ marginRight: 8 }} />Ambulance Requests
        </Title>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {requests.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No ambulance requests yet"
          description="Patient-submitted ambulance requests for your hospitals will show up here."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={requests.map((r) => ({ ...r, key: r.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Modal
        title="Update Ambulance Request"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Status</Text>
            <Select
              value={editStatus}
              onChange={setEditStatus}
              style={{ width: '100%', marginTop: 4 }}
              options={[
                { value: 'requested', label: 'Requested' },
                { value: 'acknowledged', label: 'Acknowledged' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Admin notes</Text>
            <Input.TextArea
              value={editAdminNotes}
              onChange={(e) => setEditAdminNotes(e.target.value)}
              rows={3}
              style={{ marginTop: 4 }}
              placeholder="e.g. Ambulance dispatched, ETA 10 mins"
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
