// Shared between the flow editor ([flowId]/page.tsx) and the read-only
// template preview (flow-templates/page.tsx) — the same node rendering,
// colors, and labels so a template looks exactly like what you'd see
// after "Use this template" drops you into the real editor.
import React from 'react';
import { Handle, Position, type NodeProps, type DefaultEdgeOptions, MarkerType } from '@xyflow/react';
import {
  PlayCircleOutlined, MessageOutlined, MenuOutlined, RobotOutlined, BranchesOutlined,
  ApiOutlined, StarOutlined, CustomerServiceOutlined, StopOutlined,
  MedicineBoxOutlined, TeamOutlined, CalendarOutlined,
  VideoCameraOutlined, DollarOutlined, CheckCircleOutlined, FileSearchOutlined,
  UploadOutlined, ClockCircleOutlined, ShopOutlined,
  CreditCardOutlined, CarOutlined, ReloadOutlined,
} from '@ant-design/icons';

export type FlowNodeType =
  | 'start' | 'message' | 'buttons' | 'ai' | 'condition' | 'api_call' | 'satisfaction' | 'handoff' | 'end'
  | 'platform_specialty_list' | 'platform_doctor_list' | 'platform_slot_list'
  | 'platform_consultation_type' | 'platform_payment_method'
  | 'platform_create_booking' | 'platform_order_status' | 'platform_manage_booking'
  | 'upload_prescription' | 'await_shop_quotes' | 'select_quote'
  | 'order_payment' | 'track_delivery';

export const PLATFORM_NODE_TYPES: FlowNodeType[] = [
  'platform_specialty_list', 'platform_doctor_list', 'platform_slot_list',
  'platform_consultation_type', 'platform_payment_method',
  'platform_create_booking', 'platform_order_status', 'platform_manage_booking',
];

// Same channel-agnostic node types run this over WhatsApp or the mobile
// app — see whatsapp-flow-engine.service.ts's FlowSink abstraction.
export const PRESCRIPTION_NODE_TYPES: FlowNodeType[] = [
  'upload_prescription', 'await_shop_quotes', 'select_quote',
  'order_payment', 'track_delivery',
];

export interface ButtonOption { id: string; label: string }
export interface ResponseMapping { variablePath: string; jsonPath: string }

