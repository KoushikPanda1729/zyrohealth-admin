'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Modal, message, Space, Select, Popconfirm, Timeline, Descriptions,
} from 'antd';
import { EyeOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title, Text } = Typography;

type OrderStatus =
  | 'placed' | 'confirmed' | 'packed' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';

const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  picked_up: 'Picked Up',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  placed: 'blue',
  confirmed: 'cyan',
  packed: 'geekblue',
  picked_up: 'purple',
  out_for_delivery: 'gold',
  delivered: 'green',
  cancelled: 'red',
};

const FORWARD_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['picked_up', 'cancelled'],
  picked_up: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

interface OrderItem { name: string; genericName?: string; quantity: number; unitPriceCents: number; subtotalCents: number; }
interface StatusEvent { status: OrderStatus; at: string; byUserId?: string; note?: string; }
interface MedicineOrder {
  id: string;
  patient: { fullName?: string; phoneNumber?: string };
  items: OrderItem[];
  totalCents: number;
  status: OrderStatus;
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  deliveryPhone: string;
  statusHistory: StatusEvent[];
  createdAt: string;
}

function formatCents(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

export default function MedicineOrdersPage() {
  const [orders, setOrders] = useState<MedicineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
  const [selected, setSelected] = useState<MedicineOrder | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus | undefined>(undefined);
  const [updating, setUpdating] = useState(false);

  const fetchOrders = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const qs = `page=${page}&limit=20${statusFilter ? `&status=${statusFilter}` : ''}`;
      const result = await apiCall('GET', `/api/admin/medicine-orders?${qs}`);
      const payload = result.data ?? result;
      setOrders(Array.isArray(payload) ? payload : payload.data || []);
      setPagination((prev) => ({
        ...prev, current: page,
        total: result.total || result.pagination?.total || (Array.isArray(payload) ? payload.length : 0),
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load orders');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchOrders(1); }, [fetchOrders]);

  const openDetail = (order: MedicineOrder) => {
    setSelected(order);
    setNextStatus(undefined);
  };

  const advanceStatus = async () => {
    if (!selected || !nextStatus) return;
    setUpdating(true);
    try {
      await apiCall('PATCH', `/api/admin/medicine-orders/${selected.id}/status`, { status: nextStatus });
      message.success('Order status updated');
      setSelected(null);
      fetchOrders(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update status');
      else message.error('An unexpected error occurred');
    } finally { setUpdating(false); }
  };

  const cancelOrder = async () => {
    if (!selected) return;
    setUpdating(true);
    try {
      await apiCall('PATCH', `/api/admin/medicine-orders/${selected.id}/status`, { status: 'cancelled' });
      message.success('Order cancelled');
      setSelected(null);
      fetchOrders(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to cancel order');
      else message.error('An unexpected error occurred');
    } finally { setUpdating(false); }
  };

  const columns = [
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, order: MedicineOrder) => {
        const name = order.patient?.fullName || order.patient?.phoneNumber;
        return name ? <Text>{name}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Items', key: 'items',
      render: (_: unknown, order: MedicineOrder) => (
        <Text>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</Text>
      ),
    },
    {
      title: 'Total', key: 'total',
      render: (_: unknown, order: MedicineOrder) => <Text>{formatCents(order.totalCents)}</Text>,
    },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, order: MedicineOrder) => (
        <Tag color={STATUS_COLORS[order.status]}>{STATUS_LABELS[order.status]}</Tag>
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
      render: (_: unknown, order: MedicineOrder) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(order)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Medicine Orders</Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Filter by status"
          style={{ width: 200 }}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v)}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </Space>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={orders.map((o) => ({ ...o, key: o.id }))}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false, showTotal: (t) => `${t} orders` }}
          onChange={(p: TablePaginationConfig) => fetchOrders(p.current || 1)}
          bordered size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title={<span><MedicineBoxOutlined style={{ marginRight: 8 }} />Order Detail</span>}
        open={!!selected}
        onCancel={() => setSelected(null)}
        width={640}
        destroyOnClose
        footer={
          selected ? (
            <Space wrap>
              {FORWARD_TRANSITIONS[selected.status].filter((s) => s !== 'cancelled').length > 0 && (
                <>
                  <Select
                    placeholder="Advance to..."
                    style={{ width: 180 }}
                    value={nextStatus}
                    onChange={(v) => setNextStatus(v)}
                    options={FORWARD_TRANSITIONS[selected.status]
                      .filter((s) => s !== 'cancelled')
                      .map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                  />
                  <Button type="primary" loading={updating} disabled={!nextStatus} onClick={advanceStatus}>
                    Update Status
                  </Button>
                </>
              )}
              {FORWARD_TRANSITIONS[selected.status].includes('cancelled') && (
                <Popconfirm title="Cancel this order?" onConfirm={cancelOrder} okText="Cancel Order" okButtonProps={{ danger: true }}>
                  <Button danger loading={updating}>Cancel Order</Button>
                </Popconfirm>
              )}
              <Button onClick={() => setSelected(null)}>Close</Button>
            </Space>
          ) : null
        }
      >
        {selected && (
          <div>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Patient">
                {selected.patient?.fullName || selected.patient?.phoneNumber || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Delivery Address">
                {selected.deliveryAddressLine1}
                {selected.deliveryAddressLine2 ? `, ${selected.deliveryAddressLine2}` : ''}, {selected.deliveryCity}, {selected.deliveryState} {selected.deliveryPincode}
              </Descriptions.Item>
              <Descriptions.Item label="Delivery Phone">{selected.deliveryPhone}</Descriptions.Item>
              <Descriptions.Item label="Total">{formatCents(selected.totalCents)}</Descriptions.Item>
            </Descriptions>

            <Text strong>Items</Text>
            <ul style={{ marginTop: 8 }}>
              {selected.items.map((item, i) => (
                <li key={i}>
                  {item.name} {item.genericName ? `(${item.genericName})` : ''} × {item.quantity} — {formatCents(item.subtotalCents)}
                </li>
              ))}
            </ul>

            <Text strong>Status History</Text>
            <Timeline
              style={{ marginTop: 12 }}
              items={selected.statusHistory.map((event) => ({
                color: STATUS_COLORS[event.status],
                children: (
                  <span>
                    <strong>{STATUS_LABELS[event.status]}</strong> — {new Date(event.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    {event.note ? ` (${event.note})` : ''}
                  </span>
                ),
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
