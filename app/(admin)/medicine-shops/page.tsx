'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Popconfirm, message, Modal, Drawer, Input, InputNumber, Form, theme, Switch, Upload, Radio, List,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ShopOutlined, UserAddOutlined,
  PhoneOutlined, MailOutlined, EnvironmentOutlined, LockOutlined, CheckCircleFilled, CopyOutlined, UserOutlined,
  MedicineBoxOutlined, UploadOutlined, DownloadOutlined, HistoryOutlined, ExportOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { apiCall, api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { downloadFile } from '../../../lib/downloadFile';

const { Title, Text } = Typography;

type OwnershipType = 'in_house' | 'third_party';

interface MedicineShopRow {
  id: string;
  name: string;
  contactPhone: string;
  contactEmail?: string;
  addressLine1?: string;
  city?: string;
  isActive: boolean;
  whatsappLinked: boolean;
  ownershipType: OwnershipType;
  updatedAt: string;
}

interface StockMovementRow {
  id: string;
  itemName: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  note?: string | null;
  createdAt: string;
}

interface CatalogItemRow {
  id: string;
  name: string;
  priceCents: number;
  isActive: boolean;
  quantity: number;
  unit: string;
  rackLocation?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
}

interface BulkUploadResult {
  createdCount: number;
  updatedCount: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
}

export default function MedicineShopsPage() {
  const [shops, setShops] = useState<MedicineShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { token } = theme.useToken();

  const [editing, setEditing] = useState<MedicineShopRow | null>(null);
  const [isCreate, setIsCreate] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [invitingShop, setInvitingShop] = useState<MedicineShopRow | null>(null);
  const [inviteForm] = Form.useForm();
  const [inviteSaving, setInviteSaving] = useState(false);
  const [provisioned, setProvisioned] = useState<{ email: string; inviteLink?: string } | null>(null);

  const [catalogShop, setCatalogShop] = useState<MedicineShopRow | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItemRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogBusyId, setCatalogBusyId] = useState<string | null>(null);
  const [newMedName, setNewMedName] = useState('');
  const [newMedPrice, setNewMedPrice] = useState<number | null>(null);
  const [catalogSaving, setCatalogSaving] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<StockMovementRow[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/admin/medicine-shops');
      setShops(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load medicine shops');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setIsCreate(true);
    setEditing(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (shop: MedicineShopRow) => {
    setIsCreate(false);
    setEditing(shop);
    form.setFieldsValue(shop);
    setDrawerOpen(true);
  };

  const closeDrawer = () => { setDrawerOpen(false); setIsCreate(false); setEditing(null); };

  const save = async (values: {
    name: string; contactPhone: string; contactEmail?: string; addressLine1?: string; city?: string; isActive?: boolean;
  }) => {
    setSaving(true);
    try {
      if (isCreate) {
        await apiCall('POST', '/api/admin/medicine-shops', values);
        message.success('Medicine shop onboarded');
      } else if (editing) {
        await apiCall('PATCH', `/api/admin/medicine-shops/${editing.id}`, values);
        message.success('Medicine shop updated');
      }
      closeDrawer();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save medicine shop');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const deleteShop = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/admin/medicine-shops/${id}`);
      message.success('Medicine shop removed');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to remove medicine shop');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const openInvite = (shop: MedicineShopRow) => {
    setInvitingShop(shop);
    inviteForm.resetFields();
  };

  const inviteShopUser = async (values: { email: string; fullName: string; password?: string }) => {
    if (!invitingShop) return;
    setInviteSaving(true);
    try {
      const result = await apiCall('POST', `/api/admin/medicine-shops/${invitingShop.id}/invite`, values);
      const { user, inviteLink } = result.data ?? result;
      setInvitingShop(null);
      setProvisioned({ email: user.email, inviteLink });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create shop login');
      else message.error('An unexpected error occurred');
    } finally { setInviteSaving(false); }
  };

  const copyInviteLink = () => {
    if (!provisioned?.inviteLink) return;
    navigator.clipboard.writeText(provisioned.inviteLink);
    message.success('Invite link copied');
  };

  // Opens the shop's own full portal (dashboard, requests, full inventory
  // tools — everything the Catalog drawer above only shows a slice of) in
  // a brand new tab, without disturbing this admin session. The new tab
  // gets its own session in sessionStorage (see lib/session.ts) rather
  // than localStorage, which is shared across every tab of this origin —
  // writing there would silently swap out this tab's admin session too.
  const openFullView = async (shop: MedicineShopRow) => {
    // Opened synchronously, before the async call below, so browsers
    // (Safari especially) don't treat it as an unrequested pop-up.
    const win = window.open('', '_blank');
    try {
      const result = await apiCall('POST', `/api/admin/medicine-shops/${shop.id}/impersonate`);
      const { user, accessToken, refreshToken } = result.data ?? result;
      const params = new URLSearchParams({ qvt: accessToken, qvr: refreshToken, qvu: JSON.stringify(user) });
      if (win) win.location.href = `${window.location.origin}/shop-dashboard?${params.toString()}`;
      else message.warning('Please allow pop-ups for this site to open the full view.');
    } catch (err: unknown) {
      win?.close();
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to open full view — invite this shop a login first');
      else message.error('An unexpected error occurred');
    }
  };

  const openCatalog = async (shop: MedicineShopRow) => {
    setCatalogShop(shop);
    setNewMedName('');
    setNewMedPrice(null);
    setCatalogLoading(true);
    try {
      const result = await apiCall('GET', `/api/admin/medicine-shops/${shop.id}/catalog`);
      setCatalogItems(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load medicine list');
      else message.error('An unexpected error occurred');
    } finally { setCatalogLoading(false); }
  };

  const addCatalogItem = async () => {
    if (!catalogShop || !newMedName.trim() || !newMedPrice || newMedPrice <= 0) return;
    setCatalogSaving(true);
    try {
      const result = await apiCall('POST', `/api/admin/medicine-shops/${catalogShop.id}/catalog`, {
        name: newMedName.trim(),
        priceCents: Math.round(newMedPrice * 100),
      });
      setCatalogItems((prev) => [...prev, (result.data ?? result) as CatalogItemRow]);
      setNewMedName('');
      setNewMedPrice(null);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add medicine');
      else message.error('An unexpected error occurred');
    } finally { setCatalogSaving(false); }
  };

  const deleteCatalogItem = async (itemId: string) => {
    if (!catalogShop) return;
    setCatalogBusyId(itemId);
    try {
      await apiCall('DELETE', `/api/admin/medicine-shops/${catalogShop.id}/catalog/${itemId}`);
      setCatalogItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to remove medicine');
      else message.error('An unexpected error occurred');
    } finally { setCatalogBusyId(null); }
  };

  const handleBulkUpload = async (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
    if (!catalogShop) return;
    setBulkUploading(true);
    setBulkResult(null);
    const fd = new FormData();
    fd.append('file', options.file as File);
    try {
      const res = await api.post(`${env.API_URL}/api/admin/medicine-shops/${catalogShop.id}/catalog/bulk-upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = (res.data.data ?? res.data) as BulkUploadResult;
      setBulkResult(result);
      openCatalog(catalogShop);
      options.onSuccess?.(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Bulk upload failed');
      else message.error('Bulk upload failed');
      options.onError?.(err as Error);
    } finally {
      setBulkUploading(false);
    }
  };

  const openHistory = async () => {
    if (!catalogShop) return;
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const result = await apiCall('GET', `/api/admin/medicine-shops/${catalogShop.id}/catalog/stock-history`);
      setHistoryRows(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load stock history');
      else message.error('An unexpected error occurred');
    } finally { setHistoryLoading(false); }
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Phone', dataIndex: 'contactPhone', key: 'contactPhone' },
    { title: 'City', dataIndex: 'city', key: 'city', render: (v?: string) => v || '—' },
    {
      title: 'Ownership', dataIndex: 'ownershipType', key: 'ownershipType',
      render: (v: OwnershipType) => (
        <Tag color={v === 'in_house' ? 'purple' : 'default'}>{v === 'in_house' ? 'In-House' : 'Third-Party'}</Tag>
      ),
    },
    {
      title: 'Status', key: 'isActive',
      render: (_: unknown, s: MedicineShopRow) => (
        <Tag color={s.isActive ? 'green' : 'default'}>{s.isActive ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'WhatsApp', key: 'whatsappLinked',
      render: (_: unknown, s: MedicineShopRow) => (
        s.whatsappLinked
          ? <Tag color="blue">Linked</Tag>
          : <Tag>Not linked yet</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, s: MedicineShopRow) => (
        <Space>
          {s.ownershipType === 'in_house' && (
            <Button size="small" icon={<ExportOutlined />} onClick={() => void openFullView(s)}>
              Open Full View
            </Button>
          )}
          <Button size="small" icon={<MedicineBoxOutlined />} onClick={() => openCatalog(s)}>Catalog</Button>
          <Button size="small" icon={<UserAddOutlined />} onClick={() => openInvite(s)}>Invite Login</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(s)}>Edit</Button>
          <Popconfirm title="Remove this medicine shop?" onConfirm={() => deleteShop(s.id)} okText="Remove" okButtonProps={{ danger: true }}>
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === s.id}>Remove</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ShopOutlined style={{ marginRight: 8 }} />Medicine Shops
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Onboard Shop</Button>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {shops.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No medicine shops onboarded yet"
          description={
            'Onboard a pharmacy here, then invite them a login so they can quote prescriptions patients upload over WhatsApp. ' +
            'A shop only starts receiving WhatsApp quote requests after they send your WhatsApp number one message themselves ' +
            '(same way a patient starts a conversation) — until then, they can still respond from their portal login.'
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table columns={columns} dataSource={shops.map((s) => ({ ...s, key: s.id }))} bordered size="middle" />
      )}

      {/* Onboard / Edit Drawer */}
      <Drawer
        title={<span><ShopOutlined style={{ marginRight: 8, color: '#1677ff' }} />{isCreate ? 'Onboard Medicine Shop' : `Edit — ${editing?.name ?? ''}`}</span>}
        placement="right"
        open={drawerOpen}
        onClose={closeDrawer}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              {isCreate ? 'Onboard' : 'Save Changes'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ isActive: true, ownershipType: 'third_party' }}>
          <Form.Item
            label={<span><ShopOutlined style={{ marginRight: 6 }} />Shop Name</span>}
            name="name"
            rules={[{ required: true, message: 'Shop name is required' }]}
          >
            <Input placeholder="e.g. City Pharmacy" autoFocus />
          </Form.Item>
          <Form.Item
            label="Ownership"
            name="ownershipType"
            extra="Is this your own in-house pharmacy, or a third-party vendor you're onboarding to quote prescriptions?"
          >
            <Radio.Group options={[
              { label: 'Third-Party Vendor', value: 'third_party' },
              { label: 'Our Own Pharmacy', value: 'in_house' },
            ]} />
          </Form.Item>
          <Form.Item
            label={<span><PhoneOutlined style={{ marginRight: 6 }} />WhatsApp Number</span>}
            name="contactPhone"
            rules={[{ required: true, message: 'Contact phone is required' }]}
            extra="This must be the number the shop will message your WhatsApp number from to start receiving quote requests there."
          >
            <Input placeholder="+91 98765 43210" />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Contact Email (optional)</span>}
            name="contactEmail"
            rules={[{ type: 'email', message: 'Enter a valid email' }]}
          >
            <Input placeholder="shop@example.com" />
          </Form.Item>
          <Form.Item
            label={<span><EnvironmentOutlined style={{ marginRight: 6 }} />Address (optional)</span>}
            name="addressLine1"
          >
            <Input placeholder="Street address" />
          </Form.Item>
          <Form.Item label="City (optional)" name="city">
            <Input placeholder="e.g. Bengaluru" />
          </Form.Item>
          {!isCreate && (
            <Form.Item label="Active" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Drawer>

      {/* Invite Shop Login */}
      <Drawer
        title={<span><UserAddOutlined style={{ marginRight: 8, color: '#1677ff' }} />Invite Login — {invitingShop?.name}</span>}
        placement="right"
        open={!!invitingShop}
        onClose={() => setInvitingShop(null)}
        size={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setInvitingShop(null)}>Cancel</Button>
            <Button type="primary" loading={inviteSaving} onClick={() => inviteForm.submit()}>
              Create Login
            </Button>
          </Space>
        }
      >
        <Form form={inviteForm} layout="vertical" onFinish={inviteShopUser}>
          <Form.Item
            label={<span><UserOutlined style={{ marginRight: 6 }} />Contact Person</span>}
            name="fullName"
            rules={[{ required: true, message: 'Full name is required' }]}
          >
            <Input placeholder="e.g. Ramesh Kumar" autoFocus />
          </Form.Item>
          <Form.Item
            label={<span><MailOutlined style={{ marginRight: 6 }} />Email</span>}
            name="email"
            rules={[
              { required: true, message: 'Email is required' },
              { type: 'email', message: 'Enter a valid email' },
            ]}
          >
            <Input placeholder="shop@example.com" />
          </Form.Item>
          <Form.Item
            label={<span><LockOutlined style={{ marginRight: 6 }} />Password (optional)</span>}
            name="password"
            rules={[{ min: 8, message: 'Must be at least 8 characters' }]}
            extra="Set a password to activate the login immediately. Leave blank to get a one-time invite link they can use to set their own password."
          >
            <Input.Password placeholder="Set a password (optional)" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Medicine catalog — the shop's own standing price list; a tenant
          admin can also add/remove entries here on the shop's behalf
          (e.g. after a phone call), same precedent as manual quote entry. */}
      <Drawer
        title={<span><MedicineBoxOutlined style={{ marginRight: 8, color: '#1677ff' }} />Medicine List — {catalogShop?.name}</span>}
        placement="right"
        open={!!catalogShop}
        onClose={() => setCatalogShop(null)}
        size={460}
        destroyOnClose
      >
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input
            placeholder="Medicine name"
            value={newMedName}
            onChange={(e) => setNewMedName(e.target.value)}
            style={{ width: '55%' }}
          />
          <InputNumber
            placeholder="Price (Rs.)"
            min={0.01}
            value={newMedPrice}
            onChange={setNewMedPrice}
            style={{ width: '30%' }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            loading={catalogSaving}
            disabled={!newMedName.trim() || !newMedPrice}
            onClick={addCatalogItem}
          />
        </Space.Compact>

        <Space wrap style={{ marginBottom: 16 }}>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => catalogShop && downloadFile(`/api/admin/medicine-shops/${catalogShop.id}/catalog/bulk-upload/template`, 'medicine-catalog-template.csv')}
          >
            Template
          </Button>
          <Button size="small" icon={<UploadOutlined />} onClick={() => { setBulkResult(null); setBulkModalOpen(true); }}>
            Bulk Upload
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => catalogShop && downloadFile(`/api/admin/medicine-shops/${catalogShop.id}/catalog/export`, `${catalogShop.name}-catalog.csv`)}
          >
            Export
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => void openHistory()}>
            History
          </Button>
        </Space>

        {catalogLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : catalogItems.length === 0 ? (
          <Alert type="info" showIcon message="No medicines listed yet" description="Add one above, bulk upload a spreadsheet, or the shop can maintain this themselves from their own portal." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {catalogItems.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid rgba(128,128,128,0.15)' }}>
                <div>
                  <Text strong style={{ display: 'block' }}>{item.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {item.rackLocation ? `${item.rackLocation} · ` : ''}
                    {item.quantity} {item.unit}
                    {item.batchNumber ? ` · Batch ${item.batchNumber}` : ''}
                    {item.expiryDate ? ` · Exp ${dayjs(item.expiryDate).format('DD MMM YYYY')}` : ''}
                  </Text>
                </div>
                <Space>
                  <Text strong>Rs.{(item.priceCents / 100).toFixed(2)}</Text>
                  <Popconfirm title="Remove this medicine?" onConfirm={() => deleteCatalogItem(item.id)} okText="Remove" okButtonProps={{ danger: true }}>
                    <Button size="small" danger icon={<DeleteOutlined />} loading={catalogBusyId === item.id} />
                  </Popconfirm>
                </Space>
              </div>
            ))}
          </Space>
        )}
      </Drawer>

      <Modal
        title="Bulk Upload Medicine List"
        open={bulkModalOpen}
        onCancel={() => setBulkModalOpen(false)}
        footer={<Button onClick={() => setBulkModalOpen(false)}>Close</Button>}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">
            Upload a .csv or .xlsx file with columns like Name, Price, Quantity, Unit, Rack Location, Batch Number,
            Expiry Date, Manufacturer, SKU — on {catalogShop?.name}&apos;s behalf. Existing medicines (matched by
            name) get updated; new ones get added.
          </Text>
          <Upload showUploadList={false} accept=".csv,.xlsx" customRequest={(opts) => { void handleBulkUpload(opts); }}>
            <Button type="primary" icon={<UploadOutlined />} loading={bulkUploading}>Choose File to Upload</Button>
          </Upload>
          {bulkResult && (
            <Alert
              type={bulkResult.errors.length > 0 || bulkResult.warnings.length > 0 ? 'warning' : 'success'}
              showIcon
              message={`${bulkResult.createdCount} added, ${bulkResult.updatedCount} updated`}
              description={
                bulkResult.errors.length > 0 || bulkResult.warnings.length > 0 ? (
                  <div>
                    {bulkResult.errors.length > 0 && (
                      <>
                        <Text strong>{bulkResult.errors.length} row(s) skipped:</Text>
                        <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>
                          {bulkResult.errors.map((e, i) => (
                            <li key={i}><Text type="secondary">Row {e.row}: {e.message}</Text></li>
                          ))}
                        </ul>
                      </>
                    )}
                    {bulkResult.warnings.length > 0 && (
                      <>
                        <Text strong>{bulkResult.warnings.length} row(s) need a second look:</Text>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {bulkResult.warnings.map((w, i) => (
                            <li key={i}><Text type="secondary">Row {w.row}: {w.message}</Text></li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ) : undefined
              }
            />
          )}
        </Space>
      </Modal>

      <Modal
        title={`Stock History — ${catalogShop?.name ?? ''}`}
        open={historyModalOpen}
        onCancel={() => setHistoryModalOpen(false)}
        footer={<Button onClick={() => setHistoryModalOpen(false)}>Close</Button>}
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : historyRows.length === 0 ? (
          <Alert type="info" showIcon message="No stock movements recorded yet" />
        ) : (
          <List
            size="small"
            dataSource={historyRows}
            renderItem={(m) => (
              <List.Item>
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>{m.itemName}</Text>
                    <Text strong style={{ color: m.delta < 0 ? '#cf1322' : '#3f8600' }}>
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </Text>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {m.reason} · now {m.quantityAfter} · {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* Result */}
      <Modal
        title="Shop Login Created"
        open={!!provisioned}
        onCancel={() => setProvisioned(null)}
        footer={<Button type="primary" onClick={() => setProvisioned(null)}>Done</Button>}
      >
        {provisioned && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircleFilled style={{ fontSize: 22, color: token.colorSuccess }} />
              <Text strong>{provisioned.inviteLink ? 'Invite link ready to share' : 'Login is active'}</Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Email</Text>
              <div><Text code>{provisioned.email}</Text></div>
            </div>
            {provisioned.inviteLink ? (
              <div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  Invite link · expires in 7 days
                </Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Input readOnly value={provisioned.inviteLink} />
                  <Button icon={<CopyOutlined />} onClick={copyInviteLink} title="Copy link" />
                </Space.Compact>
              </div>
            ) : (
              <Alert type="success" showIcon message="This shop can log in immediately at the medicine shop portal with the password you set." />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
