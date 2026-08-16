'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Drawer, Descriptions, message, Steps,
} from 'antd';
import { CarOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

type OrderStatus = 'placed' | 'confirmed' | 'packed' | 'picked_up' | 'out_for_delivery' | 'delivered' | 'cancelled';

interface OrderedMedicineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

interface OrderRow {
  id: string;
  items: OrderedMedicineItem[];
  totalCents: number;
  status: OrderStatus;
  deliveryAddressLine1: string;
  deliveryAddressLine2?: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPincode: string;
  deliveryPhone: string;
  shopNotifiedAt?: string;
}

// The forward-only delivery sequence a shop can advance through — matches
// ShopService.ORDER_STATUS_SEQUENCE on the backend exactly. 'placed' and
// 'confirmed' aren't shown as steps a shop advances through themselves;
// an order only ever reaches this page already payment-confirmed.
const SEQUENCE: OrderStatus[] = ['packed', 'picked_up', 'out_for_delivery', 'delivered'];
const STEP_LABELS: Record<string, string> = {
  packed: 'Packed',
  picked_up: 'Picked Up',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
};

function errMsg(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? err.response?.data?.error || err.response?.data?.message || fallback : fallback;
}

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [advancing, setAdvancing] = useState(false);

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
      message.success(`Marked as ${STEP_LABELS[nextStatus]}`);
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to update order status'));
    } finally { setAdvancing(false); }
  };

  const columns = [
    { title: 'Order', dataIndex: 'id', key: 'id', render: (v: string) => v.slice(0, 8) },
    {
      title: 'Total', dataIndex: 'totalCents', key: 'totalCents',
      render: (v: number) => `₹${(v / 100).toFixed(2)}`,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: OrderStatus) => <Tag>{(STEP_LABELS[s] ?? s).toUpperCase()}</Tag>,
    },
    { title: 'Deliver to', dataIndex: 'deliveryCity', key: 'deliveryCity' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: OrderRow) => <Button size="small" onClick={() => openDetail(r)}>View</Button>,
    },
  ];

  const currentIndex = selected ? SEQUENCE.indexOf(selected.status) : -1;
  const nextStatus = currentIndex >= 0 && currentIndex < SEQUENCE.length - 1 ? SEQUENCE[currentIndex + 1] : null;

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
          description="An order shows up here once a tenant admin confirms payment and notifies you to fulfil it."
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : orders.length > 0 && (
        <Table columns={columns} dataSource={orders.map((o) => ({ ...o, key: o.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
      )}

      <Drawer
        title={selected ? `Order ${selected.id.slice(0, 8)}` : ''}
        open={!!selected}
        onClose={() => setSelected(null)}
        size={480}
      >
        {selected && (
          <>
            <Steps
              size="small"
              current={currentIndex === -1 ? 0 : currentIndex}
              items={SEQUENCE.map((s) => ({ title: STEP_LABELS[s] }))}
              style={{ marginBottom: 24 }}
            />

            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Total">₹{(selected.totalCents / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Deliver to">
                {[selected.deliveryAddressLine1, selected.deliveryAddressLine2, selected.deliveryCity, selected.deliveryState, selected.deliveryPincode]
                  .filter(Boolean).join(', ')}
              </Descriptions.Item>
              <Descriptions.Item label="Contact">{selected.deliveryPhone}</Descriptions.Item>
            </Descriptions>

            <Text strong style={{ display: 'block', marginBottom: 8 }}>Items</Text>
            {selected.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text>{item.name} × {item.quantity}</Text>
                <Text>₹{(item.subtotalCents / 100).toFixed(2)}</Text>
              </div>
            ))}

            {nextStatus ? (
              <Button
                type="primary"
                block
                style={{ marginTop: 20 }}
                loading={advancing}
                onClick={() => advance(nextStatus)}
              >
                Mark as {STEP_LABELS[nextStatus]}
              </Button>
            ) : (
              <Alert type="success" showIcon message="Delivered" style={{ marginTop: 20 }} />
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
