'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Drawer, Input, Avatar, Spin, Typography, Popconfirm, theme } from 'antd';
import type { GlobalToken } from 'antd/es/theme/interface';
import {
  ThunderboltOutlined,
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  HistoryOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiCall } from '../../lib/api';

const { Text } = Typography;
const { TextArea } = Input;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

type View = 'chat' | 'history';

const CONVERSATIONS_LIMIT = 30;
const MESSAGES_PER_CONVERSATION_LIMIT = 60;
const CONVOS_KEY_PREFIX = 'studio_assistant_convos_';
const LEGACY_CHAT_KEY_PREFIX = 'studio_assistant_chat_';

// A representative spread across domains — not every user will have
// permission for all of these, but that's fine: tapping one that's out of
// reach just gets the same honest "you don't have permission" answer as
// typing it would, which is useful feedback in itself.
const SUGGESTED_QUESTIONS = [
  "What's this month's revenue?",
  'How many doctors are pending approval?',
  'How many bookings do we have this month?',
  'Which doctors are top rated?',
  'How many WhatsApp chats are waiting for a reply?',
  'How many prescriptions were issued this month?',
];

const markdownComponents = (token: GlobalToken) => ({
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p style={{ margin: '4px 0' }} {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong style={{ fontWeight: 700 }} {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul style={{ margin: '4px 0', paddingLeft: 18 }} {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol style={{ margin: '4px 0', paddingLeft: 18 }} {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li style={{ margin: '2px 0' }} {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      style={{
        background: token.colorFillSecondary,
        padding: '1px 5px',
        borderRadius: 4,
        fontSize: 12.5,
      }}
      {...props}
    />
  ),
  table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5 }} {...props} />
    </div>
  ),
  th: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
    <th
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        padding: '5px 9px',
        textAlign: 'left',
        background: token.colorFillSecondary,
        fontWeight: 700,
      }}
      {...props}
    />
  ),
  td: (props: React.TdHTMLAttributes<HTMLTableCellElement>) => (
    <td style={{ border: `1px solid ${token.colorBorderSecondary}`, padding: '5px 9px' }} {...props} />
  ),
});

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Module-level wrapper so calls from inside the component aren't flagged as
// "impure function during render" by the purity lint rule — same reasoning
// as newId() above already being exempt as a module-scope helper.
function now(): number {
  return Date.now();
}

function tenantUserSuffix(): string {
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}') as {
      id?: string;
      tenantId?: string;
    };
    return `${stored.tenantId ?? 'default'}_${stored.id ?? 'unknown'}`;
  } catch {
    return 'default_unknown';
  }
}

// One-time migration from the old single-thread storage format into the
// first entry of the new multi-conversation history.
function loadConversations(suffix: string): Conversation[] {
  const key = `${CONVOS_KEY_PREFIX}${suffix}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Conversation[];
  } catch {
    /* ignore corrupt data */
  }

  try {
    const legacyKey = `${LEGACY_CHAT_KEY_PREFIX}${suffix}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      localStorage.removeItem(legacyKey);
      const legacyMessages = JSON.parse(legacyRaw) as ChatMessage[];
      if (legacyMessages.length) {
        return [
          {
            id: newId(),
            title: legacyMessages[0]?.content.slice(0, 60) || 'Previous conversation',
            messages: legacyMessages,
            updatedAt: Date.now(),
          },
        ];
      }
    }
  } catch {
    /* ignore */
  }

  return [];
}

