'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, Popconfirm, message, Drawer, Modal, Form, Input, InputNumber,
  Select, DatePicker, Switch, Upload, List, Collapse, Timeline, Tooltip, Empty,
} from 'antd';
import type { UploadFile } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MedicineBoxOutlined, CameraOutlined, UploadOutlined, DownloadOutlined,
  HistoryOutlined, BarcodeOutlined, ContainerOutlined, SwapOutlined, FundOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { Html5QrcodeScanner } from 'html5-qrcode';
import axios from 'axios';
import { apiCall, api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { downloadFile } from '../../../lib/downloadFile';

const { Title, Text } = Typography;

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
  manufacturer?: string | null;
  sku?: string | null;
  lowStockThreshold?: number | null;
  preferredSupplierId?: string | null;
  gstRatePercent: number;
  isControlledDrug: boolean;
  packSize?: number | null;
  subUnit?: string | null;
  updatedAt: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface CatalogFormValues {
  name: string;
  price: number;
  quantity?: number;
  unit?: string;
  rackLocation?: string;
  batchNumber?: string;
  expiryDate?: Dayjs;
  manufacturer?: string;
  sku?: string;
  lowStockThreshold?: number;
  preferredSupplierId?: string;
  gstRatePercent?: number;
  isControlledDrug?: boolean;
  packSize?: number;
  subUnit?: string;
  isActive?: boolean;
}

interface BulkUploadResult {
  createdCount: number;
  updatedCount: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
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

interface BatchRow {
  id: string;
  batchNumber?: string;
  expiryDate?: string;
  quantity: number;
  createdAt: string;
}

interface BatchFormValues {
  batchNumber?: string;
  expiryDate?: Dayjs;
  quantity: number;
}

const UNIT_OPTIONS = ['unit', 'tablet', 'capsule', 'strip', 'bottle', 'box', 'tube', 'vial', 'sachet', 'ml', 'gm'];

export default function ShopCatalogPage() {
  // Catalog mutations are owner-only on the backend
  // (requireShopOwner.middleware.ts) — a cashier still sees the full
  // Medicine List to check stock while billing, just without the ability
  // to change it.
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : {};
      setIsOwner(parsed.shopStaffRole !== 'cashier');
    } catch { setIsOwner(true); }
  }, []);

  const [items, setItems] = useState<CatalogItemRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanFileList, setScanFileList] = useState<UploadFile[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isCreate, setIsCreate] = useState(false);
  const [editing, setEditing] = useState<CatalogItemRow | null>(null);
  const [scannedNotice, setScannedNotice] = useState(false);
  const [scannedPackSize, setScannedPackSize] = useState<{ count: number; unit: string } | null>(null);
  const [form] = Form.useForm<CatalogFormValues>();

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState<StockMovementRow[]>([]);
  const [historyDownloadOpen, setHistoryDownloadOpen] = useState(false);
  const [historyDownloading, setHistoryDownloading] = useState(false);
  const [historyRange, setHistoryRange] = useState<[Dayjs, Dayjs] | null>(null);

  const [batchesFor, setBatchesFor] = useState<CatalogItemRow | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchBusyId, setBatchBusyId] = useState<string | null>(null);
  const [batchForm] = Form.useForm<BatchFormValues>();

  const [adjustFor, setAdjustFor] = useState<CatalogItemRow | null>(null);
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustForm] = Form.useForm<{ type: 'return' | 'damage'; quantity: number; note?: string }>();

  const [comparisonFor, setComparisonFor] = useState<CatalogItemRow | null>(null);
  const [comparisonQuotes, setComparisonQuotes] = useState<{ supplierId: string; supplierName: string; priceCents: number }[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonForm] = Form.useForm<{ supplierId: string; priceCents: number }>();
  const [comparisonSaving, setComparisonSaving] = useState(false);

  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const itemsRef = useRef<CatalogItemRow[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogResult, suppliersResult] = await Promise.all([
        apiCall('GET', '/api/shop/catalog'),
        apiCall('GET', '/api/shop/suppliers'),
      ]);
      setItems(catalogResult.data ?? catalogResult);
      setSuppliers(suppliersResult.data ?? suppliersResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load medicine list');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setIsCreate(true);
    setEditing(null);
    setScannedNotice(false);
    setScannedPackSize(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEdit = (item: CatalogItemRow) => {
    setIsCreate(false);
    setEditing(item);
    setScannedNotice(false);
    setScannedPackSize(null);
    form.setFieldsValue({
      name: item.name,
      price: item.priceCents / 100,
      quantity: item.quantity,
      unit: item.unit,
      rackLocation: item.rackLocation ?? undefined,
      batchNumber: item.batchNumber ?? undefined,
      expiryDate: item.expiryDate ? dayjs(item.expiryDate) : undefined,
      manufacturer: item.manufacturer ?? undefined,
      sku: item.sku ?? undefined,
      lowStockThreshold: item.lowStockThreshold ?? undefined,
      preferredSupplierId: item.preferredSupplierId ?? undefined,
      gstRatePercent: item.gstRatePercent,
      isControlledDrug: item.isControlledDrug,
      packSize: item.packSize ?? undefined,
      subUnit: item.subUnit ?? undefined,
      isActive: item.isActive,
    });
    setDrawerOpen(true);
  };

  const closeDrawer = () => { setDrawerOpen(false); setIsCreate(false); setEditing(null); setScannedNotice(false); setScannedPackSize(null); };

  const save = async (values: CatalogFormValues) => {
    setSaving(true);
    const priceCents = Math.round(values.price * 100);
    const payload = {
      name: values.name.trim(),
      priceCents,
      quantity: values.quantity,
      unit: values.unit,
      rackLocation: values.rackLocation?.trim() || null,
      batchNumber: values.batchNumber?.trim() || null,
      expiryDate: values.expiryDate ? values.expiryDate.format('YYYY-MM-DD') : null,
      manufacturer: values.manufacturer?.trim() || null,
      sku: values.sku?.trim() || null,
      lowStockThreshold: values.lowStockThreshold ?? null,
      preferredSupplierId: values.preferredSupplierId ?? null,
      gstRatePercent: values.gstRatePercent,
      isControlledDrug: values.isControlledDrug,
      packSize: values.packSize ?? null,
      subUnit: values.subUnit?.trim() || null,
      isActive: values.isActive,
    };
    try {
      if (isCreate) {
        await apiCall('POST', '/api/shop/catalog', payload);
        message.success('Medicine added');
      } else if (editing) {
        await apiCall('PATCH', `/api/shop/catalog/${editing.id}`, payload);
        message.success('Medicine updated');
      }
      closeDrawer();
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  const deleteItem = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall('DELETE', `/api/shop/catalog/${id}`);
      message.success('Medicine removed');
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to remove');
      else message.error('An unexpected error occurred');
    } finally { setBusyId(null); }
  };

  const closeScanModal = () => { setScanModalOpen(false); setScanFileList([]); };

  // Runs the scan against every photo staged in the modal (front of box,
  // back, a close-up of the batch/expiry line, etc.) in ONE request — the
  // AI combines whatever's legible across all of them into one result,
  // since a single angle rarely shows everything printed on a package.
  const handleScan = async () => {
    if (scanFileList.length === 0) return;
    setScanning(true);
    const fd = new FormData();
    for (const f of scanFileList) {
      if (f.originFileObj) fd.append('files', f.originFileObj);
    }
    try {
      const res = await api.post(`${env.API_URL}/api/shop/catalog/scan`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fields = (res.data.data ?? res.data) as {
        name?: string; manufacturer?: string; batchNumber?: string; expiryDate?: string; priceCents?: number;
        unit?: string; packSize?: number;
      };
      closeScanModal();
      setIsCreate(true);
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        name: fields.name,
        price: fields.priceCents != null ? fields.priceCents / 100 : undefined,
        manufacturer: fields.manufacturer,
        batchNumber: fields.batchNumber,
        expiryDate: fields.expiryDate ? dayjs(fields.expiryDate) : undefined,
        unit: fields.unit && UNIT_OPTIONS.includes(fields.unit) ? fields.unit : undefined,
      });
      // packSize (e.g. "32 TABLETS" printed on the box) is how many are in
      // ONE pack, not how many the shop has in stock right now — shown as
      // a hint only, never auto-filled into the Quantity field.
      setScannedPackSize(
        fields.packSize && fields.unit ? { count: fields.packSize, unit: fields.unit } : null,
      );
      setScannedNotice(true);
      setDrawerOpen(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Could not read these photos');
      else message.error('Could not read these photos');
    } finally {
      setScanning(false);
    }
  };

  const handleBulkUpload = async (options: { file: unknown; onSuccess?: (body: unknown) => void; onError?: (err: Error) => void }) => {
    setBulkUploading(true);
    setBulkResult(null);
    const fd = new FormData();
    fd.append('file', options.file as File);
    try {
      const res = await api.post(`${env.API_URL}/api/shop/catalog/bulk-upload`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const result = (res.data.data ?? res.data) as BulkUploadResult;
      setBulkResult(result);
      fetchAll();
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
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const result = await apiCall('GET', '/api/shop/catalog/stock-history');
      setHistoryRows(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load stock history');
      else message.error('An unexpected error occurred');
    } finally { setHistoryLoading(false); }
  };

  const downloadStockHistory = async (format: 'csv' | 'xlsx') => {
    setHistoryDownloading(true);
    try {
      const params = new URLSearchParams({ format });
      if (historyRange) {
        params.set('from', historyRange[0].format('YYYY-MM-DD'));
        params.set('to', historyRange[1].format('YYYY-MM-DD'));
      }
      await downloadFile(
        `/api/shop/catalog/stock-history/export?${params.toString()}`,
        `stock-history.${format}`,
      );
      setHistoryDownloadOpen(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to download stock history');
      else message.error('An unexpected error occurred');
    } finally { setHistoryDownloading(false); }
  };

  // A catalog item's own quantity/expiry/batchNumber fields remain the
  // single-batch fast path; this Drawer is for the case that can't
  // represent — the SAME medicine restocked with a different batch/expiry
  // before the old one sold out. Adding a batch here also bumps the
  // item's total quantity (see backend's batch.util.ts), so refetch the
  // list underneath to keep the table's Qty column in sync.
  const openBatches = async (item: CatalogItemRow) => {
    setBatchesFor(item);
    batchForm.resetFields();
    setBatchesLoading(true);
    try {
      const result = await apiCall('GET', `/api/shop/catalog/${item.id}/batches`);
      setBatches(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load batches');
      else message.error('An unexpected error occurred');
    } finally { setBatchesLoading(false); }
  };

  const closeBatches = () => { setBatchesFor(null); setBatches([]); };

  const addBatch = async (values: BatchFormValues) => {
    if (!batchesFor) return;
    setBatchSaving(true);
    try {
      await apiCall('POST', `/api/shop/catalog/${batchesFor.id}/batches`, {
        batchNumber: values.batchNumber?.trim() || undefined,
        expiryDate: values.expiryDate ? values.expiryDate.format('YYYY-MM-DD') : undefined,
        quantity: values.quantity,
      });
      message.success('Batch added');
      batchForm.resetFields();
      const result = await apiCall('GET', `/api/shop/catalog/${batchesFor.id}/batches`);
      setBatches(result.data ?? result);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add batch');
      else message.error('An unexpected error occurred');
    } finally { setBatchSaving(false); }
  };

  const removeBatch = async (batchId: string) => {
    setBatchBusyId(batchId);
    try {
      await apiCall('DELETE', `/api/shop/catalog/batches/${batchId}`);
      message.success('Batch removed');
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to remove batch');
      else message.error('An unexpected error occurred');
    } finally { setBatchBusyId(null); }
  };

  // ── Returns / damaged-stock adjustments ─────────────────────────────
  const openAdjust = (item: CatalogItemRow) => {
    setAdjustFor(item);
    adjustForm.resetFields();
    adjustForm.setFieldsValue({ type: 'return' });
  };

  const submitAdjust = async (values: { type: 'return' | 'damage'; quantity: number; note?: string }) => {
    if (!adjustFor) return;
    setAdjustSaving(true);
    try {
      await apiCall('POST', `/api/shop/catalog/${adjustFor.id}/adjust-stock`, values);
      message.success(values.type === 'return' ? 'Return recorded' : 'Damage recorded');
      setAdjustFor(null);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to record adjustment');
      else message.error('An unexpected error occurred');
    } finally { setAdjustSaving(false); }
  };

  // ── Distributor price comparison ─────────────────────────────────────
  const openComparison = async (item: CatalogItemRow) => {
    setComparisonFor(item);
    comparisonForm.resetFields();
    setComparisonLoading(true);
    try {
      const result = await apiCall('GET', `/api/shop/catalog/${item.id}/supplier-comparison`);
      setComparisonQuotes(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load comparison');
    } finally { setComparisonLoading(false); }
  };

  const saveSupplierPrice = async (values: { supplierId: string; priceCents: number }) => {
    if (!comparisonFor) return;
    setComparisonSaving(true);
    try {
      await apiCall('PUT', '/api/shop/supplier-prices', {
        supplierId: values.supplierId,
        catalogItemId: comparisonFor.id,
        priceCents: Math.round(values.priceCents * 100),
      });
      message.success('Supplier price saved');
      comparisonForm.resetFields();
      const result = await apiCall('GET', `/api/shop/catalog/${comparisonFor.id}/supplier-comparison`);
      setComparisonQuotes(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to save price');
      else message.error('An unexpected error occurred');
    } finally { setComparisonSaving(false); }
  };

  // Client-side barcode/QR decode via the device camera — no server round
  // trip, unlike the AI photo scan. Matched against the SKU already on
  // file: if the shop has scanned this exact barcode into a medicine's SKU
  // field before, jump straight to editing it (e.g. to add stock); if not,
  // open Add Medicine with the SKU pre-filled so they only type it once.
  useEffect(() => {
    if (!barcodeModalOpen) return;
    let cancelled = false;

    (async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      if (cancelled) return;
      const scanner = new Html5QrcodeScanner(
        'barcode-scanner-region',
        { fps: 10, qrbox: 250 },
        false,
      );
      scannerRef.current = scanner;
      scanner.render(
        (decodedText) => {
          setBarcodeModalOpen(false);
          const match = itemsRef.current.find((i) => i.sku?.toLowerCase() === decodedText.toLowerCase());
          if (match) {
            message.success(`Found "${match.name}" — editing`);
            openEdit(match);
          } else {
            message.info(`No medicine with SKU "${decodedText}" yet — add it below`);
            openCreate();
            form.setFieldsValue({ sku: decodedText });
          }
        },
        () => { /* ignore per-frame decode misses */ },
      );
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.clear().catch(() => { /* already cleared */ });
      scannerRef.current = null;
    };
    // Deliberately scoped to barcodeModalOpen only — form/openCreate/openEdit
    // don't need to retrigger this effect (that would tear down and restart
    // the camera on every unrelated re-render); itemsRef keeps the match
    // lookup fresh without needing `items` here either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeModalOpen]);

  const columns = [
    {
      title: 'Medicine', key: 'name',
      render: (_: unknown, item: CatalogItemRow) => (
        <Space>
          <Text>{item.name}</Text>
          {item.isControlledDrug && <Tag color="red">H1</Tag>}
        </Space>
      ),
    },
    { title: 'Rack', dataIndex: 'rackLocation', key: 'rackLocation', render: (v?: string) => v || '—' },
    {
      title: 'Qty', key: 'quantity',
      render: (_: unknown, item: CatalogItemRow) => {
        const low = item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold;
        return (
          <Space>
            <Text>{item.quantity} {item.unit}</Text>
            {low && <Tag color="orange">Low Stock</Tag>}
          </Space>
        );
      },
    },
    { title: 'Batch', dataIndex: 'batchNumber', key: 'batchNumber', render: (v?: string) => v || '—' },
    {
      title: 'Expiry', dataIndex: 'expiryDate', key: 'expiryDate',
      render: (v?: string) => (v ? dayjs(v).format('DD MMM YYYY') : '—'),
    },
    {
      title: 'Price', dataIndex: 'priceCents', key: 'priceCents',
      render: (v: number) => `Rs.${(v / 100).toFixed(2)}`,
    },
    {
      title: 'Supplier', dataIndex: 'preferredSupplierId', key: 'preferredSupplierId',
      render: (v?: string | null) => suppliers.find((s) => s.id === v)?.name || <Text type="secondary">—</Text>,
    },
    {
      title: 'Status', dataIndex: 'isActive', key: 'isActive',
      render: (active: boolean) => <Text type={active ? undefined : 'secondary'}>{active ? 'Active' : 'Inactive'}</Text>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, item: CatalogItemRow) => (
        isOwner ? (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>Edit</Button>
            <Button size="small" icon={<ContainerOutlined />} onClick={() => void openBatches(item)}>Batches</Button>
            <Tooltip title="Record a customer return or damaged/expired stock">
              <Button size="small" icon={<SwapOutlined />} onClick={() => openAdjust(item)} />
            </Tooltip>
            <Tooltip title="Compare distributor prices for this medicine">
              <Button size="small" icon={<FundOutlined />} onClick={() => void openComparison(item)} />
            </Tooltip>
            <Popconfirm title="Remove this medicine from your list?" onConfirm={() => deleteItem(item.id)} okText="Remove" okButtonProps={{ danger: true }}>
              <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === item.id}>Remove</Button>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        )
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: '0 0 12px' }}>
          <MedicineBoxOutlined style={{ marginRight: 8 }} />Medicine List
        </Title>
        <Space wrap style={{ width: '100%' }}>
          {isOwner && <Button icon={<BarcodeOutlined />} onClick={() => setBarcodeModalOpen(true)}>Scan Barcode</Button>}
          {isOwner && <Button icon={<CameraOutlined />} onClick={() => setScanModalOpen(true)}>Scan Photo</Button>}
          {isOwner && <Button icon={<UploadOutlined />} onClick={() => { setBulkResult(null); setBulkModalOpen(true); }}>Bulk Upload</Button>}
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('/api/shop/catalog/export', 'medicine-catalog-export.csv')}>Export</Button>
          <Button icon={<HistoryOutlined />} onClick={() => void openHistory()}>History</Button>
          {isOwner && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Medicine</Button>}
        </Space>
        {!isOwner && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
            View only — ask the shop owner to edit stock, prices, or add new medicines.
          </Text>
        )}
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Keep a full inventory for the medicines you stock — rack location, quantity, batch and expiry — as your own
        reference for quoting faster. A tenant admin can see it too if they&apos;re entering a quote on your behalf
        over a phone call.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {items.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No medicines listed yet"
          description="Add medicines one at a time, scan a package photo to auto-fill the details, or bulk upload a spreadsheet — whichever's fastest for you."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={items.map((i) => ({ ...i, key: i.id }))} bordered size="middle" scroll={{ x: true }} />
      )}

      <Drawer
        title={isCreate ? 'Add Medicine' : `Edit — ${editing?.name ?? ''}`}
        placement="right"
        open={drawerOpen}
        onClose={closeDrawer}
        width={420}
        destroyOnClose
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              {isCreate ? 'Add' : 'Save Changes'}
            </Button>
          </Space>
        }
      >
        {scannedNotice && (
          <Alert
            type="info"
            showIcon
            message="Filled in from your photo — please review before saving"
            description={
              scannedPackSize
                ? `The box says ${scannedPackSize.count} ${scannedPackSize.unit}s per pack — that's not the same as how many you have in stock. Enter your actual on-hand quantity below.`
                : undefined
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical" onFinish={save} initialValues={{ isActive: true, unit: 'unit', quantity: 0 }}>
          <Form.Item label="Medicine name" name="name" rules={[{ required: true, message: 'Medicine name is required' }]}>
            <Input placeholder="e.g. Paracetamol 500mg" autoFocus />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item label="Price (Rs.)" name="price" rules={[{ required: true, message: 'Price is required' }]} style={{ width: '50%' }}>
              <InputNumber min={0.01} step={0.5} style={{ width: '100%' }} placeholder="e.g. 50" />
            </Form.Item>
            <Form.Item label="Quantity" name="quantity" style={{ width: '25%' }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Unit" name="unit" style={{ width: '25%' }}>
              <Select options={UNIT_OPTIONS.map((u) => ({ value: u, label: u }))} />
            </Form.Item>
          </Space.Compact>
          <Form.Item label="Rack Location" name="rackLocation">
            <Input placeholder="e.g. Rack A-3" />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item label="Batch Number" name="batchNumber" style={{ width: '50%' }}>
              <Input placeholder="e.g. B2024118" />
            </Form.Item>
            <Form.Item label="Expiry Date" name="expiryDate" style={{ width: '50%' }}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
          </Space.Compact>
          <Form.Item label="Manufacturer (optional)" name="manufacturer">
            <Input placeholder="e.g. Cipla" />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item label="SKU / Barcode (optional)" name="sku" style={{ width: '50%' }}>
              <Input placeholder="e.g. PARA500" />
            </Form.Item>
            <Form.Item label="Low Stock Alert Below" name="lowStockThreshold" style={{ width: '50%' }}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 10" />
            </Form.Item>
          </Space.Compact>
          <Form.Item
            label="Preferred Supplier (optional)"
            name="preferredSupplierId"
            help="Who you usually reorder this from — lets a low-stock reorder be sent to the right supplier automatically."
          >
            <Select
              allowClear
              placeholder="No supplier set"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>Add suppliers from the Purchase Orders page first</Text>}
            />
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item
              label="GST Rate %"
              name="gstRatePercent"
              initialValue={12}
              style={{ width: '50%' }}
              extra="India GST slab for this medicine, used when billing at the counter"
            >
              <InputNumber min={0} max={28} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Pack contains (optional)" style={{ width: '50%' }}>
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="packSize" noStyle>
                  <InputNumber min={1} placeholder="e.g. 10" style={{ width: '50%' }} />
                </Form.Item>
                <Form.Item name="subUnit" noStyle>
                  <Input placeholder="e.g. tablet" style={{ width: '50%' }} />
                </Form.Item>
              </Space.Compact>
            </Form.Item>
          </Space.Compact>
          <Form.Item
            label="Schedule H1 / Controlled Drug"
            name="isControlledDrug"
            valuePropName="checked"
            initialValue={false}
            extra="Requires patient + prescribing doctor details to be recorded at every sale"
          >
            <Switch />
          </Form.Item>
          {!isCreate && (
            <Form.Item label="Active" name="isActive" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
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
            Expiry Date, Manufacturer, SKU. Existing medicines (matched by name) get updated; new ones get added.
          </Text>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => downloadFile('/api/shop/catalog/bulk-upload/template', 'medicine-catalog-template.csv')}
          >
            Download Template
          </Button>
          <Upload
            showUploadList={false}
            accept=".csv,.xlsx"
            customRequest={(opts) => { void handleBulkUpload(opts); }}
          >
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

      <Drawer
        title={<span><HistoryOutlined style={{ marginRight: 8, color: '#1677ff' }} />Stock History</span>}
        placement="right"
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        width={440}
        extra={
          <Button size="small" icon={<DownloadOutlined />} onClick={() => { setHistoryRange(null); setHistoryDownloadOpen(true); }}>
            Download
          </Button>
        }
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={() => setHistoryModalOpen(false)}>Close</Button>
          </Space>
        }
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : historyRows.length === 0 ? (
          <Alert type="info" showIcon message="No stock movements recorded yet" />
        ) : (
          <Collapse
            defaultActiveKey={Array.from(new Set(historyRows.map((m) => m.itemName))).slice(0, 1)}
            items={Object.entries(
              historyRows.reduce<Record<string, StockMovementRow[]>>((acc, m) => {
                (acc[m.itemName] ??= []).push(m);
                return acc;
              }, {}),
            )
              // Groups ordered by whichever medicine moved most recently.
              .sort(([, a], [, b]) => new Date(b[0].createdAt).getTime() - new Date(a[0].createdAt).getTime())
              .map(([itemName, movements]) => {
                const latest = movements[0];
                // Oldest-first within a medicine so the timeline reads like
                // an actual story — how this medicine's stock got to where
                // it is now — rather than newest-change-first.
                const chronological = movements.slice().reverse();
                return {
                  key: itemName,
                  label: (
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong>{itemName}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>now {latest.quantityAfter} · {movements.length} change{movements.length > 1 ? 's' : ''}</Text>
                    </Space>
                  ),
                  children: (
                    <Timeline
                      items={chronological.map((m) => ({
                        color: m.delta < 0 ? 'red' : m.reason === 'initial' ? 'blue' : 'green',
                        children: (
                          <div key={m.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Text strong style={{ textTransform: 'capitalize' }}>{m.reason}</Text>
                              <Text strong style={{ color: m.delta < 0 ? '#cf1322' : '#3f8600' }}>
                                {m.delta > 0 ? `+${m.delta}` : m.delta}
                              </Text>
                            </div>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              now {m.quantityAfter} · {new Date(m.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </Text>
                            {m.note && <div><Text type="secondary" style={{ fontSize: 12 }}>{m.note}</Text></div>}
                          </div>
                        ),
                      }))}
                    />
                  ),
                };
              })}
          />
        )}
      </Drawer>

      <Modal
        title="Download Stock History"
        open={historyDownloadOpen}
        onCancel={() => setHistoryDownloadOpen(false)}
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>Date range (optional)</Text>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              format="DD MMM YYYY"
              value={historyRange}
              onChange={(range) => setHistoryRange(range && range[0] && range[1] ? [range[0], range[1]] : null)}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Leave blank to download the full history.
            </Text>
          </div>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button icon={<DownloadOutlined />} loading={historyDownloading} onClick={() => void downloadStockHistory('csv')}>
              Download CSV
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} loading={historyDownloading} onClick={() => void downloadStockHistory('xlsx')}>
              Download Excel
            </Button>
          </Space>
        </Space>
      </Modal>

      <Modal
        title="Scan Barcode"
        open={barcodeModalOpen}
        onCancel={() => setBarcodeModalOpen(false)}
        footer={<Button onClick={() => setBarcodeModalOpen(false)}>Cancel</Button>}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Point your camera at a medicine&apos;s barcode. If it matches a SKU already on file, that medicine opens for
          editing; otherwise it opens Add Medicine with the code pre-filled.
        </Text>
        <div id="barcode-scanner-region" />
      </Modal>

      <Modal
        title="Scan Medicine Photos"
        open={scanModalOpen}
        onCancel={closeScanModal}
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeScanModal}>Cancel</Button>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={scanning}
              disabled={scanFileList.length === 0}
              onClick={() => void handleScan()}
            >
              Scan {scanFileList.length > 0 ? `${scanFileList.length} Photo${scanFileList.length > 1 ? 's' : ''}` : 'Photos'}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Text type="secondary">
            Add a few photos from different angles — front, back, a close-up of the batch/expiry line — and they&apos;ll
            be combined into one result. A single photo rarely shows everything printed on a box.
          </Text>
          <Upload
            listType="picture-card"
            multiple
            accept="image/*"
            capture="environment"
            fileList={scanFileList}
            beforeUpload={() => false}
            onChange={({ fileList }) => setScanFileList(fileList.slice(0, 4))}
            onRemove={(file) => setScanFileList((prev) => prev.filter((f) => f.uid !== file.uid))}
          >
            {scanFileList.length < 4 && (
              <div>
                <CameraOutlined />
                <div style={{ marginTop: 8 }}>Add Photo</div>
              </div>
            )}
          </Upload>
          <Text type="secondary" style={{ fontSize: 12 }}>Up to 4 photos.</Text>
        </Space>
      </Modal>

      <Drawer
        title={<span><ContainerOutlined style={{ marginRight: 8, color: '#1677ff' }} />Batches — {batchesFor?.name ?? ''}</span>}
        placement="right"
        open={!!batchesFor}
        onClose={closeBatches}
        width={420}
        destroyOnClose
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          Track separate expiry dates for the same medicine — e.g. an older batch still on the shelf next to a
          freshly restocked one. Adding a batch here also adds its quantity to this medicine&apos;s total stock above.
        </Text>

        <Form form={batchForm} layout="vertical" onFinish={addBatch} style={{ marginBottom: 16 }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item label="Batch Number" name="batchNumber" style={{ width: '40%' }}>
              <Input placeholder="e.g. B2024118" />
            </Form.Item>
            <Form.Item label="Expiry Date" name="expiryDate" style={{ width: '35%' }}>
              <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
            </Form.Item>
            <Form.Item
              label="Quantity"
              name="quantity"
              style={{ width: '25%' }}
              rules={[{ required: true, message: 'Required' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Space.Compact>
          <Button type="primary" htmlType="submit" loading={batchSaving} block>
            Add Batch
          </Button>
        </Form>

        {batchesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : batches.length === 0 ? (
          <Alert type="info" showIcon message="No batches recorded yet — only needed once you have more than one expiry date in stock for this medicine." />
        ) : (
          <List
            size="small"
            dataSource={batches}
            renderItem={(b) => (
              <List.Item
                actions={[
                  <Popconfirm key="remove" title="Remove this batch entry?" onConfirm={() => removeBatch(b.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />} loading={batchBusyId === b.id} />
                  </Popconfirm>,
                ]}
              >
                <Space direction="vertical" size={0}>
                  <Text strong>Batch {b.batchNumber ?? '—'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {b.quantity} units · expires {b.expiryDate ? dayjs(b.expiryDate).format('DD MMM YYYY') : '—'}
                  </Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Drawer>

      <Modal
        title={`Return / Damage — ${adjustFor?.name ?? ''}`}
        open={!!adjustFor}
        onCancel={() => setAdjustFor(null)}
        footer={null}
        destroyOnClose
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          A customer return adds stock back; damaged or expired stock being written off removes it. Both are
          logged in Stock History with their own reason so it&apos;s never confused with a manual correction.
        </Text>
        <Form form={adjustForm} layout="vertical" onFinish={submitAdjust}>
          <Form.Item label="Type" name="type" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'return', label: 'Customer Return (adds stock back)' },
                { value: 'damage', label: 'Damaged / Expired Write-off (removes stock)' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Quantity" name="quantity" rules={[{ required: true, message: 'Quantity is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Note (optional)" name="note">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={adjustSaving} block>Record</Button>
        </Form>
      </Modal>

      <Modal
        title={`Compare Suppliers — ${comparisonFor?.name ?? ''}`}
        open={!!comparisonFor}
        onCancel={() => setComparisonFor(null)}
        footer={<Button onClick={() => setComparisonFor(null)}>Close</Button>}
        destroyOnClose
      >
        <Form form={comparisonForm} layout="inline" onFinish={saveSupplierPrice} style={{ marginBottom: 16 }}>
          <Form.Item name="supplierId" rules={[{ required: true, message: 'Select a supplier' }]}>
            <Select
              placeholder="Supplier"
              style={{ width: 180 }}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              notFoundContent={<Text type="secondary" style={{ fontSize: 12 }}>Add suppliers on the Purchase Orders page first</Text>}
            />
          </Form.Item>
          <Form.Item name="priceCents" rules={[{ required: true, message: 'Price required' }]}>
            <InputNumber min={0.01} placeholder="Their price (Rs.)" prefix="Rs." />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={comparisonSaving}>Save Quote</Button>
          </Form.Item>
        </Form>

        {comparisonLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spin /></div>
        ) : comparisonQuotes.length === 0 ? (
          <Empty description="No supplier quotes recorded for this medicine yet" />
        ) : (
          <List
            size="small"
            dataSource={comparisonQuotes}
            renderItem={(q, i) => (
              <List.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong={i === 0}>{q.supplierName}{i === 0 && <Tag color="green" style={{ marginLeft: 8 }}>Cheapest</Tag>}</Text>
                  <Text>Rs.{(q.priceCents / 100).toFixed(2)}</Text>
                </Space>
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  );
}
