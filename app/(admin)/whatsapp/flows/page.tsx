'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Popconfirm, message, Modal, Drawer, Input, Breadcrumb, Card, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, StopOutlined, ApartmentOutlined,
  ThunderboltOutlined, AppstoreOutlined, ArrowRightOutlined, EyeOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiCall } from '../../../../lib/api';
import { FLOW_TEMPLATES } from './flow-templates';
import { nodeTypes, defaultEdgeOptions, definitionToReactFlow } from './flow-node-meta';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface WhatsAppFlow {
  id: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
}

export default function WhatsAppFlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genName, setGenName] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateBusyKey, setTemplateBusyKey] = useState<string | null>(null);
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/whatsapp/flows');
      setFlows(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load flows');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const createFlow = async () => {
    if (!newName.trim()) return;
    try {
      const result = await apiCall('POST', '/api/admin/whatsapp/flows', { name: newName.trim() });
      const flow = result.data ?? result;
      setCreating(false);
      setNewName('');
      router.push(`/whatsapp/flows/${flow.id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create flow');
      else message.error('An unexpected error occurred');
    }
  };

  const applyTemplate = async (templateKey: string) => {
    const template = FLOW_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setTemplateBusyKey(templateKey);
    try {
      const result = await apiCall('POST', '/api/admin/whatsapp/flows', {
        name: template.name,
        definition: template.definition,
      });
      const flow = result.data ?? result;
      message.success('Flow created from template — review it before activating');
      setTemplatesOpen(false);
      router.push(`/whatsapp/flows/${flow.id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create flow from template');
      else message.error('An unexpected error occurred');
    } finally { setTemplateBusyKey(null); }
  };

  const generateFlow = async () => {
    if (!genName.trim() || !genPrompt.trim()) return;
    setGenLoading(true);
    try {
      const result = await apiCall('POST', '/api/admin/whatsapp/flows/generate', {
        name: genName.trim(),
        prompt: genPrompt.trim(),
      });
      const flow = result.data ?? result;
      message.success('Flow generated — review it before activating');
      setGenerating(false);
      setGenName('');
      setGenPrompt('');
      router.push(`/whatsapp/flows/${flow.id}`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to generate flow');
      else message.error('An unexpected error occurred');
    } finally { setGenLoading(false); }
  };

  const toggleActive = async (flow: WhatsAppFlow) => {
    setBusyId(flow.id);
    try {
      await apiCall('POST', `/api/admin/whatsapp/flows/${flow.id}/${flow.isActive ? 'deactivate' : 'activate'}`);
      message.success(flow.isActive ? 'Flow deactivated' : 'Flow activated — it now handles all incoming WhatsApp messages');
      fetchFlows();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update flow');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const deleteFlow = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/admin/whatsapp/flows/${id}`);
      message.success('Flow deleted');
      fetchFlows();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete flow');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, f: WhatsAppFlow) => (
        f.isActive
          ? <Tag icon={<CheckCircleOutlined />} color="green">Active</Tag>
          : <Tag color="default">Inactive</Tag>
      ),
    },
    {
      title: 'Last Updated', dataIndex: 'updatedAt', key: 'updatedAt',
      render: (v: string) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, f: WhatsAppFlow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => router.push(`/whatsapp/flows/${f.id}`)}>Edit</Button>
          <Button
            size="small"
            icon={f.isActive ? <StopOutlined /> : <CheckCircleOutlined />}
            loading={busyId === f.id}
            onClick={() => toggleActive(f)}
          >
            {f.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Popconfirm title="Delete this flow?" onConfirm={() => deleteFlow(f.id)} okText="Delete" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === f.id}>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        style={{ marginBottom: 12 }}
        items={[
          { title: <a onClick={() => router.push('/whatsapp')}>WhatsApp</a> },
          { title: 'Flows' },
        ]}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ApartmentOutlined style={{ marginRight: 8 }} />Conversation Flows
        </Title>
        <Space wrap>
          <Button icon={<AppstoreOutlined />} onClick={() => setTemplatesOpen(true)}>Templates</Button>
          <Button icon={<ThunderboltOutlined />} onClick={() => setGenerating(true)}>Generate with AI</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>New Flow</Button>
        </Space>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {flows.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No flows yet"
          description="Create a flow to build a custom conversation tree. Only one flow can be active at a time — while active, it fully replaces the default menu bot for all incoming WhatsApp messages."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          columns={columns}
          dataSource={flows.map((f) => ({ ...f, key: f.id }))}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}

      <Modal
        title="New Flow"
        open={creating}
        onCancel={() => setCreating(false)}
        onOk={createFlow}
        okText="Create & Edit"
        okButtonProps={{ disabled: !newName.trim() }}
      >
        <Input
          placeholder="Flow name (e.g. Support Menu)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onPressEnter={createFlow}
          autoFocus
        />
      </Modal>

      <Modal
        title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />Generate Flow with AI</span>}
        open={generating}
        onCancel={() => setGenerating(false)}
        onOk={generateFlow}
        okText="Generate"
        confirmLoading={genLoading}
        okButtonProps={{ disabled: !genName.trim() || !genPrompt.trim() }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ fontSize: 13 }}>Flow name</Text>
            <Input
              placeholder="e.g. Book a Doctor"
              value={genName}
              onChange={(e) => setGenName(e.target.value)}
              style={{ marginTop: 4 }}
              autoFocus
            />
          </div>
          <div>
            <Text strong style={{ fontSize: 13 }}>Describe what it should do</Text>
            <TextArea
              rows={5}
              placeholder='e.g. "Greet the user, ask which specialty they need, then walk them through picking a doctor, a slot, video or in-person, and online or offline payment, then confirm the booking."'
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              style={{ marginTop: 4 }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            The AI builds the node/edge graph for you — it lands in the editor afterward so you can review, tweak, or
            connect anything before activating it.
          </Text>
        </Space>
      </Modal>

      <Drawer
        title={
          viewingKey ? (
            <Space>
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => setViewingKey(null)} />
              {FLOW_TEMPLATES.find((t) => t.key === viewingKey)?.name}
            </Space>
          ) : (
            <span><AppstoreOutlined style={{ marginRight: 8 }} />Flow Templates</span>
          )
        }
        open={templatesOpen}
        onClose={() => { setTemplatesOpen(false); setViewingKey(null); }}
        width={viewingKey ? 820 : 640}
        styles={{ body: { padding: viewingKey ? 0 : 24, display: 'flex', flexDirection: 'column' } }}
      >
        {viewingKey ? (
          (() => {
            const template = FLOW_TEMPLATES.find((t) => t.key === viewingKey);
            if (!template) return null;
            const { nodes, edges } = definitionToReactFlow(template.definition);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{template.description}</Text>
                </div>
                <div style={{ flex: 1, minHeight: 400 }}>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    defaultEdgeOptions={defaultEdgeOptions}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    panOnScroll
                    fitView
                  >
                    <Background />
                    <Controls showInteractive={false} />
                  </ReactFlow>
                </div>
                <div style={{ padding: 16, borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                  <Button
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    loading={templateBusyKey === template.key}
                    onClick={() => applyTemplate(template.key)}
                  >
                    Use this template
                  </Button>
                </div>
              </div>
            );
          })()
        ) : (
          <>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Start from a ready-to-use conversation instead of a blank canvas — every node here is real,
              already-working business logic (booking, prescriptions, AI, human handoff). View a template&apos;s flow
              before committing, or drop it straight into the editor to review, tweak, or rewire before activating it.
            </Text>
            <Row gutter={[16, 16]}>
              {FLOW_TEMPLATES.map((t) => (
                <Col span={24} key={t.key}>
                  <Card size="small" title={t.name}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t.description}</Text>
                    <div style={{ marginTop: 12, textAlign: 'right' }}>
                      <Space>
                        <Button size="small" icon={<EyeOutlined />} onClick={() => setViewingKey(t.key)}>
                          View
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          icon={<ArrowRightOutlined />}
                          loading={templateBusyKey === t.key}
                          onClick={() => applyTemplate(t.key)}
                        >
                          Use this template
                        </Button>
                      </Space>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Drawer>
    </div>
  );
}