// Floating "ask anything about this tenant's data" assistant, mounted once
// in the admin layout. Answers are scoped server-side to whatever the
// logged-in user's role permissions actually allow (see
// askStudioAssistant in admin.service.ts) — a role without analytics.view
// or payments.view will never get a revenue figure out of it, no matter
// how the question is phrased.
//
// Conversations are persisted to localStorage keyed by tenant + user, so
// they survive a page refresh and are naturally scoped separately per
// tenant when a super admin impersonates a different tenant (their stored
// `user.tenantId` changes with it). Multiple named threads are kept,
// browsable/renamable/deletable from the history panel.
export default function StudioAssistant() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [suffix] = useState<string>(() => (typeof window === 'undefined' ? 'default_unknown' : tenantUserSuffix()));
  const storageKey = `${CONVOS_KEY_PREFIX}${suffix}`;

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    typeof window === 'undefined' ? [] : loadConversations(suffix),
  );
  // Deliberately NOT restored from the last-active conversation on mount —
  // a fresh page load (refresh) always opens to a blank new-chat state, the
  // same way ChatGPT does. Past conversations are never lost; they're just
  // sitting in the History panel one tap away instead of auto-resuming.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { token } = theme.useToken();
  const bottomRef = useRef<HTMLDivElement>(null);
  const components = markdownComponents(token);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations.slice(0, CONVERSATIONS_LIMIT)));
    } catch {
      /* ignore storage quota errors */
    }
  }, [conversations, storageKey]);

  useEffect(() => {
    if (open && view === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, view]);

  const appendMessage = (id: string, msg: ChatMessage) => {
    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === id
            ? { ...c, messages: [...c.messages, msg].slice(-MESSAGES_PER_CONVERSATION_LIMIT), updatedAt: now() }
            : c,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const priorMessages = activeConversation?.messages ?? [];
    const targetId = activeId ?? newId();
    const nowMs = now();
    const userMsg: ChatMessage = { role: 'user', content: text };

    setConversations((prev) => {
      const exists = prev.some((c) => c.id === targetId);
      const updated = exists
        ? prev.map((c) => (c.id === targetId ? { ...c, messages: [...c.messages, userMsg], updatedAt: nowMs } : c))
        : [{ id: targetId, title: text.slice(0, 60), messages: [userMsg], updatedAt: nowMs }, ...prev];
      return updated.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, CONVERSATIONS_LIMIT);
    });
    if (activeId !== targetId) setActiveId(targetId);
    setView('chat');

    try {
      const result = await apiCall('POST', '/api/admin/ai-assistant/query', {
        message: text,
        history: priorMessages.slice(-10),
      });
      const { reply } = result.data ?? result;
      appendMessage(targetId, { role: 'assistant', content: reply });
    } catch (err: unknown) {
      const serverMessage = axios.isAxiosError(err) ? err.response?.data?.message : null;
      appendMessage(targetId, {
        role: 'assistant',
        content: serverMessage || "Sorry, I couldn't process that — please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setActiveId(null);
    setView('chat');
  };

  const openConversation = (id: string) => {
    setActiveId(id);
    setView('chat');
  };

  const startRename = (c: Conversation) => {
    setEditingId(c.id);
    setEditingTitle(c.title);
  };

  const confirmRename = () => {
    if (!editingId) return;
    const title = editingTitle.trim();
    if (title) {
      setConversations((prev) => prev.map((c) => (c.id === editingId ? { ...c, title } : c)));
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const deleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <>
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={<ThunderboltOutlined style={{ fontSize: 22 }} />}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: 28,
          bottom: 28,
          width: 56,
          height: 56,
          zIndex: 1000,
          boxShadow: '0 4px 16px rgba(22,119,255,0.4)',
        }}
        title="Ask the Studio Assistant"
      />

      <Drawer
        title={
          <span>
            <RobotOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            Studio Assistant
          </span>
        }
        placement="right"
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
        extra={
          <div style={{ display: 'flex', gap: 4 }}>
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={startNewChat} title="New chat" />
            <Button
              type="text"
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => setView(view === 'history' ? 'chat' : 'history')}
              title="Conversation history"
            />
          </div>
        }
      >
        {view === 'history' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
              <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => setView('chat')} />
              <Text strong>Conversation History</Text>
            </div>

            {conversations.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 40 }}>
                No saved conversations yet.
              </Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 10px',
                      borderRadius: 8,
                      background: c.id === activeId ? token.colorFillSecondary : 'transparent',
                    }}
                  >
                    {editingId === c.id ? (
                      <Input
                        size="small"
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onPressEnter={confirmRename}
                        onBlur={confirmRename}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openConversation(c.id)}>
                        <Text ellipsis style={{ display: 'block', fontSize: 13 }}>
                          {c.title}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {c.messages.length} message{c.messages.length === 1 ? '' : 's'} ·{' '}
                          {new Date(c.updatedAt).toLocaleString()}
                        </Text>
                      </div>
                    )}
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        startRename(c);
                      }}
                    />
                    <Popconfirm
                      title="Delete this conversation?"
                      description="This can't be undone."
                      onConfirm={() => deleteConversation(c.id)}
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Ask anything about your doctors, bookings, revenue, WhatsApp, and more —
                answers are limited to what your role has access to. Past conversations are
                saved — tap <HistoryOutlined /> to revisit, rename, or delete them.
              </Text>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: 24 }}>
                  <RobotOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block', margin: '0 auto 12px', color: token.colorTextSecondary }} />
                  <Text type="secondary">Not sure what to ask? Try one of these:</Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <Button
                        key={q}
                        size="small"
                        disabled={loading}
                        onClick={() => send(q)}
                        style={{ borderRadius: 16, textAlign: 'left', height: 'auto', padding: '4px 12px', whiteSpace: 'normal' }}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <Avatar
                    size="small"
                    icon={m.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    style={{
                      background: m.role === 'user' ? token.colorPrimary : token.colorFillSecondary,
                      color: m.role === 'user' ? '#fff' : token.colorText,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      background: m.role === 'user' ? token.colorPrimary : token.colorFillAlter,
                      color: m.role === 'user' ? '#fff' : token.colorText,
                      padding: '8px 12px',
                      borderRadius: 12,
                      maxWidth: '85%',
                      fontSize: 13.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {m.role === 'assistant' ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                        {m.content}
                      </ReactMarkdown>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Avatar size="small" icon={<RobotOutlined />} style={{ background: token.colorFillSecondary }} />
                  <Spin size="small" />
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, display: 'flex', gap: 8 }}>
              <TextArea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={(e) => {
                  if (!e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about your doctors, bookings, revenue…"
                autoSize={{ minRows: 1, maxRows: 4 }}
              />
              <Button type="primary" icon={<SendOutlined />} onClick={() => send()} loading={loading} disabled={!input.trim()} />
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
