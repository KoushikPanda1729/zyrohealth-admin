'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography, Alert, Spin, Switch, Button, Space, message, Row, Col, Card,
  Table, Tag, Popconfirm, Drawer, Modal, Input, InputNumber, ColorPicker, Upload, Tooltip,
} from 'antd';
import {
  MobileOutlined, MedicineBoxOutlined, RobotOutlined, WomanOutlined,
  UserOutlined, ShoppingOutlined, FileTextOutlined, BankOutlined, AlertOutlined,
  PictureOutlined, TeamOutlined, ReadOutlined,
  HomeOutlined, MessageOutlined, CalendarOutlined, IdcardOutlined,
  PlusOutlined, EditOutlined, CheckCircleOutlined, StopOutlined, UploadOutlined, DeleteOutlined,
  AppstoreOutlined, LayoutOutlined, MenuOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall, api } from '../../../../lib/api';
import { getStoredUserRaw } from '../../../../lib/session';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface AppConfigData {
  topTabHealth: boolean;
  topTabAiDoctor: boolean;
  topTabWomen: boolean;
  quickActionDoctor: boolean;
  quickActionPharmacy: boolean;
  quickActionPrescription: boolean;
  quickActionHospital: boolean;
  quickActionAmbulance: boolean;
  sectionPromoBanner: boolean;
  sectionTopDoctors: boolean;
  sectionHealthArticles: boolean;
  bottomNavMessage: boolean;
  bottomNavCalendar: boolean;
  bottomNavProfile: boolean;
}

interface BannerRow {
  id: string;
  title: string;
  imageUrl?: string;
  ctaText: string;
  ctaLink?: string;
  backgroundColor: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
}

const TOP_TABS = [
  { key: 'topTabHealth' as const, label: 'Health', description: 'Doctors, pharmacy, hospitals and the main Home experience', icon: <MedicineBoxOutlined />, color: '#199A8E' },
  { key: 'topTabAiDoctor' as const, label: 'AI Doctor', description: 'AI-powered symptom checker and virtual consultations', icon: <RobotOutlined />, color: '#6C5CE7' },
  { key: 'topTabWomen' as const, label: 'Women', description: "Women's health tracking, cycle logs and specialist care", icon: <WomanOutlined />, color: '#E84393' },
];

const QUICK_ACTIONS = [
  { key: 'quickActionDoctor' as const, label: 'Doctor', description: 'Browse specialists and book appointments', icon: <UserOutlined />, color: '#199A8E' },
  { key: 'quickActionPharmacy' as const, label: 'Pharmacy', description: 'Order medicines from the pharmacy catalog', icon: <ShoppingOutlined />, color: '#2F80ED' },
  { key: 'quickActionPrescription' as const, label: 'Prescription', description: 'Upload a prescription for pharmacy fulfillment', icon: <FileTextOutlined />, color: '#F2994A' },
  { key: 'quickActionHospital' as const, label: 'Hospital', description: 'Find nearby hospitals and their details', icon: <BankOutlined />, color: '#9B59B6' },
  { key: 'quickActionAmbulance' as const, label: 'Ambulance', description: 'Request an emergency ambulance', icon: <AlertOutlined />, color: '#EB5757' },
];

const SECTIONS = [
  { key: 'sectionPromoBanner' as const, label: 'Promo Banner', description: 'Rotating banners at the top of the Home screen', icon: <PictureOutlined />, color: '#2F80ED' },
  { key: 'sectionTopDoctors' as const, label: 'Top Doctors', description: 'Featured doctor recommendations on Home', icon: <TeamOutlined />, color: '#199A8E' },
  { key: 'sectionHealthArticles' as const, label: 'Health Articles', description: 'Curated health articles and reading content', icon: <ReadOutlined />, color: '#F5A623' },
];

// Home is intentionally not in this list — it's the only way back to
// everything else, so it's never configurable and always shows.
const BOTTOM_NAV = [
  { key: 'bottomNavMessage' as const, label: 'Message', description: 'Chat with doctors and view conversations', icon: <MessageOutlined />, color: '#199A8E' },
  { key: 'bottomNavCalendar' as const, label: 'Calendar', description: 'Upcoming appointments and schedule', icon: <CalendarOutlined />, color: '#2F80ED' },
  { key: 'bottomNavProfile' as const, label: 'Profile', description: 'Account settings and personal details', icon: <IdcardOutlined />, color: '#9B59B6' },
];

