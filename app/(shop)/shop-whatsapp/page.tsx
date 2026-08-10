'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Alert, Spin, Button, Space, message, theme, Popconfirm, Card, Tabs, Input, Radio, Modal,
} from 'antd';
import {
  WhatsAppOutlined, CheckCircleFilled, CloseCircleFilled, ReloadOutlined, CopyOutlined,
  GlobalOutlined, SettingOutlined, ApartmentOutlined, MessageOutlined, LockOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

function errMsg(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback;
}

interface WhatsAppMessageEvent {
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
}

// Built from theme tokens (not hardcoded hex) so bubbles stay legible in
// both light and dark mode — same approach as the tenant-side WhatsApp
// sessions drawer (app/(admin)/whatsapp/page.tsx).
function getRoleStyles(
  token: ReturnType<typeof theme.useToken>['token'],
): Record<WhatsAppMessageEvent['role'], { align: 'flex-start' | 'flex-end'; bg: string; label: string }> {
  return {
    user: { align: 'flex-start', bg: token.colorFillTertiary, label: 'Sent from your phone' },
    assistant: { align: 'flex-end', bg: token.colorInfoBg, label: '🤖 Bot' },
    admin: { align: 'flex-end', bg: token.colorSuccessBg, label: '👤 Admin' },
  };
}

export default function ShopWhatsAppPage() {
  const [me, setMe] = useState<{ isOwner: boolean } | null>(null);

  useEffect(() => {
    apiCall('GET', '/api/shop/me').then((res) => {
      const data = res.data ?? res;
      setMe({ isOwner: !!data.isOwner });
    }).catch(() => setMe({ isOwner: false }));
  }, []);

  if (!me) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>
        <WhatsAppOutlined style={{ marginRight: 8, color: '#25D366' }} />WhatsApp
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Two separate things live here: WhatsApp notifications and replies for the prescription quote requests you
        manage on the <Text strong>Prescription Requests</Text> page, and — if enabled for your shop — your own
        independent WhatsApp Business presence for your own customers.
      </Text>

      <Tabs
        items={[
          {
            key: 'quotes',
            label: <span><WhatsAppOutlined /> Request Notifications</span>,
            children: <QuoteRequestsTab me={me} />,
          },
          ...(me.isOwner ? [{
            key: 'module',
            label: <span><GlobalOutlined /> My Own Number</span>,
            children: <ModuleTab />,
          }] : []),
        ]}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 1 — WhatsApp notifications/replies for quote requests actually
// submitted on the Prescription Requests page (/requests) — this tab is
// NOT a second place to quote, just the phone-number channel for it.
// ════════════════════════════════════════════════════════════════════════
function QuoteRequestsTab({ me }: { me: { isOwner: boolean } }) {
  const { token } = theme.useToken();
  const roleStyles = getRoleStyles(token);

  const [status, setStatus] = useState<{ whatsappLinked: boolean; whatsappLinkedAt?: string; contactPhone: string } | null>(null);
  const [session, setSession] = useState<{ awaitingHuman: boolean; messages: WhatsAppMessageEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResult, sessionResult] = await Promise.all([
        apiCall('GET', '/api/shop/whatsapp/status'),
        apiCall('GET', '/api/shop/whatsapp/session'),
      ]);
      setStatus(statusResult.data ?? statusResult);
      setSession((sessionResult.data ?? sessionResult) || null);
    } catch (err: unknown) {
      setError(errMsg(err, 'Failed to load WhatsApp status'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const copyNumber = () => {
    if (!status) return;
    navigator.clipboard.writeText(status.contactPhone);
    message.success('Number copied');
  };

  const resetConversation = async () => {
    setResetting(true);
    try {
      await apiCall('POST', '/api/shop/whatsapp/session/reset');
      message.success('Conversation reset — the bot will respond again');
      fetchAll();
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to reset conversation'));
    } finally { setResetting(false); }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        You still submit and manage quotes on the <Text strong>Prescription Requests</Text> page — this is just
        the notification channel: a heads-up on your own phone number when a new request is dispatched to you,
        and a place to reply from WhatsApp if that&apos;s easier than opening the portal.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Card size="small" style={{ marginBottom: 20, maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {status?.whatsappLinked ? (
            <>
              <CheckCircleFilled style={{ fontSize: 20, color: token.colorSuccess }} />
              <Text strong>Linked</Text>
            </>
          ) : (
            <>
              <CloseCircleFilled style={{ fontSize: 20, color: token.colorWarning }} />
              <Text strong>Not linked yet</Text>
            </>
          )}
        </div>

        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Number on file</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text code>{status?.contactPhone}</Text>
            <Button size="small" type="text" icon={<CopyOutlined />} onClick={copyNumber} />
          </div>
        </div>

        {status?.whatsappLinked ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Linked since {status.whatsappLinkedAt ? new Date(status.whatsappLinkedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}.
            {' '}Quote requests will arrive here as WhatsApp messages.
          </Text>
        ) : (
          <Alert
            type="info"
            showIcon
            message="One-time step to start receiving requests"
            description={
              <span>
                Send any WhatsApp message (e.g. &quot;Hi&quot;) from <Text code>{status?.contactPhone}</Text> to your
                platform&apos;s WhatsApp number. WhatsApp only allows messaging a number that has messaged you
                first, so this one message opens the door — after that, quote requests reach you automatically.
              </span>
            }
          />
        )}
      </Card>

      <Title level={5} style={{ marginBottom: 12 }}>Conversation</Title>

      {!session ? (
        <Text type="secondary" style={{ fontSize: 13 }}>No messages yet — nothing to show until you send that first message.</Text>
      ) : (
        <div style={{ maxWidth: 560 }}>
          {session.awaitingHuman && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="An admin is currently handling this conversation manually — the bot is paused."
              action={me.isOwner && (
                <Popconfirm title="Resume the bot for this conversation?" onConfirm={resetConversation}>
                  <Button size="small" loading={resetting} icon={<ReloadOutlined />}>Resume Bot</Button>
                </Popconfirm>
              )}
            />
          )}

          <div
            style={{
              display: 'flex', flexDirection: 'column', gap: 10, padding: 14,
              background: token.colorFillAlter, borderRadius: 8, maxHeight: 480, overflowY: 'auto',
            }}
          >
            {session.messages.length === 0 && <Text type="secondary">No messages yet.</Text>}
            {session.messages.map((m, i) => {
              const style = roleStyles[m.role];
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: style.align }}>
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
                    {new Date(m.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </div>
              );
            })}
          </div>

          {me.isOwner && !session.awaitingHuman && (
            <div style={{ marginTop: 12 }}>
              <Popconfirm title="Reset this conversation? Use this only if it seems stuck." onConfirm={resetConversation}>
                <Button size="small" icon={<ReloadOutlined />} loading={resetting}>Reset Conversation</Button>
              </Popconfirm>
            </div>
          )}
        </div>
      )}

      <Space style={{ marginTop: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchAll}>Refresh</Button>
      </Space>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Tab 2 — the shop's own independent WhatsApp module (owner only)
// ════════════════════════════════════════════════════════════════════════
function secretPlaceholder(hasSecret: boolean, label: string): string {
  return hasSecret ? `•••••••• (configured — leave blank to keep)` : `Enter ${label}`;
}

function ModuleTab() {
  const router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enabledAt, setEnabledAt] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/shop/whatsapp-module/status');
      const data = result.data ?? result;
      setEnabled(!!data.enabled);
      setEnabledAt(data.enabledAt);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setEnabled(false);
      } else if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Failed to load WhatsApp module status');
      } else {
        setError('An unexpected error occurred');
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [provider, setProvider] = useState<'twilio' | 'meta'>('twilio');
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
  const [configured, setConfigured] = useState(false);

  const openSettings = async () => {
    setSettingsOpen(true);
    setSettingsLoading(true);
    try {
      const result = await apiCall('GET', '/api/shop/whatsapp-module/config');
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
      setConfigured(!!cfg.configured);
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to load settings'));
    } finally { setSettingsLoading(false); }
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      await apiCall('PUT', '/api/shop/whatsapp-module/config', {
        provider,
        twilioAccountSid: twilioAccountSid.trim() || undefined,
        twilioAuthToken: twilioAuthToken.trim() || undefined,
        twilioFromNumber: twilioFromNumber.trim() || undefined,
        metaPhoneNumberId: metaPhoneNumberId.trim() || undefined,
        metaAccessToken: metaAccessToken.trim() || undefined,
        metaAppSecret: metaAppSecret.trim() || undefined,
        metaApiVersion: metaApiVersion.trim() || undefined,
      });
      message.success('WhatsApp settings saved');
      setSettingsOpen(false);
    } catch (err: unknown) {
      message.error(errMsg(err, 'Failed to save settings'));
    } finally { setSettingsSaving(false); }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        Your own independent WhatsApp Business presence — a dedicated number your customers message directly, with
        your own provider account and your own conversation flows.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {!enabled ? (
        <Alert
          type="info"
          showIcon
          message="Not enabled for your shop yet"
          description="This is a premium module the platform team turns on per shop. Reach out to them if you'd like your own WhatsApp Business number and conversation flow builder here."
        />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleFilled />}
            message="Module enabled"
            description={enabledAt ? `Since ${new Date(enabledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
          />

          <Space wrap size="middle">
            <Button icon={<SettingOutlined />} onClick={openSettings}>
              Provider Settings {configured ? '' : '(not configured yet)'}
            </Button>
            <Button icon={<ApartmentOutlined />} onClick={() => router.push('/whatsapp-module/flows')}>
              Conversation Flows
            </Button>
            <Button icon={<MessageOutlined />} onClick={() => router.push('/whatsapp-module/sessions')}>
              Conversations
            </Button>
          </Space>

          {!configured && (
            <Alert
              type="warning"
              showIcon
              message="Set up your provider account before your number can send or receive anything"
              description="Add your Twilio or Meta WhatsApp Business credentials in Provider Settings, then build a flow to define what customers see."
            />
          )}
        </Space>
      )}

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
            <Alert
              type="info"
              showIcon
              message="Unlike a tenant, there's no platform-shared fallback here — until this is filled in and saved, your module number won't work at all."
            />
            <div>
              <Text strong style={{ fontSize: 13 }}>Provider</Text>
              <div style={{ marginTop: 4 }}>
                <Radio.Group value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <Radio.Button value="twilio">Twilio</Radio.Button>
                  <Radio.Button value="meta">Meta Cloud API</Radio.Button>
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
                    placeholder={secretPlaceholder(hasTwilioAuthToken, 'auth token')}
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
                    placeholder={secretPlaceholder(hasMetaAccessToken, 'access token')}
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
                    placeholder={secretPlaceholder(hasMetaAppSecret, 'app secret')}
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
          </Space>
        )}
      </Modal>
    </div>
  );
}
