'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Drawer, message, Space, Select, Input, theme, Breadcrumb,
} from 'antd';
import {
  EyeOutlined, WhatsAppOutlined, RobotOutlined, CustomerServiceOutlined, SendOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface WhatsAppMessageEvent {
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
}

interface WhatsAppSessionRow {
  id: string;
  phoneNumber: string;
  conversationState: string;
  awaitingHuman: boolean;
  messages: WhatsAppMessageEvent[];
  lastMessageAt?: string;
}

function getRoleStyles(
  token: ReturnType<typeof theme.useToken>['token'],
): Record<WhatsAppMessageEvent['role'], { align: 'flex-start' | 'flex-end'; bg: string; label: string }> {
  return {
    user: { align: 'flex-start', bg: token.colorFillTertiary, label: '' },
    assistant: { align: 'flex-end', bg: token.colorInfoBg, label: '🤖 Bot' },
    admin: { align: 'flex-end', bg: token.colorSuccessBg, label: '👤 You' },
  };
}

export default function ShopWhatsAppSessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<WhatsAppSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [stateFilter, setStateFilter] = useState<'true' | 'false' | undefined>(undefined);
  const [selected, setSelected] = useState<WhatsAppSessionRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const { token } = theme.useToken();
  const roleStyles = getRoleStyles(token);

  const fetchSessions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const qs = `page=${page}&limit=20${stateFilter !== undefined ? `&awaitingHuman=${stateFilter}` : ''}`;
      const result = await apiCall('GET', `/api/shop/whatsapp-module/sessions?${qs}`);
      const payload = result.data ?? result;
      setSessions(Array.isArray(payload) ? payload : payload.data || []);
      setPagination((prev) => ({
        ...prev, current: page,
        total: result.pagination?.total || result.total || (Array.isArray(payload) ? payload.length : 0),
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.error || 'Failed to load conversations');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, [stateFilter]);

  useEffect(() => { fetchSessions(1); }, [fetchSessions]);

  const openDetail = async (sessionRow: WhatsAppSessionRow) => {
    setSelected(sessionRow);
    setReplyText('');
    try {
      const result = await apiCall('GET', `/api/shop/whatsapp-module/sessions/${sessionRow.id}`);
      setSelected(result.data ?? result);
    } catch {
      // keep the row data we already have if the detail fetch fails
    }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const result = await apiCall('POST', `/api/shop/whatsapp-module/sessions/${selected.id}/reply`, { text: replyText.trim() });
      setSelected(result.data ?? result);
      setReplyText('');
      message.success('Reply sent');
      fetchSessions(pagination.current);
    } catch (err: unknown) {
      message.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to send reply' : 'An unexpected error occurred');
    } finally { setSending(false); }
  };

  const resumeBot = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const result = await apiCall('POST', `/api/shop/whatsapp-module/sessions/${selected.id}/resume-bot`);
      setSelected(result.data ?? result);
      message.success('Bot resumed for this conversation');
      fetchSessions(pagination.current);
    } catch (err: unknown) {
      message.error(axios.isAxiosError(err) ? err.response?.data?.error || 'Failed to resume bot' : 'An unexpected error occurred');
    } finally { setSending(false); }
  };

  const columns = [
    { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, s: WhatsAppSessionRow) => (
        s.awaitingHuman
          ? <Tag icon={<CustomerServiceOutlined />} color="orange">Awaiting You</Tag>
          : <Tag icon={<RobotOutlined />} color="blue">Bot Active</Tag>
      ),
    },
    {
      title: 'Last Message', key: 'lastMessage',
      render: (_: unknown, s: WhatsAppSessionRow) => {
        const last = s.messages?.[s.messages.length - 1];
        if (!last) return <Text type="secondary">—</Text>;
        const text = last.content.length > 60 ? `${last.content.slice(0, 60)}…` : last.content;
        return <Text type="secondary">{text}</Text>;
      },
    },
    {
      title: 'Last Activity', dataIndex: 'lastMessageAt', key: 'lastMessageAt',
      render: (v?: string) => v
        ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : '—',
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, s: WhatsAppSessionRow) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(s)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={() => router.push('/shop-whatsapp')}>WhatsApp</a> },
          { title: 'Conversations' },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />Conversations
        </Title>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Space style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="Filter by status"
          style={{ width: 200 }}
          value={stateFilter}
          onChange={(v) => setStateFilter(v)}
          options={[
            { value: 'true', label: 'Awaiting You' },
            { value: 'false', label: 'Bot Active' },
          ]}
        />
      </Space>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={sessions.map((s) => ({ ...s, key: s.id }))}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false, showTotal: (t) => `${t} conversations` }}
          onChange={(p: TablePaginationConfig) => fetchSessions(p.current || 1)}
          bordered size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}

      <Drawer
        title={<span><WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />{selected?.phoneNumber}</span>}
        open={!!selected}
        onClose={() => setSelected(null)}
        size={480}
        destroyOnClose
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 16, height: '100%' } }}
        extra={
          selected?.awaitingHuman && (
            <Button size="small" onClick={resumeBot} loading={sending}>Resume Bot</Button>
          )
        }
      >
        {selected && (
          <>
            <div
              style={{
                flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
                gap: 8, padding: 12, background: token.colorFillAlter, borderRadius: 8, marginBottom: 12,
              }}
            >
              {selected.messages.length === 0 && <Text type="secondary">No messages yet.</Text>}
              {selected.messages.map((m, i) => {
                const style = roleStyles[m.role];
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: style.align, flexDirection: 'column', alignItems: style.align }}>
                    {style.label && <Text type="secondary" style={{ fontSize: 11 }}>{style.label}</Text>}
                    <div
                      style={{
                        background: style.bg, padding: '8px 12px', borderRadius: 12,
                        maxWidth: '80%', whiteSpace: 'pre-wrap',
                      }}
                    >
                      <Text>{m.content}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                border: `1px solid ${token.colorBorder}`,
                borderRadius: 8,
                background: token.colorBgContainer,
                padding: 8,
                flexShrink: 0,
              }}
            >
              <TextArea
                rows={2}
                variant="borderless"
                placeholder="Type a manual reply — this pauses the bot for this conversation..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); sendReply(); } }}
                style={{ resize: 'none', padding: 0 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!replyText.trim()} onClick={sendReply}>
                  Send
                </Button>
              </div>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