const emptyBannerForm = {
  title: '',
  ctaText: 'Learn more',
  ctaLink: '',
  backgroundColor: '#DBEFED',
  sortOrder: 0,
  isPublished: true,
};

export default function AppConfigPage() {
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    try {
      const raw = getStoredUserRaw();
      setReadOnly(raw ? JSON.parse(raw).role === 'platform_support' : false);
    } catch { setReadOnly(false); }
  }, []);

  const [config, setConfig] = useState<AppConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiCall('GET', '/api/platform/config');
      setConfig(result.data ?? result);
      setDirty(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load app configuration');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const toggle = (key: keyof AppConfigData) => {
    if (!config) return;
    setConfig({ ...config, [key]: !config[key] });
    setDirty(true);
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const result = await apiCall('PATCH', '/api/platform/config', config);
      setConfig(result.data ?? result);
      setDirty(false);
      message.success('App configuration saved');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  // ── Banners ──────────────────────────────────────────────────────────

  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannersError, setBannersError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchBanners = useCallback(async () => {
    setBannersLoading(true);
    setBannersError(null);
    try {
      const result = await apiCall('GET', '/api/platform/banners');
      setBanners(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setBannersError(err.response?.data?.message || 'Failed to load banners');
      else setBannersError('An unexpected error occurred');
    } finally { setBannersLoading(false); }
  }, []);

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

  const [creating, setCreating] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState(emptyBannerForm);
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);

  const resetCreateForm = () => {
    setCreateForm(emptyBannerForm);
    setCreateImageFile(null);
    setCreateImagePreview(null);
  };

  const createBanner = async () => {
    if (!createForm.title.trim()) return;
    setCreateSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', createForm.title.trim());
      fd.append('ctaText', createForm.ctaText.trim() || 'Learn more');
      if (createForm.ctaLink.trim()) fd.append('ctaLink', createForm.ctaLink.trim());
      fd.append('backgroundColor', createForm.backgroundColor);
      fd.append('sortOrder', String(createForm.sortOrder));
      fd.append('isPublished', String(createForm.isPublished));
      if (createImageFile) fd.append('image', createImageFile);
      await api.post('/api/platform/banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Banner created');
      setCreating(false);
      resetCreateForm();
      fetchBanners();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create banner');
      else message.error('An unexpected error occurred');
    } finally { setCreateSaving(false); }
  };

  const [editing, setEditing] = useState<BannerRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState(emptyBannerForm);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);

  const openEdit = (banner: BannerRow) => {
    setEditing(banner);
    setEditForm({
      title: banner.title,
      ctaText: banner.ctaText,
      ctaLink: banner.ctaLink ?? '',
      backgroundColor: banner.backgroundColor,
      sortOrder: banner.sortOrder,
      isPublished: banner.isPublished,
    });
    setEditImageFile(null);
    setEditImagePreview(null);
  };

  const saveEdit = async () => {
    if (!editing || !editForm.title.trim()) return;
    setEditSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', editForm.title.trim());
      fd.append('ctaText', editForm.ctaText.trim() || 'Learn more');
      fd.append('ctaLink', editForm.ctaLink.trim());
      fd.append('backgroundColor', editForm.backgroundColor);
      fd.append('sortOrder', String(editForm.sortOrder));
      fd.append('isPublished', String(editForm.isPublished));
      if (editImageFile) fd.append('image', editImageFile);
      await api.patch(`/api/platform/banners/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success('Banner updated');
      setEditing(null);
      fetchBanners();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update banner');
      else message.error('An unexpected error occurred');
    } finally { setEditSaving(false); }
  };

  const togglePublished = async (banner: BannerRow) => {
    setBusyId(banner.id);
    try {
      const fd = new FormData();
      fd.append('isPublished', String(!banner.isPublished));
      await api.patch(`/api/platform/banners/${banner.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      message.success(banner.isPublished ? 'Banner unpublished' : 'Banner published');
      fetchBanners();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update banner');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const deleteBanner = async (id: string) => {
    setBusyId(id);
    try {
      await api.delete(`/api/platform/banners/${id}`);
      message.success('Banner deleted');
      fetchBanners();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to delete banner');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const bannerColumns = [
    {
      title: 'Preview', key: 'preview', width: 64,
      render: (_: unknown, b: BannerRow) => (
        b.imageUrl
          ? <img src={b.imageUrl} alt={b.title} style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }} />
          : <div style={{ width: 48, height: 32, borderRadius: 6, background: b.backgroundColor, border: '1px solid rgba(255,255,255,0.1)' }} />
      ),
    },
    {
      title: 'Title', dataIndex: 'titleDisplay', key: 'title', width: 200, ellipsis: true,
    },
    { title: 'CTA', dataIndex: 'ctaText', key: 'ctaText', width: 100, ellipsis: true, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Order', dataIndex: 'sortOrder', key: 'sortOrder', width: 60 },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_: unknown, b: BannerRow) => (
        b.isPublished
          ? <Tag icon={<CheckCircleOutlined />} color="green">Published</Tag>
          : <Tag color="default">Draft</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: unknown, b: BannerRow) => (
        <Space size={4}>
          {!readOnly && (
            <Tooltip title="Edit">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(b)} />
            </Tooltip>
          )}
          {!readOnly && (
            <Popconfirm
              title={b.isPublished ? 'Unpublish this banner?' : 'Publish this banner?'}
              onConfirm={() => togglePublished(b)}
            >
              <Tooltip title={b.isPublished ? 'Unpublish' : 'Publish'}>
                <Button size="small" danger={b.isPublished} icon={b.isPublished ? <StopOutlined /> : <CheckCircleOutlined />} loading={busyId === b.id} />
              </Tooltip>
            </Popconfirm>
          )}
          {!readOnly && (
            <Popconfirm title="Delete this banner?" onConfirm={() => deleteBanner(b.id)}>
              <Tooltip title="Delete">
                <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === b.id} />
              </Tooltip>
            </Popconfirm>
          )}
          {readOnly && <Text type="secondary" style={{ fontSize: 12 }}>View only</Text>}
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>;
  }

  const renderToggleList = (
    items: { key: keyof AppConfigData; label: string; description?: string; icon: React.ReactNode; color?: string }[],
  ) => (
    <div>
      {items.map((item, i) => {
        const color = item.color ?? '#199A8E';
        return (
          <div
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: i === items.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)',
              gap: 16,
            }}
          >
            <Space size={12} align="start">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `${color}1F`,
                  color,
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </div>
              <div>
                <Text strong style={{ display: 'block', fontSize: 14 }}>{item.label}</Text>
                {item.description && (
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.description}</Text>
                )}
              </div>
            </Space>
            <Switch checked={config![item.key]} disabled={readOnly} onChange={() => toggle(item.key)} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <MobileOutlined style={{ marginRight: 8 }} />Mobile App Configuration
        </Title>
        {!readOnly && config && (
          <Button type="primary" loading={saving} disabled={!dirty} onClick={save}>
            Save Changes
          </Button>
        )}
      </div>

      <Alert
        type="info"
        showIcon
        message="This applies to every patient, across every tenant"
        description="These toggles control the Home screen for the whole mobile app — there's no per-tenant mobile experience today, so this is one shared configuration."
        style={{ marginBottom: 20 }}
      />

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {config && (
        <Row gutter={[24, 24]}>
          <Col xs={24} md={13}>
            <Card
              title={<span><HomeOutlined style={{ marginRight: 8, color: '#199A8E' }} />Home Screen Top Tabs</span>}
              size="small"
              style={{ marginBottom: 20 }}
              styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}
            >
              {renderToggleList(TOP_TABS)}
            </Card>

            <Card
              title={<span><AppstoreOutlined style={{ marginRight: 8, color: '#199A8E' }} />Quick Action Icons</span>}
              size="small"
              style={{ marginBottom: 20 }}
              styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}
            >
              {renderToggleList(QUICK_ACTIONS)}
            </Card>

            <Card
              title={<span><LayoutOutlined style={{ marginRight: 8, color: '#199A8E' }} />Home Screen Sections</span>}
              size="small"
              style={{ marginBottom: 20 }}
              styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}
            >
              {renderToggleList(SECTIONS)}
            </Card>

            <Card
              title={<span><PictureOutlined style={{ marginRight: 8, color: '#199A8E' }} />Promo Banners</span>}
              size="small"
              style={{ marginBottom: 20 }}
              extra={!readOnly && (
                <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  Add Banner
                </Button>
              )}
            >
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                Multiple published banners auto-advance and swipe in the mobile app&apos;s carousel, ordered by &quot;Order&quot;.
              </Text>
              {bannersError && <Alert type="error" message={bannersError} showIcon style={{ marginBottom: 12 }} />}
              {bannersLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spin /></div>
              ) : banners.length === 0 ? (
                <Alert
                  type="info"
                  showIcon
                  message="No banners yet"
                  description="Add one to start the Home screen carousel — patients see it immediately once published."
                />
              ) : (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <Table
                    columns={bannerColumns}
                    dataSource={banners.map((b) => ({ ...b, key: b.id, titleDisplay: b.title.replace(/\n/g, ' ') }))}
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              )}
            </Card>

            <Card
              title={<span><MenuOutlined style={{ marginRight: 8, color: '#199A8E' }} />Bottom Navigation</span>}
              size="small"
              styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}
            >
              <Alert
                type="warning"
                showIcon
                message="Home is always shown — it's the only way back to everything else."
                style={{ margin: '14px 0' }}
              />
              {renderToggleList(BOTTOM_NAV)}
            </Card>
          </Col>

          <Col xs={24} md={11}>
            <div style={{ position: 'sticky', top: 24 }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>Live Preview</Text>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <AppPreview config={config} banners={banners} />
              </div>
            </div>
          </Col>
        </Row>
      )}

      <Drawer
        title={<span><PictureOutlined style={{ marginRight: 8, color: '#1677ff' }} />Add Banner</span>}
        placement="right"
        open={creating}
        onClose={() => { setCreating(false); resetCreateForm(); }}
        size={480}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => { setCreating(false); resetCreateForm(); }}>Cancel</Button>
            <Button type="primary" loading={createSaving} disabled={!createForm.title.trim()} onClick={createBanner}>
              Create
            </Button>
          </Space>
        }
      >
        <BannerFormFields
          form={createForm}
          setForm={setCreateForm}
          imagePreview={createImagePreview}
          onImageSelect={(file) => {
            setCreateImageFile(file);
            setCreateImagePreview(URL.createObjectURL(file));
          }}
        />
      </Drawer>

      <Modal
        title="Edit Banner"
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={saveEdit}
        okText="Save"
        confirmLoading={editSaving}
        okButtonProps={{ disabled: !editForm.title.trim() }}
        width={560}
        destroyOnClose
      >
        <BannerFormFields
          form={editForm}
          setForm={setEditForm}
          imagePreview={editImagePreview ?? editing?.imageUrl ?? null}
          onImageSelect={(file) => {
            setEditImageFile(file);
            setEditImagePreview(URL.createObjectURL(file));
          }}
        />
      </Modal>
    </div>
  );
}

