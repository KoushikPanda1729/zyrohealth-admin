'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow, Background, Controls, ControlButton, Panel,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Button, Drawer, Form, Input, Select, Space, Typography, message, Spin, Breadcrumb, Popconfirm, Divider, Modal, theme,
} from 'antd';
import {
  PlayCircleOutlined, SaveOutlined,
  PlusOutlined, DeleteOutlined,
  ThunderboltOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SendOutlined, ReloadOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../../lib/api';
import {
  type FlowNodeType, type FlowNodeData,
  NODE_META, PLATFORM_NODE_TYPES, PRESCRIPTION_NODE_TYPES, GENERIC_NODE_TYPES,
  nodeTypes, defaultEdgeOptions,
} from '../flow-node-meta';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface PreviewSessionState {
  flowNodeId?: string | null;
  activeFlowId?: string | null;
  flowVariables?: Record<string, unknown>;
  messages?: unknown[];
}

interface PreviewStep {
  stepType: string;
  data: Record<string, unknown>;
}

interface PreviewMessage {
  role: 'user' | 'assistant';
  text?: string;
  step?: PreviewStep;
}

interface PaletteGroup { title: string; subtitle?: string; types: FlowNodeType[] }

const PALETTE_GROUPS: PaletteGroup[] = [
  { title: 'Platform Data', subtitle: 'Live doctor/booking data — chain these to build a real booking flow', types: PLATFORM_NODE_TYPES },
  { title: 'Prescription Flow', subtitle: 'Same channel-agnostic pipeline for WhatsApp or the app — chain these to build the upload-to-delivery journey', types: PRESCRIPTION_NODE_TYPES },
  { title: 'Add Node', types: GENERIC_NODE_TYPES },
];

// A floating, collapsible dark card so it reads consistently against the
// canvas's own dark colorMode regardless of the admin app's light/dark
// theme — and collapses to a single icon button when the canvas needs
// the room.
function NodePalette({
  groups, collapsed, onToggle, onAddNode,
}: {
  groups: PaletteGroup[];
  collapsed: boolean;
  onToggle: () => void;
  onAddNode: (type: FlowNodeType) => void;
}) {
  if (collapsed) {
    return (
      <button onClick={onToggle} title="Show node palette" className="flow-palette-fab">
        <MenuUnfoldOutlined />
      </button>
    );
  }

  return (
    <div className="flow-palette">
      <div className="flow-palette-header">
        <span>Add Nodes</span>
        <button onClick={onToggle} title="Collapse" className="flow-palette-collapse">
          <MenuFoldOutlined style={{ fontSize: 12 }} />
        </button>
      </div>
      <div className="flow-palette-body">
        {groups.filter((g) => g.types.length > 0).map((group, gi, arr) => (
          <div key={group.title} style={{ marginBottom: gi === arr.length - 1 ? 0 : 14 }}>
            <div className="flow-palette-group-title">{group.title}</div>
            {group.subtitle && <div className="flow-palette-group-subtitle">{group.subtitle}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {group.types.map((t) => {
                const meta = NODE_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => onAddNode(t)}
                    title={`Add ${meta.label}`}
                    className="flow-palette-btn"
                    style={{ '--accent': meta.color } as React.CSSProperties}
                  >
                    <span className="flow-palette-btn-icon">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .flow-palette-fab {
          width: 36px; height: 36px; border-radius: 10px; border: 1px solid #263041;
          background: #111827; color: #e5e7eb; display: flex; align-items: center;
          justify-content: center; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.35);
          transition: background 0.15s, border-color 0.15s;
        }
        .flow-palette-fab:hover { background: #1c283b; border-color: #3b4759; }
        .flow-palette {
          width: 252px; max-height: 82vh; display: flex; flex-direction: column;
          background: #111827; border: 1px solid #1f2937; border-radius: 12px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.35); color: #e5e7eb; overflow: hidden;
        }
        .flow-palette-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border-bottom: 1px solid #1f2937; flex-shrink: 0;
          font-size: 12px; font-weight: 700; letter-spacing: 0.3px; color: #f9fafb;
        }
        .flow-palette-collapse {
          width: 24px; height: 24px; border-radius: 6px; border: none; background: transparent;
          color: #9ca3af; cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .flow-palette-collapse:hover { background: #1f2937; color: #f9fafb; }
        .flow-palette-body { padding: 10px; overflow-y: auto; }
        .flow-palette-group-title {
          font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase;
          letter-spacing: 0.4px; margin-bottom: 6px;
        }
        .flow-palette-group-subtitle { font-size: 10.5px; color: #6b7280; margin: -4px 0 6px; line-height: 1.4; }
        .flow-palette-btn {
          display: flex; align-items: center; gap: 6px; padding: 5px 9px 5px 6px;
          border-radius: 8px; border: 1px solid #263041; background: #161f2e;
          color: #e5e7eb; font-size: 11.5px; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, transform 0.1s;
        }
        .flow-palette-btn:hover { background: #1c283b; border-color: var(--accent); }
        .flow-palette-btn:active { transform: scale(0.96); }
        .flow-palette-btn-icon {
          width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--accent) 22%, transparent);
          color: var(--accent); display: flex; align-items: center; justify-content: center;
          font-size: 11px; flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now()}_${idCounter}`;
}

// Deterministic-but-staggered placement for a newly added node — avoids
// Math.random() during render (impure) while still not stacking every new
// node at the exact same spot.
function nextNodePosition(): { x: number; y: number } {
  const step = idCounter % 6;
  return { x: 100 + step * 40, y: 100 + step * 30 };
}

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.flowId as string;
  const { token } = theme.useToken();

  const [flowName, setFlowName] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEditing, setAiEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // ── Preview — runs the CURRENT (possibly unsaved) canvas definition
  // through the real flow engine, one turn per message, so whoever's
  // building this can confirm "yes, this is what I want" before saving or
  // going live. Fully client-held conversation state (sessionState),
  // roundtripped to the stateless preview endpoint each turn. ────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewSessionState, setPreviewSessionState] = useState<PreviewSessionState | undefined>(undefined);
  const [previewInput, setPreviewInput] = useState('');
  const [previewSending, setPreviewSending] = useState(false);

  // Escape is the conventional way out of a fullscreen takeover — without
  // this, a keyboard user has no way back short of reloading the page.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  const applyFlow = useCallback((flow: { name: string; definition: { nodes: unknown[]; edges: unknown[] } }) => {
    setFlowName(flow.name);
    setNodes(
      (flow.definition.nodes as { id: string; type: FlowNodeType; position: { x: number; y: number }; data: FlowNodeData }[])
        .map((n) => ({ id: n.id, type: 'flowNode', position: n.position, data: { ...n.data, nodeType: n.type } })),
    );
    setEdges(
      (flow.definition.edges as { id: string; source: string; target: string; sourceHandle?: string | null }[])
        .map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const result = await apiCall('GET', `/api/admin/whatsapp/flows/${flowId}`);
        applyFlow(result.data ?? result);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load flow');
        else setError('An unexpected error occurred');
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge(connection, eds));
  }, [setEdges]);

  const addNode = (type: FlowNodeType) => {
    const defaultData: FlowNodeData =
      type === 'buttons' ? { nodeType: type, text: '', options: [] }
      : type === 'condition' ? { nodeType: type, variablePath: '', operator: 'equals', value: '' }
      : type === 'api_call' ? { nodeType: type, url: '', method: 'GET', body: '', responseMapping: [] }
      : { nodeType: type, text: '' };

    const newNode: Node<FlowNodeData> = {
      id: nextId(type),
      type: 'flowNode',
      position: nextNodePosition(),
      data: defaultData,
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const updateSelectedNodeData = (patch: Partial<FlowNodeData>) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const buildDefinition = useCallback(() => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      position: n.position,
      data: (({ nodeType: _nt, ...rest }) => rest)(n.data),
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
  }), [nodes, edges]);

  const resetPreview = () => {
    setPreviewMessages([]);
    setPreviewSessionState(undefined);
    setPreviewInput('');
  };

  const openPreview = () => {
    resetPreview();
    setPreviewOpen(true);
  };

  const sendPreviewMessage = async (text: string) => {
    if (!text.trim() || previewSending) return;
    setPreviewSending(true);
    setPreviewMessages((prev) => [...prev, { role: 'user', text }]);
    setPreviewInput('');
    try {
      const result = await apiCall('POST', '/api/admin/whatsapp/flows/preview', {
        definition: buildDefinition(),
        text,
        sessionState: previewSessionState,
      });
      const data = (result.data ?? result) as { steps: PreviewStep[]; sessionState: PreviewSessionState };
      setPreviewSessionState(data.sessionState);
      const newMessages: PreviewMessage[] = data.steps.map((step) =>
        step.stepType === 'text'
          ? { role: 'assistant', text: (step.data['text'] as string | undefined) ?? '' }
          : { role: 'assistant', step },
      );
      setPreviewMessages((prev) => [...prev, ...newMessages]);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Preview failed');
      else message.error('An unexpected error occurred');
    } finally { setPreviewSending(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const definition = buildDefinition();
      await apiCall('PATCH', `/api/admin/whatsapp/flows/${flowId}`, { name: flowName, definition });
      message.success('Flow saved');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save flow');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const editWithAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      await save();
      const result = await apiCall('POST', `/api/admin/whatsapp/flows/${flowId}/generate`, { prompt: aiPrompt.trim() });
      applyFlow(result.data ?? result);
      setSelectedNodeId(null);
      message.success('Flow updated by AI — review the changes before saving');
      setAiEditing(false);
      setAiPrompt('');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update flow with AI');
      else message.error('An unexpected error occurred');
    } finally { setAiLoading(false); }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin size="large" /></div>;
  }
  if (error) {
    return <Text type="danger">{error}</Text>;
  }

  return (
    <div
      style={
        fullscreen
          ? {
              position: 'fixed', inset: 0, zIndex: 900, background: token.colorBgLayout,
              padding: 16, display: 'flex', flexDirection: 'column',
            }
          : { height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column' }
      }
    >
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={() => router.push('/whatsapp')}>WhatsApp</a> },
          { title: <a onClick={() => router.push('/whatsapp/flows')}>Flows</a> },
          { title: flowName },
        ]}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Input
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          style={{ maxWidth: 320, width: '100%', fontWeight: 600 }}
        />
        <Space wrap>
          <Button icon={<PlayCircleOutlined />} onClick={openPreview}>Preview</Button>
          <Button icon={<ThunderboltOutlined />} onClick={() => setAiEditing(true)}>Edit with AI</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>Save</Button>
        </Space>
      </div>

      <div style={{ flex: 1, width: '100%', minWidth: 0, border: '1px solid #1f2937', borderRadius: 8, overflow: 'hidden' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          defaultEdgeOptions={defaultEdgeOptions}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background />
          {/* Top-right — the node palette runs the full height of the left
              side (ruling out bottom-left), and bottom-right sits directly
              under the global "Edit with AI" assistant FAB (see
              StudioAssistant in app/(admin)/layout.tsx), which would hide
              the last control button behind it. */}
          <Controls position="top-right">
            <ControlButton onClick={() => setFullscreen((v) => !v)} title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}>
              {fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </ControlButton>
          </Controls>
          <Panel position="top-left">
            <NodePalette
              groups={PALETTE_GROUPS}
              collapsed={paletteCollapsed}
              onToggle={() => setPaletteCollapsed((v) => !v)}
              onAddNode={addNode}
            />
          </Panel>
        </ReactFlow>
      </div>

      <Drawer
        title={selectedNode ? `Edit: ${NODE_META[selectedNode.data.nodeType].label}` : ''}
        open={!!selectedNode}
        onClose={() => setSelectedNodeId(null)}
        size={380}
        extra={
          selectedNode && selectedNode.data.nodeType !== 'start' && (
            <Popconfirm title="Delete this node?" onConfirm={deleteSelectedNode} okText="Delete" okButtonProps={{ danger: true }}>
              <Button danger icon={<DeleteOutlined />} size="small">Delete</Button>
            </Popconfirm>
          )
        }
      >
        {selectedNode && <NodeConfigForm node={selectedNode} onChange={updateSelectedNodeData} />}
      </Drawer>

      <Modal
        title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />Edit Flow with AI</span>}
        open={aiEditing}
        onCancel={() => setAiEditing(false)}
        onOk={editWithAi}
        okText="Update"
        confirmLoading={aiLoading}
        okButtonProps={{ disabled: !aiPrompt.trim() }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Describe the change</Text>
            <TextArea
              rows={5}
              placeholder='e.g. "Add a step after the slot is picked that asks whether the patient wants video or in-person consultation."'
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{ marginTop: 4 }}
              autoFocus
            />
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            The current flow is saved first, then the AI updates it based on your instruction — parts you don&apos;t
            mention are left unchanged. Review the result before saving again.
          </Text>
        </Space>
      </Modal>

      <Drawer
        title={<span><PlayCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />Preview</span>}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size={420}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={resetPreview}>Reset</Button>}
        styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}
      >
        <Text type="secondary" style={{ fontSize: 12, padding: '0 16px', display: 'block', marginBottom: 12 }}>
          Runs the canvas exactly as it is right now — including any unsaved changes — through the real engine.
          Data-driven steps (bookings, prescription requests) really happen, against one dedicated test patient.
        </Text>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {previewMessages.length === 0 && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              Say &quot;hi&quot; to start — same greeting a real user would send.
            </Text>
          )}
          {previewMessages.map((m, i) => (
            <PreviewBubble key={i} message={m} onOptionClick={(label) => void sendPreviewMessage(label)} />
          ))}
          {previewSending && <Spin size="small" />}
        </div>
        <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <Input
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
            onPressEnter={() => void sendPreviewMessage(previewInput)}
            placeholder='Type a message, e.g. "hi"'
            disabled={previewSending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={previewSending}
            onClick={() => void sendPreviewMessage(previewInput)}
          />
        </div>
      </Drawer>
    </div>
  );
}

function PreviewBubble({
  message: m, onOptionClick,
}: {
  message: PreviewMessage;
  onOptionClick: (label: string) => void;
}) {
  const isUser = m.role === 'user';
  const bubbleStyle: React.CSSProperties = {
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    maxWidth: '85%',
    padding: '8px 12px',
    borderRadius: 12,
    background: isUser ? '#199A8E' : 'rgba(255,255,255,0.08)',
    color: isUser ? '#fff' : 'inherit',
    fontSize: 13,
    whiteSpace: 'pre-wrap',
  };

  if (m.text !== undefined) {
    return <div style={bubbleStyle}>{m.text || <Text type="secondary" style={{ fontSize: 12 }}>(empty)</Text>}</div>;
  }

  const step = m.step;
  if (!step) return null;

  if (step.stepType === 'options' && Array.isArray(step.data['options'])) {
    const options = step.data['options'] as { id: string; title: string; description?: string }[];
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={bubbleStyle}>{step.data['text'] as string}</div>
        <Space direction="vertical" style={{ width: '100%' }} size={4}>
          {options.map((o) => (
            <Button key={o.id} size="small" onClick={() => onOptionClick(o.title)} style={{ textAlign: 'left' }}>
              {o.title}
            </Button>
          ))}
        </Space>
      </div>
    );
  }

  // Any other structured step (upload_prescription, select_quote, order_payment,
  // track_delivery, ...) — a generic system-style card rather than bespoke UI
  // for every step type, since this is for confirming flow logic, not a
  // polished end-user experience.
  return (
    <div style={{
      alignSelf: 'flex-start', maxWidth: '90%', padding: '8px 12px', borderRadius: 8,
      border: '1px dashed rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace',
    }}>
      <div style={{ marginBottom: 4, fontWeight: 600 }}>⚙ {step.stepType}</div>
      {Object.keys(step.data).length > 0 && (
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(step.data, null, 2)}</pre>
      )}
    </div>
  );
}

function NodeConfigForm({
  node, onChange,
}: {
  node: Node<FlowNodeData>;
  onChange: (patch: Partial<FlowNodeData>) => void;
}) {
  const data = node.data;

  switch (data.nodeType) {
    case 'start':
      return <Text type="secondary">The entry point — every conversation starts here. No configuration needed.</Text>;

    case 'end':
      return <Text type="secondary">Ends the flow and hands control back to the default menu bot.</Text>;

    case 'message':
      return (
        <Form layout="vertical">
          <Form.Item label="Message text">
            <TextArea rows={4} value={data.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="Use {{variableName}} to insert flow variables" />
          </Form.Item>
        </Form>
      );

    case 'buttons': {
      const options = data.options ?? [];
      return (
        <Form layout="vertical">
          <Form.Item label="Prompt text">
            <TextArea rows={3} value={data.text} onChange={(e) => onChange({ text: e.target.value })} />
          </Form.Item>
          <Divider style={{ margin: '12px 0' }}>Options</Divider>
          {options.map((o, i) => (
            <Space key={o.id} style={{ display: 'flex', marginBottom: 8 }}>
              <Input
                value={o.label}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = { ...o, label: e.target.value };
                  onChange({ options: next });
                }}
              />
              <Button
                danger size="small" icon={<DeleteOutlined />}
                onClick={() => onChange({ options: options.filter((_, idx) => idx !== i) })}
              />
            </Space>
          ))}
          <Button
            icon={<PlusOutlined />} block
            onClick={() => onChange({ options: [...options, { id: nextId('opt'), label: '' }] })}
          >
            Add option
          </Button>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
            Drag a connection from each option&apos;s right-side dot to the node it should lead to.
          </Text>
        </Form>
      );
    }

    case 'ai':
      return (
        <Form layout="vertical">
          <Form.Item label="System prompt">
            <TextArea rows={5} value={data.systemPrompt} onChange={(e) => onChange({ systemPrompt: e.target.value })} placeholder="Instructions for the AI at this point in the conversation" />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 11 }}>
            If this node has one outgoing connection, it advances after one AI reply. With no connection, it stays here indefinitely (open-ended chat).
          </Text>
        </Form>
      );

    case 'condition':
      return (
        <Form layout="vertical">
          <Form.Item label="Variable path">
            <Input value={data.variablePath} onChange={(e) => onChange({ variablePath: e.target.value })} placeholder="e.g. orderStatus" />
          </Form.Item>
          <Form.Item label="Operator">
            <Select
              value={data.operator ?? 'equals'}
              onChange={(v) => onChange({ operator: v })}
              options={[
                { value: 'equals', label: 'Equals' },
                { value: 'contains', label: 'Contains' },
                { value: 'exists', label: 'Exists (has a value)' },
              ]}
            />
          </Form.Item>
          {data.operator !== 'exists' && (
            <Form.Item label="Value to compare">
              <Input value={data.value} onChange={(e) => onChange({ value: e.target.value })} />
            </Form.Item>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>Connect the &quot;True&quot; dot and &quot;False&quot; dot to different branches.</Text>
        </Form>
      );

    case 'api_call': {
      const mapping = data.responseMapping ?? [];
      return (
        <Form layout="vertical">
          <Form.Item label="URL">
            <Input value={data.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://api.example.com/{{orderId}}" />
          </Form.Item>
          <Form.Item label="Method">
            <Select
              value={data.method ?? 'GET'}
              onChange={(v) => onChange({ method: v })}
              options={['GET', 'POST', 'PUT', 'PATCH'].map((m) => ({ value: m, label: m }))}
            />
          </Form.Item>
          {data.method !== 'GET' && (
            <Form.Item label="Body (JSON template)">
              <TextArea rows={3} value={data.body} onChange={(e) => onChange({ body: e.target.value })} placeholder='{"phone":"{{phone}}"}' />
            </Form.Item>
          )}
          <Divider style={{ margin: '12px 0' }}>Response → Variables</Divider>
          {mapping.map((m, i) => (
            <Space key={i} style={{ display: 'flex', marginBottom: 8 }}>
              <Input
                placeholder="variable name" value={m.variablePath}
                onChange={(e) => {
                  const next = [...mapping];
                  next[i] = { ...m, variablePath: e.target.value };
                  onChange({ responseMapping: next });
                }}
              />
              <Input
                placeholder="response.json.path" value={m.jsonPath}
                onChange={(e) => {
                  const next = [...mapping];
                  next[i] = { ...m, jsonPath: e.target.value };
                  onChange({ responseMapping: next });
                }}
              />
              <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onChange({ responseMapping: mapping.filter((_, idx) => idx !== i) })} />
            </Space>
          ))}
          <Button icon={<PlusOutlined />} block onClick={() => onChange({ responseMapping: [...mapping, { variablePath: '', jsonPath: '' }] })}>
            Add mapping
          </Button>
        </Form>
      );
    }

    case 'satisfaction':
      return (
        <Form layout="vertical">
          <Form.Item label="Prompt text">
            <TextArea rows={2} value={data.text} onChange={(e) => onChange({ text: e.target.value })} placeholder="How would you rate this? Reply 1-5." />
          </Form.Item>
          <Form.Item label="Store rating as variable">
            <Input value={data.variableName} onChange={(e) => onChange({ variableName: e.target.value })} placeholder="satisfaction" />
          </Form.Item>
        </Form>
      );

    case 'handoff':
      return (
        <Form layout="vertical">
          <Form.Item label="Message to send before handoff (optional)">
            <TextArea rows={3} value={data.text} onChange={(e) => onChange({ text: e.target.value })} />
          </Form.Item>
        </Form>
      );

    case 'platform_specialty_list':
      return (
        <Text type="secondary">
          Automatically lists every specialty with an approved, available doctor — pulled live from the doctors table.
          No configuration needed. Stores the choice as the <code>specialty</code> flow variable.
        </Text>
      );

    case 'platform_doctor_list':
      return (
        <Text type="secondary">
          Lists doctors for the <code>specialty</code> variable (set by a Specialty List node earlier in the flow),
          with live fee and experience. Stores the choice as <code>doctorProfileId</code> / <code>doctorName</code>.
        </Text>
      );

    case 'platform_slot_list':
      return (
        <Text type="secondary">
          Looks up real upcoming availability for the <code>doctorProfileId</code> variable (next 14 days, same
          slot-generation logic as the app). Stores the choice as <code>scheduledAtIso</code> / <code>slotLabel</code>.
        </Text>
      );

    case 'platform_consultation_type':
      return (
        <Text type="secondary">
          Asks Video Call vs In-Person Visit. Stores the choice as the <code>consultationType</code> flow variable.
        </Text>
      );

    case 'platform_payment_method':
      return (
        <Text type="secondary">
          Asks Pay Online vs Pay Offline. Stores the choice as the <code>payOnline</code> flow variable — read by
          the Create Booking node to decide whether to send a payment link.
        </Text>
      );

    case 'platform_create_booking':
      return (
        <Text type="secondary">
          Creates a real booking using <code>doctorProfileId</code>, <code>scheduledAtIso</code>,{' '}
          <code>consultationType</code>, and <code>payOnline</code> from earlier nodes — same booking logic the app
          itself uses, including the WhatsApp payment link when paying online. Place a Specialty List → Doctor List
          → Slot List → Consultation Type → Payment Method chain before this node.
          <br /><br />
          If the patient already has an active booking with this doctor, it offers to cancel/reschedule that one
          instead of a dead-end error — wire an outgoing edge with source handle <code>conflict</code> to a
          Manage Booking node to enable this (falls back to a plain error message if not wired).
        </Text>
      );

    case 'platform_order_status':
      return (
        <Text type="secondary">
          Looks up the patient&apos;s latest medicine order and booking status and replies with it — same data as
          the hardcoded bot&apos;s status check.
        </Text>
      );

    case 'platform_manage_booking':
      return (
        <Text type="secondary">
          If the patient has an upcoming (not cancelled/completed) booking, offers to cancel or reschedule it —
          reuses the same <code>cancelBooking</code> logic (and its &quot;not within 2 hours of the appointment&quot;
          rule) the app&apos;s own booking screen uses. No configuration needed. Wire up to 3 outgoing edges by
          source handle: <code>cancel</code>, <code>reschedule</code> (chain into a Slot List node for the same
          doctor), and <code>keep</code> (used as the fallback for everything else too — no upcoming booking,
          declined, etc.).
        </Text>
      );

    case 'upload_prescription':
      return (
        <Text type="secondary">
          No configuration needed. Asks for a prescription photo (works over WhatsApp or the app&apos;s upload
          screen) and creates a real prescription request. Stores it as <code>requestId</code>.
        </Text>
      );

    case 'await_shop_quotes':
      return (
        <Text type="secondary">
          No configuration needed. Re-checks <code>requestId</code>&apos;s status every turn until a pharmacy quote
          is ready to show — safe to leave the patient parked here indefinitely.
        </Text>
      );

    case 'select_quote':
      return (
        <Text type="secondary">
          No configuration needed. Lists every submitted quote for <code>requestId</code> and lets the patient pick
          one (by number over WhatsApp, or by tapping in the app). Marks every other shop&apos;s quote as not
          selected and notifies them. Stores the choice as <code>chosenQuoteId</code>.
        </Text>
      );

    case 'order_payment':
      return (
        <Text type="secondary">
          No configuration needed. Asks for a delivery address, creates the real order from{' '}
          <code>chosenQuoteId</code>, and sends a Stripe payment link. Stores the result as <code>orderId</code>.
        </Text>
      );

    case 'track_delivery':
      return (
        <Text type="secondary">
          No configuration needed. Shows <code>orderId</code>&apos;s live delivery status and keeps re-checking
          until it&apos;s delivered.
        </Text>
      );

    default:
      return null;
  }
}
