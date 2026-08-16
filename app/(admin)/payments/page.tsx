'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Tag,
  Card,
  Statistic,
  Typography,
  Alert,
  Spin,
  Row,
  Col,
} from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title } = Typography;

interface Payment {
  id: string;
  bookingId: string;
  booking?: { id: string };
  amountCents: number;
  status: string;
  gateway: string;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  success: 'green',
  completed: 'green',
  pending: 'orange',
  failed: 'red',
  refunded: 'blue',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchPayments = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const result = await apiCall('GET', `/api/admin/payments?${params}`);
      const data = result.data || result.payments || result;
      setPayments(Array.isArray(data) ? data : []);
      setPagination((prev) => ({
        ...prev,
        current: page,
        total: result.total || result.count || (Array.isArray(data) ? data.length : 0),
      }));
      // Calculate or use provided total revenue
      if (result.totalRevenue != null) {
        setTotalRevenue(result.totalRevenue);
      } else if (Array.isArray(data)) {
        const total = data
          .filter((p: Payment) => p.status === 'success' || p.status === 'completed')
          .reduce((sum: number, p: Payment) => sum + (p.amountCents || 0), 0);
        setTotalRevenue(total);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to load payments');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments(1);
  }, [fetchPayments]);

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchPayments(pag.current || 1);
  };

  const getBookingId = (record: Payment): string => {
    if (record.bookingId) return record.bookingId.slice(0, 8) + '...';
    if (record.booking?.id) return record.booking.id.slice(0, 8) + '...';
    return '—';
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => (
        <code style={{ fontSize: 12 }}>{val?.slice(0, 8)}...</code>
      ),
    },
    {
      title: 'Booking ID',
      key: 'bookingId',
      render: (_: unknown, record: Payment) => (
        <code style={{ fontSize: 12 }}>{getBookingId(record)}</code>
      ),
    },
    {
      title: 'Amount (₹)',
      dataIndex: 'amountCents',
      key: 'amountCents',
      render: (val: number) =>
        val != null
          ? `₹${(val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
          : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColor[status] || 'default'}>{status?.toUpperCase()}</Tag>
      ),
    },
    {
      title: 'Gateway',
      dataIndex: 'gateway',
      key: 'gateway',
      render: (val: string) => val ? val.charAt(0).toUpperCase() + val.slice(1) : '—',
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) =>
        val
          ? new Date(val).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          : '—',
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Payments</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={totalRevenue / 100}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="₹"
              styles={{ content: { color: '#3f8600' } }}
              formatter={(val) =>
                `₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              }
            />
          </Card>
        </Col>
      </Row>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={payments.map((p) => ({ ...p, key: p.id }))}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: false,
          }}
          onChange={handleTableChange}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}
    </div>
  );
}
