'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Popconfirm, message, Drawer, Modal, Form, Input,
  InputNumber, Select, DatePicker, List, Empty, Steps, Tooltip,
} from 'antd';
import {
  PlusOutlined, ShoppingCartOutlined, TeamOutlined, DeleteOutlined, SendOutlined, CheckCircleOutlined,
  StopOutlined, ThunderboltOutlined, WhatsAppOutlined, EditOutlined, EyeOutlined, BulbOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface SupplierRow {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive: boolean;
}

interface CatalogItemOption {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold?: number | null;
}

interface PurchaseOrderLineItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  batchNumber?: string;
  expiryDate?: string;
}

interface PurchaseOrderRow {
  id: string;
  supplierId?: string;
  status: 'draft' | 'sent' | 'received' | 'cancelled';
  items: PurchaseOrderLineItem[];
  note?: string;
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
}

interface PoFormItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  batchNumber?: string;
  expiryDate?: Dayjs;
}

interface PoFormValues {
  supplierId?: string;
  note?: string;
  items: PoFormItem[];
}

const STATUS_COLORS: Record<PurchaseOrderRow['status'], string> = {
  draft: 'default',
  sent: 'blue',
  received: 'green',
  cancelled: 'red',
};

function suggestReorderQuantity(item: CatalogItemOption): number {
  const target = item.lowStockThreshold != null ? item.lowStockThreshold * 2 : item.quantity + 10;
  return Math.max(target - item.quantity, 1);
}

interface RestockSuggestion {
  medicineName: string;
  currentQuantity: number;
  recentDailyRunRate: number;
  daysOfStockLeft: number | null;
  suggestedReorderQuantity: number;
  basis: 'own-recent-sales' | 'city-pooled' | 'seasonal-last-year';
  confidence: 'low' | 'medium' | 'high';
}

