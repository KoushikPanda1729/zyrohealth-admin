'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Modal, Descriptions, message, Timeline, Space, Input,
} from 'antd';
import { CarOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { TextArea } = Input;

// The WhatsApp/chat checkout only ever collects one free-text reply for
// the address — city/state/pincode get left as this literal placeholder
// (see backend's createDirectCatalogOrder) rather than actually being
// blank, so a naive falsy-check wouldn't catch it.
const PLACEHOLDER = '—';
function isRealValue(v: string | undefined): v is string {
  return !!v && v !== PLACEHOLDER;
}
function deliverToSummary(o: { deliveryCity: string; deliveryAddressLine1: string }): string {
  return isRealValue(o.deliveryCity) ? o.deliveryCity : o.deliveryAddressLine1;
}
function fullDeliveryAddress(o: {
  deliveryAddressLine1: string; deliveryAddressLine2?: string;
  deliveryCity: string; deliveryState: string; deliveryPincode: string;
}): string {
  return [o.deliveryAddressLine1, o.deliveryAddressLine2, o.deliveryCity, o.deliveryState, o.deliveryPincode]
    .filter(isRealValue)
    .join(', ');
}

const { Title, Text } = Typography;

type OrderStatus = 'placed' | 'confirmed' | 'packed' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';

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

interface OrderedMedicineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

interface StatusEvent { status: OrderStatus; at: string; byUserId?: string; note?: string; }

interface OrderRow {
  id: string;
  patient?: { fullName?: string; phoneNumber?: string };
  items: OrderedMedicineItem[];
  totalCents: number;
  status: OrderStatus;
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  deliveryPhone: string;
  statusHistory: StatusEvent[];
  shopNotifiedAt?: string;
}

// The forward-only delivery sequence a shop can advance through — matches
// ShopService.ORDER_STATUS_SEQUENCE on the backend exactly. 'placed' and
// 'confirmed' aren't steps a shop advances through themselves — they're
// the two starting points an order can arrive at this page in (a COD
// direct-catalog order starts 'placed'; an online prescription-quote order
// starts 'confirmed' once payment clears) — see PRE_SEQUENCE below.
const SEQUENCE: OrderStatus[] = ['packed', 'picked_up', 'out_for_delivery', 'delivered'];
const PRE_SEQUENCE: OrderStatus[] = ['placed', 'confirmed'];
// Matches the backend's assertValidTransition (utils/order-status-
// transitions.ts) — cancellable up through 'picked_up'; once it's out for
// delivery or already delivered there's no cancel path anymore.
const CANCELLABLE_STATUSES: OrderStatus[] = ['placed', 'confirmed', 'packed', 'picked_up'];

function formatCents(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`;
}

function errMsg(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? err.response?.data?.error || err.response?.data?.message || fallback : fallback;
}

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/shop/orders');
      setOrders(result.data ?? result);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load orders'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const openDetail = async (row: OrderRow) => {
    setSelected(row);
    try {
      const result = await apiCall('GET', `/api/shop/orders/${row.id}`);
      setSelected(result.data ?? result);
    } catch { /* keep row data */ }
  };

  const advance = async (nextStatus: OrderStatus) => {
    if (!selected) return;
    setAdvancing(true);
    try {
      const result = await apiCall('PATCH', `/api/shop/orders/${selected.id}/status`, { status: nextStatus });
      const updated = result.data ?? result;
      setSelected(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      message.success(`Marked as ${STATUS_LABELS[nextStatus]}`);
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to update order status'));
    } finally { setAdvancing(false); }
  };

  const confirmCancelOrder = async () => {
    if (!selected || !cancelReason.trim()) return;
    setAdvancing(true);
    try {
      const result = await apiCall('PATCH', `/api/shop/orders/${selected.id}/status`, {
        status: 'cancelled',
        reason: cancelReason.trim(),
      });
      const updated = result.data ?? result;
      setSelected(updated);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      message.success('Order cancelled — the patient has been notified');
      setCancelling(false);
      setCancelReason('');
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to cancel order'));
    } finally { setAdvancing(false); }
  };

  const columns = [
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, r: OrderRow) => (
        <Text>{r.patient?.fullName || r.patient?.phoneNumber || '—'}</Text>
      ),
    },
    { title: 'Order', dataIndex: 'id', key: 'id', render: (v: string) => v.slice(0, 8) },
    {
      title: 'Total', dataIndex: 'totalCents', key: 'totalCents',
      render: (v: number) => formatCents(v),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: OrderStatus) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag>,
    },
    { title: 'Deliver to', key: 'deliveryCity', render: (_: unknown, r: OrderRow) => deliverToSummary(r) },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: OrderRow) => <Button size="small" onClick={() => openDetail(r)}>View</Button>,
    },
  ];

  const currentIndex = selected ? SEQUENCE.indexOf(selected.status) : -1;
  // currentIndex is -1 both for a fresh order (status 'placed'/'confirmed',
  // not yet packed) and for one that can't be advanced at all ('cancelled')
  // — PRE_SEQUENCE tells those two apart so a brand-new order still gets
  // offered its real first step instead of no button at all.
  const nextStatus = !selected
    ? null
    : currentIndex >= 0 && currentIndex < SEQUENCE.length - 1
      ? SEQUENCE[currentIndex + 1]
      : currentIndex === -1 && PRE_SEQUENCE.includes(selected.status)
        ? SEQUENCE[0]
        : null;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>
        <CarOutlined style={{ marginRight: 8 }} />Orders
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Orders appear here once a tenant confirms the patient has paid — update the status as you pack and deliver.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {orders.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No orders yet"
          description="An order shows up here once a tenant admin confirms payment and notifies you to fulfil it — or as soon as a patient checks out directly from your catalog."
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : orders.length > 0 && (
        <Table columns={columns} dataSource={orders.map((o) => ({ ...o, key: o.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Modal
        title={<span><CarOutlined style={{ marginRight: 8 }} />Order Detail</span>}
        open={!!selected}
        onCancel={() => setSelected(null)}
        width={640}
        destroyOnClose
        footer={
          selected ? (
            <Space wrap>
              {nextStatus && (
                <Button type="primary" loading={advancing} onClick={() => advance(nextStatus)}>
                  Mark as {STATUS_LABELS[nextStatus]}
                </Button>
              )}
              {CANCELLABLE_STATUSES.includes(selected.status) && (
                <Button danger onClick={() => setCancelling(true)}>Cancel Order</Button>
              )}
              <Button onClick={() => setSelected(null)}>Close</Button>
            </Space>
          ) : null
        }
      >
        {selected && (
          <div>
            {!nextStatus && selected.status === 'delivered' && (
              <Alert type="success" showIcon message="Delivered" style={{ marginBottom: 16 }} />
            )}
            {!nextStatus && selected.status === 'cancelled' && (
              <Alert type="error" showIcon message="This order was cancelled" style={{ marginBottom: 16 }} />
            )}
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Patient">
                {selected.patient?.fullName || selected.patient?.phoneNumber || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Delivery Address">
                {fullDeliveryAddress(selected)}
              </Descriptions.Item>
              <Descriptions.Item label="Delivery Phone">{selected.deliveryPhone}</Descriptions.Item>
              <Descriptions.Item label="Total">{formatCents(selected.totalCents)}</Descriptions.Item>
            </Descriptions>

            <Text strong>Items</Text>
            <ul style={{ marginTop: 8 }}>
              {selected.items.map((item, i) => (
                <li key={i}>
                  {item.name} × {item.quantity} — {formatCents(item.subtotalCents)}
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

      <Modal
        title="Cancel Order"
        open={cancelling}
        onCancel={() => { setCancelling(false); setCancelReason(''); }}
        onOk={confirmCancelOrder}
        okText="Cancel Order"
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}
        confirmLoading={advancing}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          The patient will be notified over WhatsApp with this reason.
        </Text>
        <TextArea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="e.g. Out of stock, unable to fulfil this order"
          autoFocus
        />
      </Modal>
    </div>
  );
}
