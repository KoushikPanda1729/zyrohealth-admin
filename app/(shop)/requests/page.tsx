'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Alert, Spin, Button, Space, message, Card, Image, Empty, Popconfirm, Row, Col,
} from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import QuoteReceipt from '../../components/QuoteReceipt';
import ItemizedQuoteForm from '../../components/ItemizedQuoteForm';

const { Title, Text } = Typography;

type QuoteStatus = 'pending' | 'submitted' | 'declined';

interface QuoteItem { name: string; quantity?: number; priceCents?: number; }

interface QuoteRequestRow {
  id: string;
  requestId: string;
  status: QuoteStatus;
  items?: QuoteItem[];
  totalCents?: number;
  submittedVia?: 'portal' | 'whatsapp' | 'manual';
  submittedAt?: string;
  createdAt: string;
  request?: { imageUrl: string; createdAt: string; tenantName?: string };
}

export default function ShopRequestsPage() {
  const [requests, setRequests] = useState<QuoteRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/shop/quote-requests');
      setRequests(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load quote requests');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submitQuote = async (
    quoteId: string,
    items: { name: string; quantity: number; priceCents: number }[],
    totalCents: number,
  ) => {
    setSavingId(quoteId);
    try {
      await apiCall('PATCH', `/api/shop/quote-requests/${quoteId}`, { items, totalCents });
      message.success('Quote submitted');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to submit quote');
      else message.error('An unexpected error occurred');
    } finally { setSavingId(null); }
  };

  const declineQuote = async (quoteId: string) => {
    setDecliningId(quoteId);
    try {
      await apiCall('POST', `/api/shop/quote-requests/${quoteId}/decline`);
      message.success('Marked as declined');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to decline');
      else message.error('An unexpected error occurred');
    } finally { setDecliningId(null); }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const responded = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Prescription Quote Requests</Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : requests.length === 0 && !error ? (
        <Empty description="No quote requests yet — they'll show up here as soon as a tenant admin dispatches one to you." />
      ) : (
        <>
          <Title level={5} style={{ marginBottom: 12 }}>Awaiting Your Quote ({pending.length})</Title>
          {pending.length === 0 ? (
            <Text type="secondary">Nothing waiting on you right now.</Text>
          ) : (
            <Row gutter={[16, 16]} style={{ marginBottom: 32 }}>
              {pending.map((q) => (
                <Col xs={24} sm={12} lg={8} key={q.id}>
                  <Card size="small" title={q.request?.tenantName ? `For ${q.request.tenantName}` : undefined}>
                    {q.request?.imageUrl && (
                      <Image src={q.request.imageUrl} alt="Prescription" style={{ maxHeight: 200, objectFit: 'contain', marginBottom: 12 }} />
                    )}
                    <ItemizedQuoteForm
                      submitting={savingId === q.id}
                      submitLabel="Submit Quote"
                      onSubmit={(items, totalCents) => submitQuote(q.id, items, totalCents)}
                    />
                    <Popconfirm title="Decline this request?" onConfirm={() => declineQuote(q.id)}>
                      <Button danger icon={<CloseCircleOutlined />} loading={decliningId === q.id} style={{ marginTop: 8 }} block>
                        Decline Instead
                      </Button>
                    </Popconfirm>
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          <Title level={5} style={{ marginBottom: 12 }}>History ({responded.length})</Title>
          {responded.length === 0 ? (
            <Text type="secondary">No responded quotes yet.</Text>
          ) : (
            <Row gutter={[16, 16]}>
              {responded.map((q) => (
                <Col xs={24} sm={12} lg={8} key={q.id}>
                  {q.status === 'submitted' ? (
                    <QuoteReceipt
                      tenantName={q.request?.tenantName || 'Tenant'}
                      requestId={q.requestId}
                      quoteDate={q.submittedAt}
                      items={q.items}
                      totalCents={q.totalCents}
                      status={q.status}
                      submittedVia={q.submittedVia}
                      downloadPath={`/api/shop/quote-requests/${q.id}/receipt.pdf`}
                    />
                  ) : (
                    <Card size="small">
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text strong>Declined</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>You marked this request as declined.</Text>
                      </Space>
                    </Card>
                  )}
                </Col>
              ))}
            </Row>
          )}
        </>
      )}
    </div>
  );
}
