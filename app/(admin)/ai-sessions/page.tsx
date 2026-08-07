'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Tag,
  Typography,
  Alert,
  Spin,
} from 'antd';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title } = Typography;

interface AISession {
  id: string;
  user: { fullName: string; phone?: string } | string;
  symptoms: string[];
  severityScore: number;
  referToDoctor: boolean;
  status: string;
  createdAt: string;
}

const severityColor = (score: number): string => {
  if (score >= 8) return 'red';
  if (score >= 5) return 'orange';
  return 'green';
};

export default function AISessionsPage() {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const fetchSessions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const result = await apiCall('GET', `/api/admin/ai-sessions?${params}`);
      setSessions(result.data || result.sessions || result);
      setPagination((prev) => ({
        ...prev,
        current: page,
        total: result.total || result.count || (result.data || result).length,
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to load AI sessions');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(1);
  }, [fetchSessions]);

  const handleTableChange = (pag: TablePaginationConfig) => {
    fetchSessions(pag.current || 1);
  };

  const getUserName = (user: { fullName: string; phone?: string } | string | undefined): string => {
    if (!user) return '—';
    if (typeof user === 'string') return user;
    return user.fullName || user.phone || '—';
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
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      render: (val: { fullName: string; phone?: string } | string) => getUserName(val),
    },
    {
      title: 'Symptoms',
      dataIndex: 'symptoms',
      key: 'symptoms',
      render: (symptoms: string[]) => {
        if (!symptoms || symptoms.length === 0) return '—';
        const displayed = symptoms.slice(0, 3);
        const extra = symptoms.length - 3;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {displayed.map((s, i) => (
              <Tag key={i} color="blue" style={{ fontSize: 11 }}>
                {s}
              </Tag>
            ))}
            {extra > 0 && <Tag style={{ fontSize: 11 }}>+{extra} more</Tag>}
          </div>
        );
      },
    },
    {
      title: 'Severity',
      dataIndex: 'severityScore',
      key: 'severityScore',
      render: (score: number) =>
        score != null ? (
          <Tag color={severityColor(score)}>{score}/10</Tag>
        ) : (
          '—'
        ),
    },
    {
      title: 'Refer to Doctor',
      dataIndex: 'referToDoctor',
      key: 'referToDoctor',
      render: (val: boolean) => (
        <Tag color={val ? 'orange' : 'green'}>{val ? 'Yes' : 'No'}</Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const isOpen = status === 'open' || status === 'active';
        return (
          <Tag color={isOpen ? 'blue' : 'default'}>
            {isOpen ? 'Open' : 'Closed'}
          </Tag>
        );
      },
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
      <Title level={4} style={{ marginBottom: 16 }}>AI Sessions</Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={sessions.map((s) => ({ ...s, key: s.id }))}
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
