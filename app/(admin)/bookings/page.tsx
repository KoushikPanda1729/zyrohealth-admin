'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Tag,
  Tabs,
  Typography,
  Alert,
  Spin,
  Button,
  Modal,
  message,
} from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title } = Typography;

type BookingStatus = 'all' | 'pending' | 'confirmed' | 'paid' | 'active' | 'completed' | 'cancelled';

interface Booking {
  id: string;
  patient: { fullName: string } | string;
  doctor: { fullName: string } | string;
  status: string;
  scheduledAt: string;
  amount: number;
  paymentStatus?: string;
}

const statusColor: Record<string, string> = {
  pending: 'orange',
  confirmed: 'blue',
  paid: 'green',
  active: 'cyan',
  completed: 'geekblue',
  cancelled: 'red',
};

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BookingStatus>('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async (page = 1, status: BookingStatus = 'all') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status !== 'all') params.append('status', status);

      const result = await apiCall('GET', `/api/admin/bookings?${params}`);
      setBookings(result.data || result.bookings || result);
      setPagination((prev) => ({
        ...prev,
        current: page,
        total: result.total || result.count || (result.data || result).length,
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to load bookings');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings(1, statusFilter);
  }, [statusFilter, fetchBookings]);

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchBookings(pag.current || 1, statusFilter);
  };

  const handleRefund = (booking: Booking) => {
    Modal.confirm({
      title: 'Initiate Refund',
      content: `Are you sure you want to refund this booking? This will cancel the booking and refund the full amount to the patient.`,
      okText: 'Refund',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        setRefundingId(booking.id);
        try {
          await apiCall('POST', `/api/admin/bookings/${booking.id}/refund`, {});
          message.success('Refund initiated successfully');
          fetchBookings(pagination.current, statusFilter);
        } catch (err: unknown) {
          if (axios.isAxiosError(err)) {
            message.error(err.response?.data?.message || 'Refund failed');
          } else {
            message.error('Refund failed');
          }
        } finally {
          setRefundingId(null);
        }
      },
    });
  };

  const getPersonName = (person: { fullName: string } | string | undefined): string => {
    if (!person) return '—';
    if (typeof person === 'string') return person;
    return person.fullName || '—';
  };

  const isRefunded = (b: Booking) => b.paymentStatus === 'refunded';

  const canRefund = (b: Booking) =>
    !isRefunded(b) &&
    (b.status === 'paid' || b.status === 'active' || b.status === 'confirmed' || b.status === 'cancelled') &&
    b.paymentStatus === 'success';

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => <code style={{ fontSize: 12 }}>{val?.slice(0, 8)}...</code>,
    },
    {
      title: 'Patient',
      dataIndex: 'patient',
      key: 'patient',
      render: (val: { fullName: string } | string) => getPersonName(val),
    },
    {
      title: 'Doctor',
      dataIndex: 'doctor',
      key: 'doctor',
      render: (val: { fullName: string } | string) => getPersonName(val),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: Booking) => (
        <>
          <Tag color={statusColor[status] || 'default'}>{status?.toUpperCase()}</Tag>
          {isRefunded(record) && <Tag color="purple" style={{ marginLeft: 4 }}>REFUNDED</Tag>}
        </>
      ),
    },
    {
      title: 'Scheduled At',
      dataIndex: 'scheduledAt',
      key: 'scheduledAt',
      render: (val: string) =>
        val ? new Date(val).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      render: (val: number) =>
        val != null ? `₹${(val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—',
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: Booking) => {
        if (isRefunded(record)) {
          return <Tag color="purple">Refunded</Tag>;
        }
        if (canRefund(record)) {
          return (
            <Button
              danger
              size="small"
              icon={<RollbackOutlined />}
              loading={refundingId === record.id}
              onClick={() => handleRefund(record)}
            >
              Refund
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const tabItems = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'paid', label: 'Paid' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Bookings</Title>

      <Tabs
        activeKey={statusFilter}
        onChange={(key) => setStatusFilter(key as BookingStatus)}
        items={tabItems}
        style={{ marginBottom: 16 }}
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={bookings.map((b) => ({ ...b, key: b.id }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
          }}
          onChange={handleTableChange}
          bordered
          size="middle"
        />
      )}
    </div>
  );
}
