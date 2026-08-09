'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Typography, Alert, Spin, Row, Col, Card, Statistic, Empty, Tag, List, Button } from 'antd';
import {
  ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, MedicineBoxOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface QuoteRequestRow {
  id: string;
  status: 'pending' | 'submitted' | 'declined';
  totalCents?: number;
  createdAt: string;
  request?: { tenantName?: string; createdAt: string };
}

export default function ShopDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [requests, setRequests] = useState<QuoteRequestRow[]>([]);
  const [catalogCount, setCatalogCount] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meResult, requestsResult, catalogResult] = await Promise.all([
        apiCall('GET', '/api/shop/me'),
        apiCall('GET', '/api/shop/quote-requests'),
        apiCall('GET', '/api/shop/catalog'),
      ]);
      const profile = (meResult.data ?? meResult) as { shop: { name: string }; tenantName?: string };
      setShopName(profile.shop.name);
      setTenantName(profile.tenantName ?? null);
      setRequests((requestsResult.data ?? requestsResult) as QuoteRequestRow[]);
      setCatalogCount(((catalogResult.data ?? catalogResult) as unknown[]).length);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load dashboard');
      else setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pending = requests.filter((r) => r.status === 'pending');
  const submitted = requests.filter((r) => r.status === 'submitted');
  const declined = requests.filter((r) => r.status === 'declined');
  const totalQuotedValue = submitted.reduce((sum, r) => sum + (r.totalCents ?? 0), 0);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>
        {shopName ? `Welcome, ${shopName}` : 'Dashboard'}
      </Title>
      {tenantName && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Serving prescription requests dispatched by <strong>{tenantName}</strong>
        </Text>
      )}

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic
                  title="Awaiting Your Quote"
                  value={pending.length}
                  styles={{ content: { color: pending.length > 0 ? '#faad14' : undefined } }}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="Quotes Submitted" value={submitted.length} prefix={<CheckCircleOutlined />} styles={{ content: { color: '#3f8600' } }} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="Declined" value={declined.length} prefix={<CloseCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card size="small">
                <Statistic title="Medicines Listed" value={catalogCount} prefix={<MedicineBoxOutlined />} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12}>
              <Card size="small">
                <Statistic
                  title="Total Value Quoted"
                  value={(totalQuotedValue / 100).toFixed(2)}
                  prefix="Rs."
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title={`Awaiting Your Quote (${pending.length})`}
            extra={<Button type="link" onClick={() => router.push('/requests')}>Go to Requests <ArrowRightOutlined /></Button>}
          >
            {pending.length === 0 ? (
              <Empty description="Nothing waiting on you right now." />
            ) : (
              <List
                dataSource={pending.slice(0, 5)}
                renderItem={(r) => (
                  <List.Item>
                    <Text>Prescription request</Text>
                    {r.request?.tenantName && <Tag>{r.request.tenantName}</Tag>}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
