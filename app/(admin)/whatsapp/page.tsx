'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Drawer, message, Space, Select, Input, theme, Modal, Radio,
} from 'antd';
import {
  EyeOutlined, WhatsAppOutlined, RobotOutlined, CustomerServiceOutlined, SendOutlined, ApartmentOutlined,
  SettingOutlined, LockOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../lib/api';
import type { TablePaginationConfig } from 'antd';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface WhatsAppMessageEvent {
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
}

interface WhatsAppSession {
  id: string;
  phoneNumber: string;
  userId?: string;
  conversationState: 'main_menu' | 'awaiting_ai' | 'closed';
  awaitingHuman: boolean;
  messages: WhatsAppMessageEvent[];
  lastMessageAt?: string;
  user?: { fullName?: string; phoneNumber?: string } | null;
}

function secretPlaceholder(
  hasSecret: boolean,
  usingPlatformDefault: boolean,
  label: string,
): string {
  if (!hasSecret) return `Enter ${label}`;
  return usingPlatformDefault
    ? `•••••••• (platform default — enter a new ${label} to override)`
    : '•••••••• (configured — leave blank to keep)';
}

// Built from theme tokens (not hardcoded hex) so bubbles stay legible in
// both light and dark mode instead of always being pale/white.
function getRoleStyles(
  token: ReturnType<typeof theme.useToken>['token'],
): Record<WhatsAppMessageEvent['role'], { align: 'flex-start' | 'flex-end'; bg: string; label: string }> {
  return {
    user: { align: 'flex-start', bg: token.colorFillTertiary, label: '' },
    assistant: { align: 'flex-end', bg: token.colorInfoBg, label: '🤖 Bot' },
    admin: { align: 'flex-end', bg: token.colorSuccessBg, label: '👤 Admin' },
  };
}

export default function WhatsAppPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [stateFilter, setStateFilter] = useState<'true' | 'false' | undefined>(undefined);
  const [selected, setSelected] = useState<WhatsAppSession | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const { token } = theme.useToken();
  const roleStyles = getRoleStyles(token);

  // WhatsApp provider settings (per-tenant Twilio/Meta config)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [provider, setProvider] = useState<'twilio' | 'meta' | 'gupshup'>('twilio');
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioFromNumber, setTwilioFromNumber] = useState('');
  const [hasTwilioAuthToken, setHasTwilioAuthToken] = useState(false);
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [metaApiVersion, setMetaApiVersion] = useState('');
  const [hasMetaAccessToken, setHasMetaAccessToken] = useState(false);
  const [hasMetaAppSecret, setHasMetaAppSecret] = useState(false);
  const [gupshupApiKey, setGupshupApiKey] = useState('');
  const [gupshupSourceNumber, setGupshupSourceNumber] = useState('');
  const [gupshupAppName, setGupshupAppName] = useState('');
  const [gupshupWebhookSecret, setGupshupWebhookSecret] = useState('');
  const [hasGupshupApiKey, setHasGupshupApiKey] = useState(false);
  const [hasGupshupWebhookSecret, setHasGupshupWebhookSecret] = useState(false);
  const [usingPlatformDefault, setUsingPlatformDefault] = useState(false);

  const fetchSessions = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const qs = `page=${page}&limit=20${stateFilter !== undefined ? `&awaitingHuman=${stateFilter}` : ''}`;
      const result = await apiCall('GET', `/api/admin/whatsapp/sessions?${qs}`);
      const payload = result.data ?? result;
      setSessions(Array.isArray(payload) ? payload : payload.data || []);
      setPagination((prev) => ({
        ...prev, current: page,
        total: result.pagination?.total || result.total || (Array.isArray(payload) ? payload.length : 0),
      }));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load WhatsApp sessions');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, [stateFilter]);

  useEffect(() => { fetchSessions(1); }, [fetchSessions]);

  const openDetail = async (session: WhatsAppSession) => {
    setSelected(session);
    setReplyText('');
    try {
      const result = await apiCall('GET', `/api/admin/whatsapp/sessions/${session.id}`);
      setSelected(result.data ?? result);
    } catch {
      // keep the row data we already have if the detail fetch fails
    }
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const result = await apiCall('POST', `/api/admin/whatsapp/sessions/${selected.id}/reply`, { text: replyText.trim() });
      setSelected(result.data ?? result);
      setReplyText('');
      message.success('Reply sent');
      fetchSessions(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to send reply');
      else message.error('An unexpected error occurred');
    } finally { setSending(false); }
  };

  const resumeBot = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const result = await apiCall('POST', `/api/admin/whatsapp/sessions/${selected.id}/resume-bot`);
      setSelected(result.data ?? result);
      message.success('Bot resumed for this conversation');
      fetchSessions(pagination.current);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to resume bot');
      else message.error('An unexpected error occurred');
    } finally { setSending(false); }
  };

  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const result = await apiCall('GET', '/api/admin/whatsapp/config');
      const cfg = result.data ?? result;
      setProvider(cfg.provider ?? 'twilio');
      setTwilioAccountSid(cfg.twilioAccountSid ?? '');
      setTwilioFromNumber(cfg.twilioFromNumber ?? '');
      setHasTwilioAuthToken(!!cfg.hasTwilioAuthToken);
      setTwilioAuthToken('');
      setMetaPhoneNumberId(cfg.metaPhoneNumberId ?? '');
      setMetaApiVersion(cfg.metaApiVersion ?? '');
      setHasMetaAccessToken(!!cfg.hasMetaAccessToken);
      setHasMetaAppSecret(!!cfg.hasMetaAppSecret);
      setMetaAccessToken('');
      setMetaAppSecret('');
      setGupshupSourceNumber(cfg.gupshupSourceNumber ?? '');
      setGupshupAppName(cfg.gupshupAppName ?? '');
      setHasGupshupApiKey(!!cfg.hasGupshupApiKey);
      setHasGupshupWebhookSecret(!!cfg.hasGupshupWebhookSecret);
      setGupshupApiKey('');
      setGupshupWebhookSecret('');
      setUsingPlatformDefault(!!cfg.usingPlatformDefault);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load WhatsApp settings');
      else message.error('An unexpected error occurred');
    } finally { setSettingsLoading(false); }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await apiCall('PUT', '/api/admin/whatsapp/config', {
        provider,
        twilioAccountSid: twilioAccountSid.trim() || undefined,
        twilioAuthToken: twilioAuthToken.trim() || undefined,
        twilioFromNumber: twilioFromNumber.trim() || undefined,
        metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
        metaAccessToken: metaAccessToken.trim() || undefined,
        metaAppSecret: metaAppSecret.trim() || undefined,
        metaApiVersion: metaApiVersion.trim() || undefined,
        gupshupApiKey: gupshupApiKey.trim() || undefined,
        gupshupSourceNumber: gupshupSourceNumber.trim() || undefined,
        gupshupAppName: gupshupAppName.trim() || undefined,
        gupshupWebhookSecret: gupshupWebhookSecret.trim() || undefined,
      });
      message.success('WhatsApp settings saved');
      setSettingsOpen(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save WhatsApp settings');
      else message.error('An unexpected error occurred');
    } finally { setSettingsSaving(false); }
  };

  const columns = [
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, s: WhatsAppSession) => {
        const name = s.user?.fullName || s.phoneNumber;
        return <Text>{name}</Text>;
      },
    },
    { title: 'Phone', dataIndex: 'phoneNumber', key: 'phoneNumber' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, s: WhatsAppSession) => (
        s.awaitingHuman
          ? <Tag icon={<CustomerServiceOutlined />} color="orange">Awaiting Human</Tag>
          : <Tag icon={<RobotOutlined />} color="blue">Bot Active</Tag>
      ),
    },
    {
      title: 'Last Message', key: 'lastMessage',
      render: (_: unknown, s: WhatsAppSession) => {
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
      render: (_: unknown, s: WhatsAppSession) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(s)}>View</Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />WhatsApp
        </Title>
        <Space wrap>
          <Button icon={<SettingOutlined />} onClick={openSettings}>Provider Settings</Button>
          <Button icon={<ApartmentOutlined />} onClick={() => router.push('/whatsapp/flows')}>
            Manage Flows
          </Button>
        </Space>
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
            { value: 'true', label: 'Awaiting Human' },
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
        title={<span><WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />{selected?.user?.fullName || selected?.phoneNumber}</span>}
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

      <Modal
        title={<span><SettingOutlined style={{ marginRight: 8 }} />WhatsApp Provider Settings</span>}
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        onOk={saveSettings}
        okText="Save"
        confirmLoading={settingsSaving}
        width={520}
      >
        {settingsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {usingPlatformDefault && (
              <Alert
                type="info"
                showIcon
                message="Currently using the platform's shared account"
                description="These are the platform's default credentials — this tenant hasn't set up its own yet. Enter your own Account SID/Phone Number plus a new secret below and save to switch this tenant to its own account."
              />
            )}
            <div>
              <Text strong style={{ fontSize: 13 }}>Provider</Text>
              <div style={{ marginTop: 4 }}>
                <Radio.Group value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <Radio.Button value="twilio">Twilio</Radio.Button>
                  <Radio.Button value="meta">Meta Cloud API</Radio.Button>
                  <Radio.Button value="gupshup">Gupshup</Radio.Button>
                </Radio.Group>
              </div>
            </div>

            {provider === 'twilio' && (
              <>
                <div>
                  <Text strong style={{ fontSize: 13 }}>Account SID</Text>
                  <Input
                    value={twilioAccountSid}
                    onChange={(e) => setTwilioAccountSid(e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    style={{ marginTop: 4 }}
                  />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}><LockOutlined style={{ marginRight: 4 }} />Auth Token</Text>
                  <Input.Password
                    value={twilioAuthToken}
                    onChange={(e) => setTwilioAuthToken(e.target.value)}
                    placeholder={secretPlaceholder(hasTwilioAuthToken, usingPlatformDefault, 'auth token')}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Stored encrypted — never shown again once saved. Leave blank to keep the current one.
                  </Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>WhatsApp From Number</Text>
                  <Input
                    value={twilioFromNumber}
                    onChange={(e) => setTwilioFromNumber(e.target.value)}
                    placeholder="+14155238886"
                    style={{ marginTop: 4 }}
                  />
                </div>
              </>
            )}

            {provider === 'meta' && (
              <>
                <div>
                  <Text strong style={{ fontSize: 13 }}>Phone Number ID</Text>
                  <Input
                    value={metaPhoneNumberId}
                    onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                    style={{ marginTop: 4 }}
                  />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}><LockOutlined style={{ marginRight: 4 }} />Access Token</Text>
                  <Input.Password
                    value={metaAccessToken}
                    onChange={(e) => setMetaAccessToken(e.target.value)}
                    placeholder={secretPlaceholder(hasMetaAccessToken, usingPlatformDefault, 'access token')}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Stored encrypted — never shown again once saved. Leave blank to keep the current one.
                  </Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}><LockOutlined style={{ marginRight: 4 }} />App Secret</Text>
                  <Input.Password
                    value={metaAppSecret}
                    onChange={(e) => setMetaAppSecret(e.target.value)}
                    placeholder={secretPlaceholder(hasMetaAppSecret, usingPlatformDefault, 'app secret')}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Used to validate incoming webhook signatures. Stored encrypted — leave blank to keep the current one.
                  </Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>API Version (optional)</Text>
                  <Input
                    value={metaApiVersion}
                    onChange={(e) => setMetaApiVersion(e.target.value)}
                    placeholder="v21.0"
                    style={{ marginTop: 4 }}
                  />
                </div>
              </>
            )}

            {provider === 'gupshup' && (
              <>
                <div>
                  <Text strong style={{ fontSize: 13 }}>App Name</Text>
                  <Input
                    value={gupshupAppName}
                    onChange={(e) => setGupshupAppName(e.target.value)}
                    placeholder="Your Gupshup app name"
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Used to route inbound messages to this tenant — Gupshup&apos;s webhook has no receiving phone
                    number field, only the app name.
                  </Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>Source Number</Text>
                  <Input
                    value={gupshupSourceNumber}
                    onChange={(e) => setGupshupSourceNumber(e.target.value)}
                    placeholder="919000000000"
                    style={{ marginTop: 4 }}
                  />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}><LockOutlined style={{ marginRight: 4 }} />API Key</Text>
                  <Input.Password
                    value={gupshupApiKey}
                    onChange={(e) => setGupshupApiKey(e.target.value)}
                    placeholder={secretPlaceholder(hasGupshupApiKey, usingPlatformDefault, 'API key')}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Stored encrypted — never shown again once saved. Leave blank to keep the current one.
                  </Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}><LockOutlined style={{ marginRight: 4 }} />Webhook Secret</Text>
                  <Input.Password
                    value={gupshupWebhookSecret}
                    onChange={(e) => setGupshupWebhookSecret(e.target.value)}
                    placeholder={secretPlaceholder(hasGupshupWebhookSecret, usingPlatformDefault, 'webhook secret')}
                    style={{ marginTop: 4 }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Gupshup has no built-in webhook signature — this is your own chosen value, embedded as
                    <Text code style={{ fontSize: 11 }}> /api/whatsapp/webhook/gupshup/&lt;this-value&gt;</Text> when
                    you register the callback URL in Gupshup&apos;s console.
                  </Text>
                </div>
              </>
            )}

            <Text type="secondary" style={{ fontSize: 11 }}>
              Leaving this unconfigured keeps using the platform&apos;s shared default number/account.
            </Text>
          </Space>
        )}
      </Modal>
    </div>
  );
}