type BannerForm = typeof emptyBannerForm;

function BannerFormFields({
  form, setForm, imagePreview, onImageSelect,
}: {
  form: BannerForm;
  setForm: (f: BannerForm) => void;
  imagePreview: string | null;
  onImageSelect: (file: File) => void;
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <div>
        <Text strong style={{ fontSize: 13 }}>Title</Text>
        <TextArea
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          rows={3}
          placeholder={'Early protection\nfor your family\nhealth'}
          style={{ marginTop: 4 }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>Use line breaks for multi-line banner text.</Text>
      </div>

      <div>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Image</Text>
        {imagePreview && (
          <img src={imagePreview} alt="Banner preview" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
        )}
        <Upload
          accept="image/jpeg,image/png,image/webp"
          showUploadList={false}
          beforeUpload={(file) => { onImageSelect(file); return false; }}
        >
          <Button icon={<UploadOutlined />}>{imagePreview ? 'Replace image' : 'Upload image'}</Button>
        </Upload>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
          Optional — without an image the banner shows as a colored card.
        </Text>
      </div>

      <div>
        <Text strong style={{ fontSize: 13 }}>Button text</Text>
        <Input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} style={{ marginTop: 4 }} />
      </div>
      <div>
        <Text strong style={{ fontSize: 13 }}>Button link</Text>
        <Input
          value={form.ctaLink}
          onChange={(e) => setForm({ ...form, ctaLink: e.target.value })}
          placeholder="https://... or an in-app route like /doctors"
          style={{ marginTop: 4 }}
        />
      </div>
      <div>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Background color</Text>
        <ColorPicker
          value={form.backgroundColor}
          onChange={(v) => setForm({ ...form, backgroundColor: v.toHexString() })}
          showText
        />
      </div>
      <div>
        <Text strong style={{ fontSize: 13 }}>Order</Text>
        <InputNumber
          value={form.sortOrder}
          onChange={(v) => setForm({ ...form, sortOrder: v ?? 0 })}
          min={0}
          style={{ marginTop: 4, width: '100%' }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>Lower numbers appear first in the carousel.</Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Switch checked={form.isPublished} onChange={(v) => setForm({ ...form, isPublished: v })} />
        <Text style={{ fontSize: 13 }}>Published (visible to patients)</Text>
      </div>
    </Space>
  );
}

function AppPreview({ config, banners }: { config: AppConfigData; banners: BannerRow[] }) {
  const enabledTabs = TOP_TABS.filter((t) => config[t.key]);
  const enabledActions = QUICK_ACTIONS.filter((a) => config[a.key]);
  const enabledNav = [
    { key: 'home', label: 'Home', icon: <HomeOutlined /> },
    ...BOTTOM_NAV.filter((n) => config[n.key]),
  ];
  const publishedBanners = banners.filter((b) => b.isPublished).sort((a, b) => a.sortOrder - b.sortOrder);
  const previewBanner = publishedBanners[0];

  return (
    <div style={{
      width: 300,
      borderRadius: 32,
      border: '8px solid #1f1f1f',
      background: '#fff',
      boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 14px', maxHeight: 480, overflowY: 'auto' }}>
        {/* Top tab bar — hidden entirely (not a placeholder message) when
            nothing is enabled, so the content below just shifts up, same
            as the real app. */}
        {enabledTabs.length > 0 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-evenly', marginBottom: 20 }}>
            {enabledTabs.map((tab, i) => (
              <div
                key={tab.key}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  padding: '10px 4px',
                  borderRadius: 14,
                  background: i === 0 ? tab.color : '#fff',
                  boxShadow: i === 0 ? `0 4px 10px ${tab.color}66` : '0 2px 6px rgba(0,0,0,0.08)',
                }}
              >
                <div style={{ color: i === 0 ? '#fff' : tab.color, fontSize: 16 }}>{tab.icon}</div>
                <div style={{
                  fontSize: 10,
                  marginTop: 4,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  color: i === 0 ? '#fff' : '#555',
                }}>
                  {tab.label}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.3, marginBottom: 14 }}>
          Find your desire<br />health solution
        </div>
        <div style={{ height: 34, borderRadius: 17, background: '#F5F7FA', marginBottom: enabledActions.length > 0 ? 18 : 0 }} />

        {/* Quick actions — same collapse-not-message treatment. */}
        {enabledActions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', marginBottom: 20 }}>
            {enabledActions.map((action) => (
              <div key={action.key} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, background: '#EEF8F7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#199A8E', fontSize: 16, margin: '0 auto',
                }}>
                  {action.icon}
                </div>
                <div style={{ fontSize: 9, color: '#6B7280', marginTop: 4 }}>{action.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Promo banner — reflects the first published banner, with dots
            if there's more than one (mirrors the mobile carousel). */}
        {config.sectionPromoBanner && (
          <div style={{ marginBottom: 20 }}>
            {previewBanner ? (
              <div style={{
                borderRadius: 16,
                padding: 14,
                background: previewBanner.imageUrl ? undefined : previewBanner.backgroundColor,
                backgroundImage: previewBanner.imageUrl ? `linear-gradient(0deg, rgba(0,0,0,0.35), rgba(0,0,0,0.1)), url(${previewBanner.imageUrl})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                minHeight: 64,
                display: 'flex',
                alignItems: 'center',
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'pre-line',
                  color: previewBanner.imageUrl ? '#fff' : '#1A1A2E',
                }}>
                  {previewBanner.title}
                </div>
              </div>
            ) : (
              <div style={{ background: '#E8F5F3', borderRadius: 16, padding: 14, fontSize: 12, fontWeight: 700, color: '#1A1A2E' }}>
                No published banners yet
              </div>
            )}
            {publishedBanners.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                {publishedBanners.map((b, i) => (
                  <div
                    key={b.id}
                    style={{
                      width: i === 0 ? 12 : 5, height: 5, borderRadius: 3,
                      background: i === 0 ? '#199A8E' : '#D9D9D9',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top doctors */}
        {config.sectionTopDoctors && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>Top Doctor</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EEE', margin: '0 auto' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Health articles */}
        {config.sectionHealthArticles && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>Health article</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F5A623', flexShrink: 0 }} />
              <div style={{ fontSize: 10, color: '#555' }}>The 25 Healthiest Fruits...</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav mock — Home always present, rest reflect config */}
      <div style={{
        display: 'flex', justifyContent: 'space-around', padding: '10px 0',
        borderTop: '1px solid #F0F0F0', background: '#fff',
      }}>
        {enabledNav.map((item, i) => (
          <div key={item.key} style={{ textAlign: 'center', color: i === 0 ? '#199A8E' : '#B0B0B0', fontSize: 9 }}>
            <div style={{ fontSize: 14 }}>{item.icon}</div>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
