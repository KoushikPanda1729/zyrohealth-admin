'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Drawer, Space, Popconfirm, message,
} from 'antd';
import { WalletOutlined, CheckCircleFilled } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;

interface ShopPayoutSummary {
  shopId: string;
  shopName: string;
  owedCents: number;
  settledCents: number;
}

interface PayoutEntry {
  id: string;
  orderId: string;
  amountCents: number;
  status: 'owed' | 'settled';
  settledAt?: string;
  createdAt: string;
}

// A reconciliation ledger, not a real payment rail — there is no Stripe
// Connect/Razorpay Route in this codebase (one platform-wide Stripe
// account), so every patient payment for a medicine order lands with the
// platform first. This page tracks what's owed back to each shop and lets
// a super admin record that it was paid out (bank transfer/UPI, done
// outside the app) — "Mark Settled" moves no real money.
export default function ShopPayoutsPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [summaries, setSummaries] = useState<ShopPayoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ShopPayoutSummary | null>(null);
  const [entries, setEntries] = useState<PayoutEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [settling, setSettling] = useState(false);

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/platform/shop-payouts');
      setSummaries(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load shop payouts');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSummaries(); }, [fetchSummaries]);

  const openEntries = async (row: ShopPayoutSummary) => {
    setSelected(row);
    setEntriesLoading(true);
    try {
      const result = await apiCall('GET', `/api/platform/shop-payouts/${row.shopId}`);
      setEntries(result.data ?? result);
    } catch {
      message.error('Failed to load payout history');
    } finally { setEntriesLoading(false); }
  };

  const settle = async () => {
    if (!selected) return;
    setSettling(true);
    try {
      await apiCall('POST', `/api/platform/shop-payouts/${selected.shopId}/settle`);
      message.success('Marked as settled');
      await openEntries(selected);
      fetchSummaries();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to settle payout');
      else message.error('An unexpected error occurred');
    } finally { setSettling(false); }
  };

  const columns = [
    { title: 'Shop', dataIndex: 'shopName', key: 'shopName' },
    {
      title: 'Owed', dataIndex: 'owedCents', key: 'owedCents',
      render: (v: number) => (
        <Text strong style={{ color: v > 0 ? '#faad14' : undefined }}>₹{(v / 100).toFixed(2)}</Text>
      ),
    },
    {
      title: 'Settled to date', dataIndex: 'settledCents', key: 'settledCents',
      render: (v: number) => `₹${(v / 100).toFixed(2)}`,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: ShopPayoutSummary) => (
        <Button size="small" onClick={() => openEntries(r)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>
        <WalletOutlined style={{ marginRight: 8 }} />Shop Payouts
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Patients pay the platform directly — this tracks what&apos;s owed back to each pharmacy and lets you record
        that they&apos;ve been paid outside the app. It does not move any money itself.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {summaries.length === 0 && !loading && !error && (
        <Alert type="info" showIcon message="Nothing owed yet" description="A payout entry appears here the moment a patient pays for an order fulfilled by a medicine shop." />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : summaries.length > 0 && (
        <Table columns={columns} dataSource={summaries.map((s) => ({ ...s, key: s.shopId }))} bordered size="middle" />
      )}

      <Drawer
        title={selected?.shopName}
        open={!!selected}
        onClose={() => setSelected(null)}
        size={480}
      >
        {entriesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : selected && (
          <>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text strong>Currently owed: ₹{(selected.owedCents / 100).toFixed(2)}</Text>
              {!readOnly && selected.owedCents > 0 && (
                <Popconfirm
                  title="Mark everything currently owed to this shop as settled?"
                  description="Only do this after you've actually paid the shop outside the app."
                  onConfirm={settle}
                >
                  <Button type="primary" loading={settling}>Mark Settled</Button>
                </Popconfirm>
              )}
            </Space>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {entries.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: 10,
                  }}
                >
                  <div>
                    <Text style={{ display: 'block', fontSize: 12 }}>Order {e.orderId.slice(0, 8)}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(e.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </div>
                  <Space>
                    <Text strong>₹{(e.amountCents / 100).toFixed(2)}</Text>
                    {e.status === 'settled' ? (
                      <Tag icon={<CheckCircleFilled />} color="green">Settled</Tag>
                    ) : (
                      <Tag color="gold">Owed</Tag>
                    )}
                  </Space>
                </div>
              ))}
            </Space>
          </>
        )}
      </Drawer>
    </div>
  );
}
