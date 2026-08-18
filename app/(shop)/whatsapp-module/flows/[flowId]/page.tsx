'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow, Background, Controls, ControlButton, Panel, Handle, Position, MarkerType,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeProps, type DefaultEdgeOptions,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Button, Drawer, Form, Input, Select, Space, Typography, message, Spin, Breadcrumb, Popconfirm, Divider, Modal, theme,
} from 'antd';
import {
  PlayCircleOutlined, MessageOutlined, MenuOutlined, RobotOutlined, BranchesOutlined,
  ApiOutlined, StarOutlined, CustomerServiceOutlined, StopOutlined, SaveOutlined,
  PlusOutlined, DeleteOutlined, ThunderboltOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../../../lib/api';

const { Text } = Typography;
const { TextArea } = Input;

// No platform_* node types here — those pull live doctor/booking data
// that only makes sense for a tenant's patient-facing bot (see the
// tenant-side editor at app/(admin)/whatsapp/flows/[flowId]/page.tsx). A
// shop's own module only ever needs these generic building blocks.
type FlowNodeType =
  | 'start' | 'message' | 'buttons' | 'ai' | 'condition' | 'api_call' | 'satisfaction' | 'handoff' | 'end';

interface ButtonOption { id: string; label: string }
interface ResponseMapping { variablePath: string; jsonPath: string }

interface FlowNodeData extends Record<string, unknown> {
  nodeType: FlowNodeType;
  text?: string;
  options?: ButtonOption[];
  systemPrompt?: string;
  variablePath?: string;
  operator?: 'equals' | 'contains' | 'exists';
  value?: string;
  url?: string;
  method?: string;
  body?: string;
  responseMapping?: ResponseMapping[];
  variableName?: string;
}

const NODE_META: Record<FlowNodeType, { color: string; icon: React.ReactNode; label: string }> = {
  start: { color: '#52c41a', icon: <PlayCircleOutlined />, label: 'Start' },
  message: { color: '#1677ff', icon: <MessageOutlined />, label: 'Message' },
  buttons: { color: '#722ed1', icon: <MenuOutlined />, label: 'Buttons' },
  ai: { color: '#eb2f96', icon: <RobotOutlined />, label: 'AI Reply' },
  condition: { color: '#fa8c16', icon: <BranchesOutlined />, label: 'Condition' },
  api_call: { color: '#13c2c2', icon: <ApiOutlined />, label: 'API Call' },
  satisfaction: { color: '#fadb14', icon: <StarOutlined />, label: 'Satisfaction' },
  handoff: { color: '#f5222d', icon: <CustomerServiceOutlined />, label: 'Human Handoff' },
  end: { color: '#8c8c8c', icon: <StopOutlined />, label: 'End' },
};

interface PaletteGroup { title: string; subtitle?: string; types: FlowNodeType[] }

const PALETTE_GROUPS: PaletteGroup[] = [
  { title: 'Add Node', types: (Object.keys(NODE_META) as FlowNodeType[]).filter((t) => t !== 'start') },
];

// Animated + arrowed by default so a glance at the canvas shows conversation
// direction — applies to every edge (loaded or newly connected) since
// ReactFlow merges this under each edge's own fields at render time.
const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  style: { stroke: '#64748b', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 },
};

function summaryText(data: FlowNodeData): string {
  switch (data.nodeType) {
    case 'message': return data.text || '(empty message)';
    case 'buttons': return data.text || '(no prompt set)';
    case 'ai': return data.systemPrompt ? `"${data.systemPrompt.slice(0, 50)}..."` : '(no system prompt)';
    case 'condition': return data.variablePath ? `${data.variablePath} ${data.operator} ${data.value ?? ''}` : '(not configured)';
    case 'api_call': return data.url ? `${data.method || 'GET'} ${data.url}` : '(no URL set)';
    case 'satisfaction': return data.text || 'Rate 1-5';
    case 'handoff': return data.text || 'Hands off to a human agent';
    default: return '';
  }
}