const BASIS_LABELS: Record<RestockSuggestion['basis'], string> = {
  'own-recent-sales': 'Based on your recent sales',
  'city-pooled': "Based on other shops in your city (you don't have enough sales data yet)",
  'seasonal-last-year': 'Seasonal — sold notably more around this time last year',
};

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItemOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<PoFormValues>();

  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderRow | null>(null);

  const [suppliersOpen, setSuppliersOpen] = useState(false);
  const [supplierForm] = Form.useForm<{ name: string; phone?: string; email?: string; notes?: string }>();
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierBusyId, setSupplierBusyId] = useState<string | null>(null);

  const [shareLink, setShareLink] = useState<string | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResult, suppliersResult, catalogResult] = await Promise.all([
        apiCall('GET', '/api/shop/purchase-orders'),
        apiCall('GET', '/api/shop/suppliers'),
        apiCall('GET', '/api/shop/catalog'),
      ]);
      setOrders(ordersResult.data ?? ordersResult);
      setSuppliers(suppliersResult.data ?? suppliersResult);
      setCatalogItems(catalogResult.data ?? catalogResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load purchase orders');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingOrder(null);
    form.resetFields();
    form.setFieldsValue({ items: [] });
    setDrawerOpen(true);
  };

  // Only ever reachable for a draft (see the Edit button's visibility
  // below) — the backend also enforces this, since a sent/received order
  // has already been communicated to the supplier and shouldn't silently
  // change afterward.
  const openEditOrder = (order: PurchaseOrderRow) => {
    setEditingOrder(order);
    form.setFieldsValue({
      supplierId: order.supplierId,
      note: order.note,
      items: order.items.map((i) => ({
        catalogItemId: i.catalogItemId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate ? dayjs(i.expiryDate) : undefined,
      })),
    });
    setDrawerOpen(true);
  };

  const openDetails = (order: PurchaseOrderRow) => setViewingOrder(order);

  // One-click starting point: every catalog item currently at/below its
  // low-stock threshold, pre-filled with the same reorder-quantity formula
  // the daily WhatsApp alert uses (see medicine-shop-alerts.service.ts) —
  // so a shop can go straight from "got the alert" to "sent the PO."
  const prefillLowStock = () => {
    const lowStockItems = catalogItems.filter(
      (i) => i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold,
    );
    if (lowStockItems.length === 0) {
      message.info('Nothing is currently below its low-stock threshold');
      return;
    }
    form.setFieldsValue({
      items: lowStockItems.map((i) => ({
        catalogItemId: i.id,
        name: i.name,
        unit: i.unit,
        quantity: suggestReorderQuantity(i),
      })),
    });
  };

  // Splits every low-stock item into one draft PO per supplier
  // automatically (grouped server-side by each medicine's Preferred
  // Supplier, set on the Medicine List page) — for when your shortages
  // span more than one supplier and you don't want to sort that out by
  // hand every time. Items with no supplier tagged land in one shared
  // "no supplier" draft instead of being skipped.
  const autoCreateFromLowStock = async () => {
    setAutoCreating(true);
    try {
      const result = await apiCall('POST', '/api/shop/purchase-orders/auto-create-from-low-stock');
      const created = (result.data ?? result) as PurchaseOrderRow[];
      if (created.length === 0) {
        message.info('Nothing is currently below its low-stock threshold');
      } else {
        message.success(`${created.length} draft purchase order${created.length > 1 ? 's' : ''} created, split by supplier`);
      }
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to auto-create purchase orders');
      else message.error('An unexpected error occurred');
    } finally { setAutoCreating(false); }
  };

  // Statistics-based restock suggestions (see demand-prediction.util.ts) —
  // real math over this shop's own Billing sales history (falling back to
  // other shops in the same city when this shop's own history is too thin
  // to trust), NOT a threshold-based low-stock check like the button
  // above. Deliberately separate from "Auto-Create from Low Stock" since
  // it can flag something before it's even hit its low-stock threshold.
  const openSuggestions = async () => {
    setSuggestionsOpen(true);
    setSuggestionsLoading(true);
    try {
      const result = await apiCall('GET', '/api/shop/restock-suggestions');
      setSuggestions(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load suggestions');
    } finally { setSuggestionsLoading(false); }
  };

  const createOrderFromSuggestion = (suggestion: RestockSuggestion) => {
    const catalogItem = catalogItems.find((c) => c.name === suggestion.medicineName);
    setSuggestionsOpen(false);
    setEditingOrder(null);
    form.resetFields();
    form.setFieldsValue({
      items: [{
        catalogItemId: catalogItem?.id,
        name: suggestion.medicineName,
        unit: catalogItem?.unit ?? 'unit',
        quantity: suggestion.suggestedReorderQuantity,
      }],
    });
    setDrawerOpen(true);
  };

  const saveOrder = async (values: PoFormValues) => {
    setSaving(true);
    const payload = {
      supplierId: values.supplierId || undefined,
      note: values.note?.trim() || undefined,
      items: values.items.map((i) => ({
        catalogItemId: i.catalogItemId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        batchNumber: i.batchNumber?.trim() || undefined,
        expiryDate: i.expiryDate ? i.expiryDate.format('YYYY-MM-DD') : undefined,
      })),
    };
    try {
      if (editingOrder) {
        await apiCall('PATCH', `/api/shop/purchase-orders/${editingOrder.id}`, payload);
        message.success('Purchase order updated');
      } else {
        await apiCall('POST', '/api/shop/purchase-orders', payload);
        message.success('Purchase order created');
      }
      setDrawerOpen(false);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save purchase order');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  // Opens the wa.me deep link (if the supplier has a phone number) so the
  // shop owner can tap send from their OWN WhatsApp — see
  // purchase-order.util.ts for why this doesn't go through the platform's
  // WhatsApp Business API. The blank window is opened synchronously,
  // BEFORE the async API call, so browsers don't treat the later
  // navigation as an unrequested popup.
  const sendOrder = async (order: PurchaseOrderRow) => {
    const win = window.open('', '_blank');
    setBusyId(order.id);
    try {
      const result = await apiCall('PATCH', `/api/shop/purchase-orders/${order.id}/send`);
      const { whatsappShareLink } = (result.data ?? result) as { whatsappShareLink?: string };
      if (whatsappShareLink && win) {
        // Popup was allowed to open — navigate it straight to WhatsApp.
        win.location.href = whatsappShareLink;
      } else if (whatsappShareLink) {
        // Browser blocked the popup — fall back to a manual link in a modal.
        win?.close();
        setShareLink(whatsappShareLink);
      } else {
        win?.close();
        message.success('Marked sent — this supplier has no phone number on file to share via WhatsApp');
      }
      fetchAll();
    } catch (err: unknown) {
      win?.close();
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to send purchase order');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const receiveOrder = async (order: PurchaseOrderRow) => {
    setBusyId(order.id);
    try {
      await apiCall('PATCH', `/api/shop/purchase-orders/${order.id}/receive`);
      message.success('Purchase order received — stock updated');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to mark received');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const cancelOrder = async (order: PurchaseOrderRow) => {
    setBusyId(order.id);
    try {
      await apiCall('PATCH', `/api/shop/purchase-orders/${order.id}/cancel`);
      message.success('Purchase order cancelled');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to cancel');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const deleteOrder = async (order: PurchaseOrderRow) => {
    setBusyId(order.id);
    try {
      await apiCall('DELETE', `/api/shop/purchase-orders/${order.id}`);
      message.success('Purchase order deleted');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name;

  // ── Suppliers ───────────────────────────────────────────────────────
  const openSuppliers = () => { supplierForm.resetFields(); setSuppliersOpen(true); };

  const addSupplier = async (values: { name: string; phone?: string; email?: string; notes?: string }) => {
    setSupplierSaving(true);
    try {
      await apiCall('POST', '/api/shop/suppliers', values);
      message.success('Supplier added');
      supplierForm.resetFields();
      const result = await apiCall('GET', '/api/shop/suppliers');
      setSuppliers(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add supplier');
      else message.error('An unexpected error occurred');
    } finally { setSupplierSaving(false); }
  };

  const removeSupplier = async (id: string) => {
    setSupplierBusyId(id);
    try {
      await apiCall('DELETE', `/api/shop/suppliers/${id}`);
      message.success('Supplier removed');
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to remove supplier');
      else message.error('An unexpected error occurred');
    } finally { setSupplierBusyId(null); }
  };

  const columns = [
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => dayjs(v).format('DD MMM YYYY'),
    },
    {
      title: 'Supplier', key: 'supplier',
      render: (_: unknown, po: PurchaseOrderRow) => supplierName(po.supplierId) || <Text type="secondary">—</Text>,
    },
    {
      title: 'Items', key: 'items',
      render: (_: unknown, po: PurchaseOrderRow) => (
        <Text style={{ fontSize: 12 }}>
          {po.items.slice(0, 2).map((i) => i.name).join(', ')}
          {po.items.length > 2 ? ` +${po.items.length - 2} more` : ''}
        </Text>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v: PurchaseOrderRow['status']) => <Tag color={STATUS_COLORS[v]}>{v.toUpperCase()}</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, po: PurchaseOrderRow) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => openDetails(po)}>View</Button>
          {po.status === 'draft' && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditOrder(po)}>Edit</Button>
              <Tooltip title={po.supplierId ? '' : 'Assign a supplier first (Edit this order to add one)'}>
                <Button
                  size="small"
                  type="primary"
                  icon={<SendOutlined />}
                  loading={busyId === po.id}
                  disabled={!po.supplierId}
                  onClick={() => void sendOrder(po)}
                >
                  Send
                </Button>
              </Tooltip>
            </>
          )}
          {po.status === 'sent' && (
            <>
              <Popconfirm title="Mark this order received? This will restock your catalog." onConfirm={() => receiveOrder(po)}>
                <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={busyId === po.id}>Receive</Button>
              </Popconfirm>
              <Popconfirm title="Cancel this purchase order?" onConfirm={() => cancelOrder(po)}>
                <Button size="small" danger icon={<StopOutlined />} loading={busyId === po.id}>Cancel</Button>
              </Popconfirm>
            </>
          )}
          <Popconfirm
            title={po.status === 'received'
              ? 'Delete this order? It was already received — deleting it will NOT undo the stock it already added.'
              : 'Delete this purchase order?'}
            onConfirm={() => deleteOrder(po)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === po.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: '0 0 12px' }}>
          <ShoppingCartOutlined style={{ marginRight: 8 }} />Purchase Orders
        </Title>
        <Space wrap>
          <Button icon={<TeamOutlined />} onClick={openSuppliers}>Manage Suppliers</Button>
          <Button icon={<ThunderboltOutlined />} loading={autoCreating} onClick={() => void autoCreateFromLowStock()}>
            Auto-Create from Low Stock
          </Button>
          <Button icon={<BulbOutlined />} onClick={() => void openSuggestions()}>Restock Suggestions</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Purchase Order</Button>
        </Space>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Restock from your own suppliers — start from your low-stock items, send the order over your own WhatsApp,
        and mark it received to update your catalog automatically. &quot;Auto-Create from Low Stock&quot; splits your
        shortages into one draft order per supplier automatically, based on the Preferred Supplier set on each
        medicine in your Medicine List. &quot;Restock Suggestions&quot; looks ahead using your own sales trends —
        it can flag something before it even hits its low-stock threshold.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {orders.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No purchase orders yet"
          description="Create one from your low-stock items, or add items manually."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={orders.map((o) => ({ ...o, key: o.id }))} bordered size="middle" scroll={{ x: true }} />
      )}

      <Drawer
        title={editingOrder ? 'Edit Purchase Order' : 'New Purchase Order'}
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size={520}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              {editingOrder ? 'Save Changes' : 'Create'}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button icon={<ThunderboltOutlined />} onClick={prefillLowStock} block>
            Prefill from Low Stock
          </Button>

          <Form form={form} layout="vertical" onFinish={saveOrder}>
            <Form.Item label="Supplier (optional)" name="supplierId">
              <Select
                allowClear
                placeholder="No specific supplier"
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Form.Item>
            <Form.Item label="Note (optional)" name="note">
              <Input.TextArea rows={2} placeholder="e.g. Deliver to back entrance" />
            </Form.Item>

            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Items</Text>
                  {fields.length === 0 && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                      No items yet — use &quot;Prefill from Low Stock&quot; or add one manually.
                    </Text>
                  )}
                  {fields.map(({ key, name, ...rest }) => (
                    <Space
                      key={key}
                      direction="vertical"
                      size={0}
                      style={{ display: 'flex', marginBottom: 8, padding: 8, border: '1px solid #d9d9d9', borderRadius: 6 }}
                    >
                      <Space align="baseline" wrap>
                        <Form.Item {...rest} name={[name, 'name']} rules={[{ required: true, message: 'Name required' }]} style={{ marginBottom: 4, width: 160 }}>
                          <Input placeholder="Medicine name" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'quantity']} rules={[{ required: true, message: 'Qty required' }]} style={{ marginBottom: 4, width: 80 }}>
                          <InputNumber min={1} placeholder="Qty" style={{ width: '100%' }} />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'unit']} initialValue="unit" style={{ marginBottom: 4, width: 80 }}>
                          <Input placeholder="Unit" />
                        </Form.Item>
                        <Button icon={<DeleteOutlined />} danger onClick={() => remove(name)} />
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Batch/expiry (optional) — used to record a batch automatically when this order is received
                      </Text>
                      <Space align="baseline" wrap>
                        <Form.Item {...rest} name={[name, 'batchNumber']} style={{ marginBottom: 0, width: 160 }}>
                          <Input placeholder="Batch number" size="small" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'expiryDate']} style={{ marginBottom: 0, width: 160 }}>
                          <DatePicker placeholder="Expiry date" size="small" style={{ width: '100%' }} format="DD MMM YYYY" />
                        </Form.Item>
                      </Space>
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ name: '', quantity: 1, unit: 'unit' })}
                    block
                    icon={<PlusOutlined />}
                  >
                    Add Item
                  </Button>
                </>
              )}
            </Form.List>
          </Form>
        </Space>
      </Drawer>

      <Drawer
        title={<span><TeamOutlined style={{ marginRight: 8, color: '#1677ff' }} />Suppliers</span>}
        placement="right"
        open={suppliersOpen}
        onClose={() => setSuppliersOpen(false)}
        size={420}
        destroyOnClose
      >
        <Form form={supplierForm} layout="vertical" onFinish={addSupplier} style={{ marginBottom: 16 }}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Sri Ram Distributors" />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item label="Phone" name="phone" style={{ width: '50%' }}>
              <Input placeholder="+91 98765 43210" />
            </Form.Item>
            <Form.Item label="Email (optional)" name="email" style={{ width: '50%' }}>
              <Input placeholder="orders@distributor.com" />
            </Form.Item>
          </Space.Compact>
          <Form.Item label="Notes (optional)" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={supplierSaving} block>Add Supplier</Button>
        </Form>

        {suppliers.length === 0 ? (
          <Empty description="No suppliers yet" />
        ) : (
          <List
            size="small"
            dataSource={suppliers}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Popconfirm key="remove" title="Remove this supplier?" onConfirm={() => removeSupplier(s.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} loading={supplierBusyId === s.id} />
                  </Popconfirm>,
                ]}
              >
                <Space direction="vertical" size={0}>
                  <Text strong>{s.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>{s.phone || 'No phone on file'}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      <Modal
        title="Purchase Order Sent"
        open={!!shareLink}
        onCancel={() => setShareLink(null)}
        footer={<Button type="primary" onClick={() => setShareLink(null)}>Done</Button>}
      >
        {shareLink && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>If the WhatsApp tab didn&apos;t open automatically, use the link below:</Text>
            <Button icon={<WhatsAppOutlined />} href={shareLink} target="_blank" block>Open WhatsApp</Button>
          </Space>
        )}
      </Modal>

      <Drawer
        title="Purchase Order Details"
        placement="right"
        open={!!viewingOrder}
        onClose={() => setViewingOrder(null)}
        size={480}
      >
        {viewingOrder && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Steps
              size="small"
              current={
                viewingOrder.status === 'draft' ? 0
                  : viewingOrder.status === 'received' ? 2
                  : 1
              }
              status={viewingOrder.status === 'cancelled' ? 'error' : undefined}
              items={[
                { title: 'Created', description: dayjs(viewingOrder.createdAt).format('DD MMM, h:mm A') },
                {
                  title: viewingOrder.status === 'cancelled' ? 'Cancelled' : 'Sent',
                  description: viewingOrder.sentAt ? dayjs(viewingOrder.sentAt).format('DD MMM, h:mm A') : 'Not yet sent',
                },
                {
                  title: 'Received',
                  description: viewingOrder.receivedAt ? dayjs(viewingOrder.receivedAt).format('DD MMM, h:mm A') : 'Not yet received',
                },
              ]}
            />

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Status</Text>
              <div><Tag color={STATUS_COLORS[viewingOrder.status]}>{viewingOrder.status.toUpperCase()}</Tag></div>
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Supplier</Text>
              <div>
                {supplierName(viewingOrder.supplierId) || <Text type="secondary">No supplier assigned</Text>}
                {viewingOrder.supplierId && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {suppliers.find((s) => s.id === viewingOrder.supplierId)?.phone || 'No phone on file'}
                  </Text>
                )}
              </div>
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>Items</Text>
              <List
                size="small"
                bordered
                dataSource={viewingOrder.items}
                renderItem={(i) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text strong>{i.name}</Text>
                        <Text>{i.quantity} {i.unit}</Text>
                      </div>
                      {(i.batchNumber || i.expiryDate) && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {i.batchNumber ? `Batch ${i.batchNumber}` : ''}{i.batchNumber && i.expiryDate ? ' · ' : ''}
                          {i.expiryDate ? `Expires ${dayjs(i.expiryDate).format('DD MMM YYYY')}` : ''}
                        </Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            </div>

            {viewingOrder.note && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Note</Text>
                <div><Text>{viewingOrder.note}</Text></div>
              </div>
            )}
          </Space>
        )}
      </Drawer>

      <Drawer
        title={<span><BulbOutlined style={{ marginRight: 8, color: '#faad14' }} />Restock Suggestions</span>}
        placement="right"
        open={suggestionsOpen}
        onClose={() => setSuggestionsOpen(false)}
        size={480}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Computed from your own Billing sales history — a new medicine or a shop that hasn&apos;t used Billing
          much yet will show fewer (or no) suggestions until more sales data builds up.
        </Text>
        {suggestionsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : suggestions.length === 0 ? (
          <Empty description="No restock suggestions right now — either everything's well stocked, or there isn't enough sales history yet" />
        ) : (
          <List
            dataSource={suggestions}
            renderItem={(s) => (
              <List.Item
                actions={[
                  <Button key="create" size="small" type="primary" onClick={() => createOrderFromSuggestion(s)}>
                    Create PO
                  </Button>,
                ]}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong>{s.medicineName}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.currentQuantity} left · {s.daysOfStockLeft != null ? `~${s.daysOfStockLeft} days of stock left` : 'usage rate unknown'}
                    {' · suggest reordering '}{s.suggestedReorderQuantity}
                  </Text>
                  <Space size={4}>
                    <Tag color={s.confidence === 'high' ? 'green' : s.confidence === 'medium' ? 'blue' : 'default'}>
                      {s.confidence} confidence
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{BASIS_LABELS[s.basis]}</Text>
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </div>
  );
}
