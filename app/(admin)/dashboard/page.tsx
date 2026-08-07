'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Typography,
  Spin,
  Alert,
  Tag,
  theme,
} from 'antd';
import {
  DollarOutlined,
  UserOutlined,
  MedicineBoxOutlined,
  CalendarOutlined,
  RobotOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface DoctorProfileRow {
  id: string;
  specialty?: string;
  rating?: number;
  totalConsultations: number;
  user?: { fullName?: string; email?: string };
}

interface AnalyticsData {
  totalRevenue: number;
  totalUsers: number;
  totalDoctors: number;
  approvedDoctors: number;
  pendingDoctors: number;
  totalConsults: number;
  totalAiSessions: number;
  aiReferralRate: number;
  revenueByMonth: Array<{ month: string; amount: number }>;
  topDoctorsByRating: DoctorProfileRow[];
}

function StatCard({
  icon,
  color,
  label,
  value,
  extra,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Card
      style={{ borderRadius: 12, height: '100%' }}
      styles={{ body: { padding: 20 } }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `${color}1a`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 20,
            color,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0, width: '100%' }}>
          <Text style={{ fontSize: 13, color: token.colorTextSecondary }}>{label}</Text>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.3, marginTop: 2 }}>
            {value}
          </div>
          {/* Reserved even when empty — otherwise antd's Row stretches every
              card in a row to match the tallest sibling (the one with
              `extra`), leaving dead space at the bottom of the shorter ones. */}
          <div style={{ marginTop: 6, minHeight: 20 }}>{extra}</div>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notEntitled, setNotEntitled] = useState(false);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const result = await apiCall('GET', '/api/admin/analytics');
        setData(result.data ?? result);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 403) {
            // This tenant simply isn't entitled to the analytics module —
            // not a real failure, so don't show a scary red error.
            setNotEntitled(true);
          } else {
            setError(err.response?.data?.message || 'Failed to load analytics data');
          }
        } else {
          setError('An unexpected error occurred');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const revenueColumns = [
    { title: 'Month', dataIndex: 'month', key: 'month' },
    {
      title: 'Revenue',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right' as const,
      render: (val: number) => `₹${((val || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    },
  ];

  const doctorColumns = [
    {
      title: 'Name',
      key: 'name',
      render: (_: unknown, r: DoctorProfileRow) => r.user?.fullName || r.user?.email || '—',
    },
    { title: 'Specialty', dataIndex: 'specialty', key: 'specialty', render: (v?: string) => v || '—' },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      render: (val: number) => (
        <Tag color="gold">{Number(val || 0).toFixed(1)} ★</Tag>
      ),
    },
    { title: 'Consultations', dataIndex: 'totalConsultations', key: 'totalConsultations' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Loading analytics..." />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} showIcon />;
  }

  if (notEntitled) {
    return (
      <div>
        <Title level={4} style={{ marginBottom: 24 }}>Overview</Title>
        <Alert
          type="info"
          showIcon
          message="Analytics not included in your plan"
          description="Your platform admin can enable the Analytics module if you need dashboard metrics. Use the sidebar to manage doctors, bookings, and other enabled modules."
        />
      </div>
    );
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>Overview</Title>

      {/* Stat Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<DollarOutlined />}
            color="#3f8600"
            label="Total Revenue"
            value={`₹${((data?.totalRevenue || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<UserOutlined />}
            color="#1677ff"
            label="Total Users"
            value={data?.totalUsers || 0}
          />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<MedicineBoxOutlined />}
            color="#722ed1"
            label="Total Doctors"
            value={data?.totalDoctors || 0}
            extra={
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#52c41a', whiteSpace: 'nowrap' }}>
                  {data?.approvedDoctors || 0} Approved
                </span>
                <span style={{ color: '#fa8c16', whiteSpace: 'nowrap' }}>
                  {data?.pendingDoctors || 0} Pending
                </span>
              </div>
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<CalendarOutlined />}
            color="#13c2c2"
            label="Total Consults"
            value={data?.totalConsults || 0}
          />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<RobotOutlined />}
            color="#eb2f96"
            label="AI Sessions"
            value={data?.totalAiSessions || 0}
          />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={4}>
          <StatCard
            icon={<RiseOutlined />}
            color="#fa541c"
            label="AI Referral Rate"
            value={`${(Number(data?.aiReferralRate || 0) * 100).toFixed(1)}%`}
          />
        </Col>
      </Row>

      {/* Revenue by Month + Top Doctors */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Revenue by Month" style={{ borderRadius: 12 }}>
            <Table
              columns={revenueColumns}
              dataSource={(data?.revenueByMonth || []).map((item, i) => ({
                ...item,
                key: i,
              }))}
              pagination={false}
              size="small"
              scroll={{ y: 320 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Top Doctors by Rating" style={{ borderRadius: 12 }}>
            <Table
              columns={doctorColumns}
              dataSource={(data?.topDoctorsByRating || []).map((d) => ({ ...d, key: d.id }))}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