function FlowNode({ data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;
  const meta = NODE_META[nodeData.nodeType] ?? NODE_META.message;
  const isStart = nodeData.nodeType === 'start';
  const isEnd = nodeData.nodeType === 'end';
  const isButtons = nodeData.nodeType === 'buttons';
  const isCondition = nodeData.nodeType === 'condition';
  const options = nodeData.options ?? [];

  return (
    <div
      style={{
        border: `2px solid ${meta.color}`, borderRadius: 8, background: '#fff', minWidth: 200,
        boxShadow: selected ? `0 0 0 3px ${meta.color}33` : '0 1px 4px rgba(0,0,0,0.1)',
      }}
    >
      {!isStart && <Handle type="target" position={Position.Top} />}
      <div style={{
        background: meta.color, color: '#fff', padding: '5px 10px', borderRadius: '6px 6px 0 0',
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      }}>
        {meta.icon}{meta.label}
      </div>
      <div style={{ padding: '8px 10px', fontSize: 12, color: '#555', maxWidth: 220, overflowWrap: 'break-word' }}>
        {summaryText(nodeData)}
      </div>

      {isButtons ? (
        <div>
          {options.length === 0 && (
            <div style={{ padding: '4px 10px', fontSize: 11, color: '#aaa' }}>No options yet</div>
          )}
          {options.map((o, i) => (
            <div key={o.id} style={{ position: 'relative', padding: '4px 10px', fontSize: 11, borderTop: '1px solid #f0f0f0' }}>
              {i + 1}) {o.label || '(untitled)'}
              <Handle type="source" position={Position.Right} id={o.id} style={{ top: '50%' }} />
            </div>
          ))}
        </div>
      ) : isCondition ? (
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 10px', fontSize: 11, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ position: 'relative' }}>True<Handle type="source" position={Position.Bottom} id="true" /></div>
          <div style={{ position: 'relative' }}>False<Handle type="source" position={Position.Bottom} id="false" /></div>
        </div>
      ) : !isEnd ? (
        <Handle type="source" position={Position.Bottom} />
      ) : null}
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode };

// A floating, collapsible dark card so it reads consistently against the
// canvas's own dark colorMode regardless of the shop portal's light/dark
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

// Deterministic stagger (not Math.random()) so newly-added nodes don't
// stack exactly on top of each other, without calling an impure function
// during render.
function nextNodePosition(): { x: number; y: number } {
  const step = idCounter % 6;
  return { x: 100 + step * 40, y: 100 + step * 30 };
}

export default function ShopFlowEditorPage() {
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
        const result = await apiCall('GET', `/api/shop/whatsapp-module/flows/${flowId}`);
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

  const save = async () => {
    setSaving(true);
    try {
      const definition = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.data.nodeType,
          position: n.position,
          data: (({ nodeType: _nt, ...rest }) => rest)(n.data),
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null })),
      };
      await apiCall('PATCH', `/api/shop/whatsapp-module/flows/${flowId}`, { name: flowName, definition });
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
      const result = await apiCall('POST', `/api/shop/whatsapp-module/flows/${flowId}/generate`, { prompt: aiPrompt.trim() });
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
          { title: <a onClick={() => router.push('/shop-whatsapp')}>WhatsApp</a> },
          { title: <a onClick={() => router.push('/whatsapp-module/flows')}>Flows</a> },
          { title: flowName },
        ]}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
        <Input
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          style={{ maxWidth: 320, width: '100%', flex: '1 1 200px', fontWeight: 600 }}
        />
        <Space wrap>
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
              side (ruling out bottom-left), and bottom-right can sit under
              a global floating action button on some pages. */}
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
              placeholder='e.g. "Add a step after the prescription photo that asks for the delivery address."'
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
      return <Text type="secondary">Ends the flow. With no active flow, the module simply won&apos;t respond until you activate one again.</Text>;

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
            <Input value={data.variablePath} onChange={(e) => onChange({ variablePath: e.target.value })} placeholder="e.g. hasPrescription" />
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

    default:
      return null;
  }
}