export interface FlowNodeData extends Record<string, unknown> {
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

export const NODE_META: Record<FlowNodeType, { color: string; icon: React.ReactNode; label: string }> = {
  start: { color: '#52c41a', icon: <PlayCircleOutlined />, label: 'Start' },
  message: { color: '#1677ff', icon: <MessageOutlined />, label: 'Message' },
  buttons: { color: '#722ed1', icon: <MenuOutlined />, label: 'Buttons' },
  ai: { color: '#eb2f96', icon: <RobotOutlined />, label: 'AI Reply' },
  condition: { color: '#fa8c16', icon: <BranchesOutlined />, label: 'Condition' },
  api_call: { color: '#13c2c2', icon: <ApiOutlined />, label: 'API Call' },
  satisfaction: { color: '#fadb14', icon: <StarOutlined />, label: 'Satisfaction' },
  handoff: { color: '#f5222d', icon: <CustomerServiceOutlined />, label: 'Human Handoff' },
  end: { color: '#8c8c8c', icon: <StopOutlined />, label: 'End' },
  platform_specialty_list: { color: '#0d9488', icon: <MedicineBoxOutlined />, label: 'Specialty List' },
  platform_doctor_list: { color: '#0d9488', icon: <TeamOutlined />, label: 'Doctor List' },
  platform_slot_list: { color: '#0d9488', icon: <CalendarOutlined />, label: 'Slot List' },
  platform_consultation_type: { color: '#0d9488', icon: <VideoCameraOutlined />, label: 'Consultation Type' },
  platform_payment_method: { color: '#0d9488', icon: <DollarOutlined />, label: 'Payment Method' },
  platform_create_booking: { color: '#0d9488', icon: <CheckCircleOutlined />, label: 'Create Booking' },
  platform_order_status: { color: '#0d9488', icon: <FileSearchOutlined />, label: 'Order Status' },
  platform_manage_booking: { color: '#0d9488', icon: <ReloadOutlined />, label: 'Manage Booking' },
  upload_prescription: { color: '#7c3aed', icon: <UploadOutlined />, label: 'Upload Prescription' },
  await_shop_quotes: { color: '#7c3aed', icon: <ClockCircleOutlined />, label: 'Await Quotes' },
  select_quote: { color: '#7c3aed', icon: <ShopOutlined />, label: 'Select Quote' },
  order_payment: { color: '#7c3aed', icon: <CreditCardOutlined />, label: 'Order Payment' },
  track_delivery: { color: '#7c3aed', icon: <CarOutlined />, label: 'Track Delivery' },
};

// Every other node type, grouped separately from the two curated palette
// sections so it doesn't just dump 20 buttons in one wall.
export const GENERIC_NODE_TYPES = (Object.keys(NODE_META) as FlowNodeType[])
  .filter((t) => t !== 'start' && !PLATFORM_NODE_TYPES.includes(t) && !PRESCRIPTION_NODE_TYPES.includes(t));

export function summaryText(data: FlowNodeData): string {
  switch (data.nodeType) {
    case 'message': return data.text || '(empty message)';
    case 'buttons': return data.text || '(no prompt set)';
    case 'ai': return data.systemPrompt ? `"${data.systemPrompt.slice(0, 50)}..."` : '(no system prompt)';
    case 'condition': return data.variablePath ? `${data.variablePath} ${data.operator} ${data.value ?? ''}` : '(not configured)';
    case 'api_call': return data.url ? `${data.method || 'GET'} ${data.url}` : '(no URL set)';
    case 'satisfaction': return data.text || 'Rate 1-5';
    case 'handoff': return data.text || 'Hands off to a human agent';
    case 'platform_specialty_list': return 'Live list of specialties with available doctors';
    case 'platform_doctor_list': return 'Live doctors for the chosen specialty';
    case 'platform_slot_list': return 'Live upcoming availability for the chosen doctor';
    case 'platform_consultation_type': return 'Asks Video Call vs In-Person Visit';
    case 'platform_payment_method': return 'Asks Pay Online vs Pay Offline';
    case 'platform_create_booking': return 'Creates the real booking (+ payment link if online)';
    case 'platform_order_status': return "Looks up the patient's latest order/booking";
    case 'platform_manage_booking': return "Offers to cancel/reschedule the patient's upcoming booking (2hr cutoff)";
    case 'upload_prescription': return 'Asks for a prescription photo and creates the request';
    case 'await_shop_quotes': return 'Waits until a pharmacy quote is ready';
    case 'select_quote': return 'Shows quotes and lets the patient pick one';
    case 'order_payment': return 'Collects delivery address, creates the order, sends a payment link';
    case 'track_delivery': return "Shows the order's live delivery status";
    default: return '';
  }
}

export function FlowNode({ data, selected }: NodeProps) {
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

export const nodeTypes = { flowNode: FlowNode };

// Animated + arrowed by default so a glance at the canvas shows conversation
// direction — applies to every edge (loaded or newly connected) since
// ReactFlow merges this under each edge's own fields at render time.
export const defaultEdgeOptions: DefaultEdgeOptions = {
  animated: true,
  style: { stroke: '#64748b', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 18, height: 18 },
};

/// Converts a plain {id, type, position, data} + {id, source, target,
/// sourceHandle} definition (the backend's WhatsAppFlowDefinition shape,
/// same as a template's) into the ReactFlow node/edge shape the canvas
/// actually renders — same transform the editor's applyFlow() does when
/// loading a saved flow.
export function definitionToReactFlow(definition: { nodes: unknown[]; edges: unknown[] }) {
  const nodes = (definition.nodes as { id: string; type: FlowNodeType; position: { x: number; y: number }; data: Record<string, unknown> }[])
    .map((n) => ({ id: n.id, type: 'flowNode', position: n.position, data: { ...n.data, nodeType: n.type } }));
  const edges = (definition.edges as { id: string; source: string; target: string; sourceHandle?: string | null }[])
    .map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? undefined }));
  return { nodes, edges };
}
