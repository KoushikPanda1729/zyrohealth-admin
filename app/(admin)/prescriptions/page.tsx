'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Tooltip, Button, Modal, message, Divider, Space,
} from 'antd';
import { FilePdfOutlined, EyeOutlined, MedicineBoxOutlined, ExperimentOutlined, PlusSquareOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title, Text } = Typography;
const TEAL = '#0e7490';

interface Medicine { name: string; genericName?: string; dosage: string; frequency: string; duration: string; route: string; notes?: string; }
interface Test { name: string; category?: string; instructions?: string; }
interface Prescription {
  id: string;
  bookingId: string;
  diagnosis?: string;
  notes?: string;
  medicines: Medicine[];
  tests: Test[];
  isSent: boolean;
  pdfUrl?: string;
  createdAt: string;
  booking?: {
    doctor?: { fullName?: string; doctorProfile?: { specialty?: string; licenseNumber?: string; qualifications?: string[] } };
    patient?: { fullName?: string; phoneNumber?: string };
  };
}

function PrescriptionPad({ rx }: { rx: Prescription }) {
  const rawName = rx.booking?.doctor?.fullName ?? '';
  const doctorName = rawName
    ? (rawName.toLowerCase().startsWith('dr.') ? rawName : `Dr. ${rawName}`)
    : 'Doctor';
  const specialty = rx.booking?.doctor?.doctorProfile?.specialty ?? '';
  const qualifications = (rx.booking?.doctor?.doctorProfile?.qualifications ?? []).join(', ');
  const licenseNo = rx.booking?.doctor?.doctorProfile?.licenseNumber ?? '';
  const patientName = rx.booking?.patient?.fullName || rx.booking?.patient?.phoneNumber || '—';
  const dateStr = new Date(rx.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' });
  const refNo = rx.id.slice(0, 8).toUpperCase();

  return (
    // Always a white "paper" — this mimics a printed document, so it
    // deliberately does NOT follow the app's dark/light theme (the text
    // colors below assume a white background always).
    <div style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottom: `3px solid ${TEAL}`, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <PlusSquareOutlined style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>HealthPlus</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Digital Health Platform</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>{doctorName}</div>
          {specialty && <div style={{ fontSize: 13, color: '#374151' }}>{specialty}</div>}
          {qualifications && <div style={{ fontSize: 12, color: '#64748b' }}>{qualifications}</div>}
          {licenseNo && <div style={{ fontSize: 11, color: '#94a3b8' }}>Reg. No.: {licenseNo}</div>}
          <div style={{ marginTop: 4, height: 2, background: TEAL, borderRadius: 2 }} />
        </div>
      </div>

      {/* Patient info row */}
      <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        {[
          { label: 'PATIENT', value: patientName, flex: 2 },
          { label: 'DATE', value: dateStr, flex: 2 },
          { label: 'REF. NO.', value: refNo, flex: 1 },
          ...(rx.diagnosis ? [{ label: 'DIAGNOSIS', value: rx.diagnosis, flex: 3 }] : []),
        ].map((item, i, arr) => (
          <div key={item.label} style={{ flex: item.flex, padding: '8px 14px', borderRight: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none', background: '#f8fafc' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{item.value}</div>
          </div>
        ))}
        <div style={{ padding: '8px 14px', background: '#f8fafc', display: 'flex', alignItems: 'center' }}>
          <Tag color={rx.isSent ? 'green' : 'orange'} style={{ margin: 0 }}>{rx.isSent ? 'Sent' : 'Draft'}</Tag>
        </div>
      </div>

      {/* Rx + Medicines */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#1e293b', lineHeight: 1 }}>℞</span>
        <Text style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}><MedicineBoxOutlined style={{ marginRight: 5 }} />Medicines</Text>
      </div>
      {rx.medicines?.map((med, i) => (
        <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <Text style={{ color: '#cbd5e1', minWidth: 20, fontSize: 13 }}>{i + 1}.</Text>
            <Text strong style={{ fontSize: 14, color: '#1e293b' }}>{med.name}</Text>
            {med.genericName && <Text style={{ fontSize: 12, color: '#64748b' }}>({med.genericName})</Text>}
          </div>
          <div style={{ marginLeft: 20, fontSize: 13, color: '#475569' }}>
            <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '1px 7px', marginRight: 6, fontWeight: 600, fontSize: 12 }}>{med.dosage}</span>
            {med.frequency}<span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>{med.duration}<span style={{ color: '#cbd5e1', margin: '0 6px' }}>·</span>
            <span style={{ color: '#94a3b8' }}>{med.route}</span>
            {med.notes && <span style={{ color: '#94a3b8', marginLeft: 8 }}>· {med.notes}</span>}
          </div>
        </div>
      ))}

      {/* Lab Tests */}
      {rx.tests?.length > 0 && (
        <>
          <Divider style={{ margin: '14px 0' }} />
          <Text style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}><ExperimentOutlined style={{ marginRight: 5 }} />Lab Tests</Text>
          {rx.tests.map((test, i) => (
            <div key={i} style={{ padding: '7px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#cbd5e1', minWidth: 20, fontSize: 13 }}>{i + 1}.</Text>
              <Text strong style={{ fontSize: 13, color: '#1e293b' }}>{test.name}</Text>
              {test.category && <Tag style={{ fontSize: 11, background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }}>{test.category}</Tag>}
              {test.instructions && <Text style={{ fontSize: 12, color: '#64748b' }}>— {test.instructions}</Text>}
            </div>
          ))}
        </>
      )}

      {/* Doctor Notes */}
      {rx.notes && (
        <>
          <Divider style={{ margin: '14px 0' }} />
          <div style={{ background: '#fffbe6', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 3, color: '#64748b' }}>Doctor&apos;s Notes</Text>
            <Text style={{ fontSize: 13, color: '#1e293b' }}>{rx.notes}</Text>
          </div>
        </>
      )}

      {/* Signature */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <div style={{ fontFamily: "'Brush Script MT', 'Segoe Script', cursive", fontSize: 28, color: '#1e293b', lineHeight: 1.2, marginBottom: 4 }}>
            {doctorName}
          </div>
          <div style={{ width: '100%', borderBottom: `1px solid ${TEAL}`, marginBottom: 6 }} />
          <Text style={{ fontSize: 12, color: '#64748b' }}>{doctorName}</Text>
          {specialty && <div style={{ fontSize: 11, color: '#94a3b8' }}>{specialty}</div>}
        </div>
      </div>
    </div>
  );
}

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [preview, setPreview] = useState<Prescription | null>(null);
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);

  const fetchPrescriptions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', `/api/admin/prescriptions?page=${page}&limit=20`);
      const payload = result.data ?? result;
      setPrescriptions(Array.isArray(payload) ? payload : payload.data || []);
      setPagination((prev) => ({
        ...prev, current: page,
        total: result.total || result.pagination?.total || (Array.isArray(payload) ? payload.length : 0),
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load prescriptions');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPrescriptions(1); }, [fetchPrescriptions]);

  const openPdf = async (id: string) => {
    setPdfLoading(id);
    try {
      const res = await apiCall('GET', `/api/prescriptions/${id}/pdf`);
      const url: string = res.data?.url ?? res.url;
      window.open(url, '_blank', 'noreferrer');
    } catch {
      message.error('Could not generate download link');
    } finally { setPdfLoading(null); }
  };

  const columns = [
    {
      title: 'Doctor', key: 'doctor',
      render: (_: unknown, rx: Prescription) => {
        const name = rx.booking?.doctor?.fullName;
        const specialty = rx.booking?.doctor?.doctorProfile?.specialty;
        if (!name) return <Text type="secondary">—</Text>;
        const displayName = name.toLowerCase().startsWith('dr.') ? name : `Dr. ${name}`;
        return (
          <div>
            <Text strong style={{ fontSize: 13 }}>{displayName}</Text>
            {specialty && <div style={{ fontSize: 11, color: '#888' }}>{specialty}</div>}
          </div>
        );
      },
    },
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, rx: Prescription) => {
        const name = rx.booking?.patient?.fullName || rx.booking?.patient?.phoneNumber;
        return name ? <Text>{name}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Diagnosis', dataIndex: 'diagnosis', key: 'diagnosis',
      render: (v?: string) => v
        ? <Tooltip title={v.length > 40 ? v : undefined}><span>{v.length > 40 ? v.slice(0, 40) + '…' : v}</span></Tooltip>
        : <Text type="secondary">—</Text>,
    },
    {
      title: 'Medicines', key: 'medicines',
      render: (_: unknown, rx: Prescription) =>
        rx.medicines?.length > 0
          ? <Text>{rx.medicines.length} medicine{rx.medicines.length !== 1 ? 's' : ''}</Text>
          : <Text type="secondary">—</Text>,
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, rx: Prescription) => (
        <Tag color={rx.isSent ? 'green' : 'orange'}>{rx.isSent ? 'Sent' : 'Draft'}</Tag>
      ),
    },
    {
      title: 'Created At', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => v
        ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : '—',
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, rx: Prescription) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setPreview(rx)}>View</Button>
          {rx.pdfUrl && (
            <Button
              size="small" icon={<FilePdfOutlined />}
              loading={pdfLoading === rx.id}
              onClick={() => void openPdf(rx.id)}
            >
              PDF
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Prescriptions</Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={prescriptions.map((p) => ({ ...p, key: p.id }))}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false, showTotal: (t) => `${t} prescriptions` }}
          onChange={(p: TablePaginationConfig) => fetchPrescriptions(p.current || 1)}
          bordered size="middle"
        />
      )}

      <Modal
        title={<span>Prescription</span>}
        open={!!preview}
        onCancel={() => setPreview(null)}
        width={700}
        destroyOnClose
        footer={
          preview ? (
            <Space>
              {preview.pdfUrl && (
                <Button
                  icon={<FilePdfOutlined />}
                  loading={pdfLoading === preview.id}
                  onClick={() => void openPdf(preview.id)}
                >
                  Download PDF
                </Button>
              )}
              <Button onClick={() => setPreview(null)}>Close</Button>
            </Space>
          ) : null
        }
      >
        {preview && <PrescriptionPad rx={preview} />}
      </Modal>
    </div>
  );
}
