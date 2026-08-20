'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Drawer, Modal, Form, Input,
  InputNumber, Select, DatePicker, List, Empty, Tabs, Segmented, Descriptions, Divider, Card, Statistic, Row, Col, Tooltip, theme,
} from 'antd';
import {
  PlusOutlined, FileTextOutlined, TeamOutlined, ShoppingOutlined, DollarOutlined,
  DeleteOutlined, EyeOutlined, CreditCardOutlined, BarcodeOutlined, BarChartOutlined,
  SearchOutlined, InfoCircleOutlined, ShoppingCartOutlined, WalletOutlined,
} from '@ant-design/icons';
import type { Html5QrcodeScanner } from 'html5-qrcode';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import axios from 'axios';
import { apiCall } from '../../../lib/api';

const { Title, Text } = Typography;

interface CatalogItemOption {
  id: string;
  name: string;
  unit: string;
  priceCents: number;
  gstRatePercent: number;
  isControlledDrug: boolean;
  quantity: number;
  sku?: string | null;
}

interface SaleLineItem {
  catalogItemId?: string;
  name: string;
  quantity: number;
  unit: string;
  priceCentsPerUnit: number;
  gstRatePercent: number;
  lineSubtotalCents: number;
  lineGstCents: number;
  lineTotalCents: number;
  isControlledDrug?: boolean;
}

interface ControlledDrugInfo {
  patientName: string;
  patientAddress?: string;
  doctorName: string;
  doctorRegNo: string;
}

type PaymentMode = 'cash' | 'upi' | 'card' | 'credit';

interface SaleRow {
  id: string;
  invoiceNumber: number;
  customerId?: string;
  customerNameSnapshot?: string;
  items: SaleLineItem[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  paymentMode: PaymentMode;
  amountPaidCents: number;
  controlledDrugInfo?: ControlledDrugInfo;
  createdAt: string;
}

interface CustomerRow {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  outstandingDueCents: number;
  isActive: boolean;
}

interface LedgerEntry {
  id: string;
  type: 'sale' | 'payment';
  amountCents: number;
  balanceAfterCents: number;
  saleId?: string;
  note?: string;
  createdAt: string;
}

interface ReconciliationSummary {
  date: string;
  byPaymentMode: Record<PaymentMode, { count: number; totalCents: number }>;
  creditCollectedTodayCents: number;
  grandTotalCents: number;
}

interface DayRevenue {
  date: string;
  revenueCents: number;
  saleCount: number;
}

interface MedicineSalesTotal {
  name: string;
  quantity: number;
  revenueCents: number;
}

interface SalesAnalytics {
  from: string;
  to: string;
  totalRevenueCents: number;
  totalGstCents: number;
  saleCount: number;
  revenueByDay: DayRevenue[];
  topMedicinesByQuantity: MedicineSalesTotal[];
  topMedicinesByRevenue: MedicineSalesTotal[];
}

const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'credit', label: 'Credit (bill to customer)' },
];

const PAYMENT_MODE_COLORS: Record<PaymentMode, string> = {
  cash: 'green', upi: 'blue', card: 'purple', credit: 'orange',
};

function formatRs(cents: number): string {
  return `Rs.${(cents / 100).toFixed(2)}`;
}

interface SaleFormItem {
  catalogItemId?: string;
  name?: string;
  quantity: number;
}

interface SaleFormValues {
  customerId?: string;
  items: SaleFormItem[];
  paymentMode: PaymentMode;
  amountPaidCents?: number;
  patientName?: string;
  patientAddress?: string;
  doctorName?: string;
  doctorRegNo?: string;
  note?: string;
}

function StepHeading({ step, children, noMargin }: { step: number; children: React.ReactNode; noMargin?: boolean }) {
  const { token } = theme.useToken();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: noMargin ? 0 : 12 }}>
      <span
        style={{
          width: 22, height: 22, borderRadius: '50%', background: token.colorPrimary, color: '#fff',
          fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        {step}
      </span>
      <Text strong style={{ fontSize: 13 }}>{children}</Text>
    </div>
  );
}

function StatCard({ icon, color, title, value, suffix, footnote }: {
  icon: React.ReactNode; color: string; title: string; value: string | number; suffix?: string; footnote?: React.ReactNode;
}) {
  return (
    <Card size="small">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10, background: `${color}1f`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <Statistic title={title} value={value} suffix={suffix} valueStyle={{ color }} />
          {footnote}
        </div>
      </div>
    </Card>
  );
}

export default function BillingPage() {
  const { token } = theme.useToken();
  const [activeTab, setActiveTab] = useState('new-sale');
  // Reconciliation/Analytics are owner-only on the backend
  // (requireShopOwner.middleware.ts) — hide the Reports tab entirely to
  // match rather than let a cashier click into a tab that just 403s.
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
      const parsed = raw ? JSON.parse(raw) : {};
      setIsOwner(parsed.shopStaffRole !== 'cashier');
    } catch { setIsOwner(true); }
  }, []);
  const [catalogItems, setCatalogItems] = useState<CatalogItemOption[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form] = Form.useForm<SaleFormValues>();
  const [saving, setSaving] = useState(false);
  const watchedItems = Form.useWatch('items', form) ?? [];
  const watchedCustomerId = Form.useWatch('customerId', form);
  const watchedPaymentMode = Form.useWatch('paymentMode', form);

  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const catalogItemsRef = useRef<CatalogItemOption[]>([]);
  useEffect(() => { catalogItemsRef.current = catalogItems; }, [catalogItems]);

  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [customerForm] = Form.useForm<{ name: string; phone?: string; address?: string }>();
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const [ledgerFor, setLedgerFor] = useState<CustomerRow | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [paymentForm] = Form.useForm<{ amount: number; note?: string }>();
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [salesSearch, setSalesSearch] = useState('');
  const [salesPaymentFilter, setSalesPaymentFilter] = useState<PaymentMode | undefined>(undefined);

  const [reportView, setReportView] = useState<'reconciliation' | 'analytics' | 'h1-register'>('reconciliation');

  const [reconDate, setReconDate] = useState(dayjs());
  const [reconciliation, setReconciliation] = useState<ReconciliationSummary | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  const [h1Rows, setH1Rows] = useState<SaleRow[]>([]);
  const [h1Loading, setH1Loading] = useState(false);

  const [analyticsRange, setAnalyticsRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogResult, customersResult, salesResult] = await Promise.all([
        apiCall('GET', '/api/shop/catalog'),
        apiCall('GET', '/api/shop/customers'),
        apiCall('GET', '/api/shop/sales'),
      ]);
      setCatalogItems(catalogResult.data ?? catalogResult);
      setCustomers(customersResult.data ?? customersResult);
      setSales(salesResult.data ?? salesResult);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load billing data');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchReconciliation = useCallback(async (date: string) => {
    setReconLoading(true);
    try {
      const result = await apiCall('GET', `/api/shop/reports/daily-reconciliation?date=${date}`);
      setReconciliation(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load reconciliation');
    } finally { setReconLoading(false); }
  }, []);

  const fetchH1 = useCallback(async () => {
    setH1Loading(true);
    try {
      const result = await apiCall('GET', '/api/shop/sales/controlled-drug-register');
      setH1Rows(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load register');
    } finally { setH1Loading(false); }
  }, []);

  const fetchAnalytics = useCallback(async (from: string, to: string) => {
    setAnalyticsLoading(true);
    try {
      const result = await apiCall('GET', `/api/shop/reports/analytics?from=${from}&to=${to}`);
      setAnalytics(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load analytics');
    } finally { setAnalyticsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab !== 'reports') return;
    if (reportView === 'reconciliation') void fetchReconciliation(reconDate.format('YYYY-MM-DD'));
    if (reportView === 'h1-register') void fetchH1();
    if (reportView === 'analytics') void fetchAnalytics(analyticsRange[0].format('YYYY-MM-DD'), analyticsRange[1].format('YYYY-MM-DD'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportView]);

  // ── At-a-glance stats — computed client-side from data every shop user
  // (not just the owner) can already see, so they show up regardless of
  // permission, unlike the gated Reports tab. ─────────────────────────────
  const todayStats = useMemo(() => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    const todaySales = sales.filter((s) => dayjs(s.createdAt).format('YYYY-MM-DD') === todayStr);
    const revenueCents = todaySales.reduce((sum, s) => sum + s.totalCents, 0);
    const totalDueCents = customers.reduce((sum, c) => sum + c.outstandingDueCents, 0);
    const customersWithDue = customers.filter((c) => c.outstandingDueCents > 0).length;
    return { count: todaySales.length, revenueCents, totalDueCents, customersWithDue };
  }, [sales, customers]);

  // ── New Sale computations (live preview as the form changes) ─────────
  const resolveItem = (formItem: SaleFormItem): CatalogItemOption | undefined =>
    catalogItems.find((c) => c.id === formItem.catalogItemId);

  const linePreview = (formItem: SaleFormItem) => {
    const catalogItem = resolveItem(formItem);
    const qty = formItem.quantity || 0;
    const priceCentsPerUnit = catalogItem?.priceCents ?? 0;
    const gstRatePercent = catalogItem?.gstRatePercent ?? 12;
    const lineSubtotalCents = priceCentsPerUnit * qty;
    const lineGstCents = Math.round((lineSubtotalCents * gstRatePercent) / 100);
    return { lineSubtotalCents, lineGstCents, lineTotalCents: lineSubtotalCents + lineGstCents };
  };

  const previewTotals = (watchedItems as SaleFormItem[]).reduce(
    (acc, item) => {
      const p = linePreview(item || { quantity: 0 });
      return {
        subtotal: acc.subtotal + p.lineSubtotalCents,
        gst: acc.gst + p.lineGstCents,
        total: acc.total + p.lineTotalCents,
      };
    },
    { subtotal: 0, gst: 0, total: 0 },
  );

  const hasControlledDrugInCart = (watchedItems as SaleFormItem[]).some(
    (item) => resolveItem(item || {})?.isControlledDrug,
  );

  const resetSaleForm = () => {
    form.resetFields();
    form.setFieldsValue({ items: [{ quantity: 1 }], paymentMode: 'cash' });
  };

  useEffect(() => { resetSaleForm(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Matched against a catalog item's SKU field — same matching convention
  // as the Medicine List's barcode scanner. Scanning the same medicine
  // twice increments its quantity instead of adding a duplicate line.
  const addOrIncrementItemBySku = (sku: string) => {
    const catalogItem = catalogItemsRef.current.find((c) => c.sku?.toLowerCase() === sku.toLowerCase());
    if (!catalogItem) {
      message.info(`No medicine with SKU "${sku}" found in your catalog`);
      return;
    }
    if (catalogItem.quantity <= 0) {
      message.warning(`"${catalogItem.name}" is out of stock`);
      return;
    }
    const currentItems: SaleFormItem[] = form.getFieldValue('items') ?? [];
    const existingIndex = currentItems.findIndex((i) => i.catalogItemId === catalogItem.id);
    if (existingIndex >= 0) {
      const updated = [...currentItems];
      const existing = updated[existingIndex];
      updated[existingIndex] = { ...existing, quantity: Math.min((existing.quantity || 0) + 1, catalogItem.quantity) };
      form.setFieldValue('items', updated);
    } else {
      const withoutEmpty = currentItems.filter((i) => i.catalogItemId || i.name);
      form.setFieldValue('items', [...withoutEmpty, { catalogItemId: catalogItem.id, quantity: 1 }]);
    }
    message.success(`Added ${catalogItem.name}`);
  };

  useEffect(() => {
    if (!barcodeOpen) return;
    let cancelled = false;

    (async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      if (cancelled) return;
      const scanner = new Html5QrcodeScanner('billing-barcode-region', { fps: 10, qrbox: 250 }, false);
      scannerRef.current = scanner;
      scanner.render(
        (decodedText) => {
          addOrIncrementItemBySku(decodedText);
        },
        () => { /* ignore per-frame decode misses */ },
      );
    })();

    return () => {
      cancelled = true;
      scannerRef.current?.clear().catch(() => { /* already cleared */ });
      scannerRef.current = null;
    };
    // Scoped to barcodeOpen only, same reasoning as the Medicine List's
    // scanner effect — form/addOrIncrementItemBySku don't need to
    // retrigger this (that would tear down and restart the camera).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeOpen]);

  const submitSale = async (values: SaleFormValues) => {
    setSaving(true);
    try {
      const items = values.items
        .filter((i) => i.catalogItemId || i.name)
        .map((i) => {
          const catalogItem = resolveItem(i);
          return {
            catalogItemId: i.catalogItemId,
            name: catalogItem?.name ?? i.name ?? '',
            quantity: i.quantity,
          };
        });
      const payload = {
        customerId: values.customerId || undefined,
        items,
        paymentMode: values.paymentMode,
        amountPaidCents:
          values.paymentMode === 'credit' ? Math.round((values.amountPaidCents ?? 0) * 100) : undefined,
        controlledDrugInfo: hasControlledDrugInCart
          ? {
            patientName: values.patientName,
            patientAddress: values.patientAddress,
            doctorName: values.doctorName,
            doctorRegNo: values.doctorRegNo,
          }
          : undefined,
        note: values.note?.trim() || undefined,
      };
      const result = await apiCall('POST', '/api/shop/sales', payload);
      const sale = (result.data ?? result) as SaleRow;
      message.success(`Invoice #${sale.invoiceNumber} created`);
      resetSaleForm();
      setReceiptSale(sale);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to create sale');
      else message.error('An unexpected error occurred');
    } finally { setSaving(false); }
  };

  // ── Customers ───────────────────────────────────────────────────────
  const openCustomerForm = () => { customerForm.resetFields(); setCustomerFormOpen(true); };

  const addCustomer = async (values: { name: string; phone?: string; address?: string }) => {
    setCustomerSaving(true);
    try {
      await apiCall('POST', '/api/shop/customers', values);
      message.success('Customer added');
      setCustomerFormOpen(false);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to add customer');
      else message.error('An unexpected error occurred');
    } finally { setCustomerSaving(false); }
  };

  const openLedger = async (customer: CustomerRow) => {
    setLedgerFor(customer);
    paymentForm.resetFields();
    setLedgerLoading(true);
    try {
      const result = await apiCall('GET', `/api/shop/customers/${customer.id}/ledger`);
      setLedgerEntries(result.data ?? result);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to load ledger');
    } finally { setLedgerLoading(false); }
  };

  const recordPayment = async (values: { amount: number; note?: string }) => {
    if (!ledgerFor) return;
    setPaymentSaving(true);
    try {
      await apiCall('POST', `/api/shop/customers/${ledgerFor.id}/payments`, {
        amountCents: Math.round(values.amount * 100),
        note: values.note?.trim() || undefined,
      });
      message.success('Payment recorded');
      paymentForm.resetFields();
      const result = await apiCall('GET', `/api/shop/customers/${ledgerFor.id}/ledger`);
      setLedgerEntries(result.data ?? result);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to record payment');
      else message.error('An unexpected error occurred');
    } finally { setPaymentSaving(false); }
  };

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    return sales.filter((s) => {
      if (salesPaymentFilter && s.paymentMode !== salesPaymentFilter) return false;
      if (!q) return true;
      const customerName = (s.customerNameSnapshot || customers.find((c) => c.id === s.customerId)?.name || '').toLowerCase();
      return String(s.invoiceNumber).includes(q) || customerName.includes(q);
    });
  }, [sales, salesSearch, salesPaymentFilter, customers]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  }, [customers, customerSearch]);

  const saleColumns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
    { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => dayjs(v).format('DD MMM YYYY, h:mm A') },
    {
      title: 'Customer', key: 'customer',
      render: (_: unknown, s: SaleRow) => s.customerNameSnapshot || customers.find((c) => c.id === s.customerId)?.name || <Text type="secondary">Walk-in</Text>,
    },
    { title: 'Payment', dataIndex: 'paymentMode', key: 'paymentMode', render: (v: PaymentMode) => <Tag color={PAYMENT_MODE_COLORS[v]}>{v.toUpperCase()}</Tag> },
    { title: 'Total', dataIndex: 'totalCents', key: 'totalCents', render: (v: number) => <Text strong>{formatRs(v)}</Text> },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, s: SaleRow) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setReceiptSale(s)}>View</Button>
      ),
    },
  ];

  const customerColumns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', render: (v?: string) => v || '—' },
    {
      title: 'Outstanding Due', dataIndex: 'outstandingDueCents', key: 'outstandingDueCents',
      render: (v: number) => v > 0 ? <Text type="danger" strong>{formatRs(v)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, c: CustomerRow) => (
        <Button size="small" icon={<CreditCardOutlined />} onClick={() => void openLedger(c)}>Ledger / Settle Due</Button>
      ),
    },
  ];

  const h1Columns = [
    { title: 'Invoice #', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
    { title: 'Date', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => dayjs(v).format('DD MMM YYYY, h:mm A') },
    { title: 'Patient', key: 'patient', render: (_: unknown, s: SaleRow) => s.controlledDrugInfo?.patientName },
    { title: 'Address', key: 'address', render: (_: unknown, s: SaleRow) => s.controlledDrugInfo?.patientAddress || '—' },
    { title: 'Doctor', key: 'doctor', render: (_: unknown, s: SaleRow) => s.controlledDrugInfo?.doctorName },
    { title: 'Reg. No', key: 'regNo', render: (_: unknown, s: SaleRow) => s.controlledDrugInfo?.doctorRegNo },
    {
      title: 'Medicine(s)', key: 'items',
      render: (_: unknown, s: SaleRow) => s.items.filter((i) => i.isControlledDrug).map((i) => `${i.name} x${i.quantity}`).join(', '),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ margin: '0 0 4px' }}>
        <FileTextOutlined style={{ marginRight: 8 }} />Billing
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Ring up a sale, track what customers owe you, and see how the shop is doing.
      </Text>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={8}>
              <StatCard
                icon={<ShoppingCartOutlined />}
                color={token.colorPrimary}
                title="Sales Today"
                value={todayStats.count}
                suffix="invoices"
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                icon={<DollarOutlined />}
                color={token.colorSuccess}
                title="Revenue Today"
                value={formatRs(todayStats.revenueCents)}
              />
            </Col>
            <Col xs={24} sm={8}>
              <StatCard
                icon={<WalletOutlined />}
                color={todayStats.totalDueCents > 0 ? token.colorError : token.colorTextTertiary}
                title="Outstanding Dues"
                value={formatRs(todayStats.totalDueCents)}
                footnote={todayStats.customersWithDue > 0 && (
                  <Text type="secondary" style={{ fontSize: 12 }}>across {todayStats.customersWithDue} customer{todayStats.customersWithDue > 1 ? 's' : ''}</Text>
                )}
              />
            </Col>
          </Row>

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={([
              {
                key: 'new-sale',
                label: <span><ShoppingOutlined /> New Sale</span>,
                children: (
                  <div style={{ maxWidth: 720 }}>
                    <Form form={form} layout="vertical" onFinish={submitSale}>
                      <Card size="small" style={{ marginBottom: 16 }}>
                        <StepHeading step={1}>Who&apos;s this for?</StepHeading>
                        <Form.Item label="Customer (optional for cash/UPI/card)" name="customerId" style={{ marginBottom: 0 }}>
                          <Select
                            allowClear
                            showSearch
                            placeholder="Walk-in customer"
                            optionFilterProp="label"
                            options={customers.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` (${c.phone})` : ''}` }))}
                          />
                        </Form.Item>
                      </Card>

                      <Card size="small" style={{ marginBottom: 16 }}>
                        <Form.List name="items">
                          {(fields, { add, remove }) => (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                <StepHeading step={2} noMargin>What are they buying?</StepHeading>
                                <Button size="small" icon={<BarcodeOutlined />} onClick={() => setBarcodeOpen(true)}>
                                  Scan Barcode
                                </Button>
                              </div>
                              {fields.length === 0 && (
                                <Empty description="Add a medicine to start the sale" style={{ margin: '12px 0' }} />
                              )}
                              {fields.map(({ key, name, ...rest }) => {
                                const formItem = (watchedItems as SaleFormItem[])[name] ?? { quantity: 1 };
                                const preview = linePreview(formItem);
                                const catalogItem = resolveItem(formItem);
                                return (
                                  <div key={key} style={{ marginBottom: 8, padding: 10, background: token.colorFillTertiary, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8 }}>
                                    <Space align="baseline" wrap style={{ width: '100%' }}>
                                      <Form.Item {...rest} name={[name, 'catalogItemId']} style={{ marginBottom: 4, width: 220 }}>
                                        <Select
                                          showSearch
                                          placeholder="Select medicine"
                                          optionFilterProp="label"
                                          options={catalogItems.map((c) => ({
                                            value: c.id,
                                            label: `${c.name} (${c.quantity} ${c.unit} left)`,
                                            disabled: c.quantity <= 0,
                                          }))}
                                        />
                                      </Form.Item>
                                      <Form.Item {...rest} name={[name, 'quantity']} initialValue={1} rules={[{ required: true, message: 'Qty required' }]} style={{ marginBottom: 4, width: 90 }}>
                                        <InputNumber min={1} max={catalogItem?.quantity} placeholder="Qty" style={{ width: '100%' }} />
                                      </Form.Item>
                                      <Button type="text" icon={<DeleteOutlined />} danger onClick={() => remove(name)} />
                                    </Space>
                                    {catalogItem && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                          {formatRs(catalogItem.priceCents)}/{catalogItem.unit} · GST {catalogItem.gstRatePercent}%
                                          {catalogItem.isControlledDrug && (
                                            <Tooltip title="A prescription/controlled medicine — patient &amp; doctor details will be required below">
                                              <Tag color="red" style={{ marginLeft: 6 }}>Prescription required</Tag>
                                            </Tooltip>
                                          )}
                                        </Text>
                                        <Text strong style={{ fontSize: 13 }}>{formatRs(preview.lineTotalCents)}</Text>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <Button type="dashed" onClick={() => add({ quantity: 1 })} block icon={<PlusOutlined />}>
                                Add Item
                              </Button>
                            </>
                          )}
                        </Form.List>

                        <Divider style={{ margin: '16px 0 12px' }} />

                        <div style={{ background: token.colorPrimaryBg, border: `1px solid ${token.colorPrimaryBorder}`, borderRadius: 8, padding: '12px 16px' }}>
                          <Descriptions column={1} size="small">
                            <Descriptions.Item label="Subtotal">{formatRs(previewTotals.subtotal)}</Descriptions.Item>
                            <Descriptions.Item label="GST">{formatRs(previewTotals.gst)}</Descriptions.Item>
                          </Descriptions>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <Text strong style={{ fontSize: 14 }}>Total to Collect</Text>
                            <Text strong style={{ fontSize: 22, color: token.colorPrimary }}>{formatRs(previewTotals.total)}</Text>
                          </div>
                        </div>
                      </Card>

                      {hasControlledDrugInCart && (
                        <Card size="small" style={{ marginBottom: 16, borderColor: '#faad14' }}>
                          <Alert
                            type="warning"
                            showIcon
                            message="This sale includes a controlled/prescription medicine (Schedule H1)"
                            description="Indian law requires the patient and prescribing doctor's details to be recorded for this sale — they'll show up later in your Controlled Drug Register."
                            style={{ marginBottom: 12 }}
                          />
                          <Space.Compact style={{ width: '100%' }}>
                            <Form.Item label="Patient Name" name="patientName" rules={[{ required: true, message: 'Required' }]} style={{ width: '50%' }}>
                              <Input />
                            </Form.Item>
                            <Form.Item label="Patient Address (optional)" name="patientAddress" style={{ width: '50%' }}>
                              <Input />
                            </Form.Item>
                          </Space.Compact>
                          <Space.Compact style={{ width: '100%' }}>
                            <Form.Item label="Doctor Name" name="doctorName" rules={[{ required: true, message: 'Required' }]} style={{ width: '50%' }}>
                              <Input />
                            </Form.Item>
                            <Form.Item label="Doctor Registration No." name="doctorRegNo" rules={[{ required: true, message: 'Required' }]} style={{ width: '50%' }}>
                              <Input />
                            </Form.Item>
                          </Space.Compact>
                        </Card>
                      )}

                      <Card size="small" style={{ marginBottom: 16 }}>
                        <StepHeading step={3}>How are they paying?</StepHeading>
                        <Form.Item label="Payment Mode" name="paymentMode" rules={[{ required: true }]} initialValue="cash" style={{ marginBottom: watchedPaymentMode === 'credit' ? 12 : 0 }}>
                          <Select options={PAYMENT_MODE_OPTIONS} />
                        </Form.Item>

                        {watchedPaymentMode === 'credit' && (
                          <>
                            {!watchedCustomerId && (
                              <Alert type="error" showIcon message="A credit sale must be billed to a customer — select one above" style={{ marginBottom: 12 }} />
                            )}
                            <Form.Item
                              label="Amount Paid Now (optional, rest becomes due)"
                              name="amountPaidCents"
                              extra={`Total is ${formatRs(previewTotals.total)} — leave blank if nothing is paid upfront`}
                              style={{ marginBottom: 0 }}
                            >
                              <InputNumber min={0} max={previewTotals.total / 100} style={{ width: '100%' }} prefix="Rs." />
                            </Form.Item>
                          </>
                        )}
                      </Card>

                      <Form.Item label="Note (optional)" name="note">
                        <Input.TextArea rows={2} placeholder="Anything worth remembering about this sale" />
                      </Form.Item>

                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={saving}
                        disabled={watchedPaymentMode === 'credit' && !watchedCustomerId}
                        block
                        size="large"
                      >
                        Complete Sale — {formatRs(previewTotals.total)}
                      </Button>
                    </Form>
                  </div>
                ),
              },
              {
                key: 'sales',
                label: <span><FileTextOutlined /> Sales History</span>,
                children: (
                  <div>
                    <Space wrap style={{ marginBottom: 12 }}>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search invoice # or customer"
                        style={{ width: 240 }}
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                      />
                      <Select
                        allowClear
                        placeholder="All payment modes"
                        style={{ width: 180 }}
                        value={salesPaymentFilter}
                        onChange={setSalesPaymentFilter}
                        options={PAYMENT_MODE_OPTIONS}
                      />
                    </Space>
                    {filteredSales.length === 0 ? (
                      <Empty description={sales.length === 0 ? 'No sales recorded yet' : 'No sales match your filters'} />
                    ) : (
                      <Table columns={saleColumns} dataSource={filteredSales.map((s) => ({ ...s, key: s.id }))} bordered size="middle" scroll={{ x: true }} />
                    )}
                  </div>
                ),
              },
              {
                key: 'customers',
                label: <span><TeamOutlined /> Customers</span>,
                children: (
                  <div>
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
                      <Input
                        allowClear
                        prefix={<SearchOutlined />}
                        placeholder="Search name or phone"
                        style={{ width: 240 }}
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                      <Button type="primary" icon={<PlusOutlined />} onClick={openCustomerForm}>
                        New Customer
                      </Button>
                    </Space>
                    <Table columns={customerColumns} dataSource={filteredCustomers.map((c) => ({ ...c, key: c.id }))} bordered size="middle" scroll={{ x: 'max-content' }} />
                  </div>
                ),
              },
              ...(isOwner ? [{
                key: 'reports',
                label: <span><BarChartOutlined /> Reports</span>,
                children: (
                  <div>
                    <Segmented
                      style={{ marginBottom: 20 }}
                      value={reportView}
                      onChange={(v) => setReportView(v as typeof reportView)}
                      options={[
                        { label: 'Daily Cash Reconciliation', value: 'reconciliation' },
                        { label: 'Sales Analytics', value: 'analytics' },
                        { label: 'Controlled Drug Register', value: 'h1-register' },
                      ]}
                    />

                    {reportView === 'reconciliation' && (
                      <div style={{ maxWidth: 480 }}>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                          What you should have collected in cash/UPI/card today, and how much of that came from
                          customers finally paying off old dues.
                        </Text>
                        <DatePicker
                          value={reconDate}
                          onChange={(d) => { const picked = d ?? dayjs(); setReconDate(picked); void fetchReconciliation(picked.format('YYYY-MM-DD')); }}
                          style={{ marginBottom: 16 }}
                        />
                        {reconLoading ? (
                          <Spin />
                        ) : reconciliation ? (
                          <>
                            <Table
                              pagination={false}
                              bordered
                              size="small"
                              scroll={{ x: 'max-content' }}
                              dataSource={PAYMENT_MODE_OPTIONS.map((m) => ({
                                key: m.value,
                                mode: m.label,
                                count: reconciliation.byPaymentMode[m.value].count,
                                total: reconciliation.byPaymentMode[m.value].totalCents,
                              }))}
                              columns={[
                                { title: 'Payment Mode', dataIndex: 'mode', key: 'mode' },
                                { title: 'Sales', dataIndex: 'count', key: 'count' },
                                { title: 'Collected', dataIndex: 'total', key: 'total', render: (v: number) => formatRs(v) },
                              ]}
                            />
                            <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
                              <Descriptions.Item label="Old dues settled today">{formatRs(reconciliation.creditCollectedTodayCents)}</Descriptions.Item>
                              <Descriptions.Item label={<Text strong>Total cash/collections in hand today</Text>}>
                                <Text strong style={{ fontSize: 16 }}>{formatRs(reconciliation.grandTotalCents)}</Text>
                              </Descriptions.Item>
                            </Descriptions>
                          </>
                        ) : (
                          <Empty description="No data" />
                        )}
                      </div>
                    )}

                    {reportView === 'analytics' && (
                      <div>
                        <DatePicker.RangePicker
                          value={analyticsRange}
                          onChange={(range) => {
                            if (!range || !range[0] || !range[1]) return;
                            const picked: [Dayjs, Dayjs] = [range[0], range[1]];
                            setAnalyticsRange(picked);
                            void fetchAnalytics(picked[0].format('YYYY-MM-DD'), picked[1].format('YYYY-MM-DD'));
                          }}
                          style={{ marginBottom: 16 }}
                        />
                        {analyticsLoading ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
                        ) : !analytics ? (
                          <Empty description="No data" />
                        ) : (
                          <>
                            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                              <Col xs={24} sm={12} md={8}>
                                <Card size="small"><Statistic title="Revenue" value={formatRs(analytics.totalRevenueCents)} /></Card>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Card size="small"><Statistic title="GST Collected" value={formatRs(analytics.totalGstCents)} /></Card>
                              </Col>
                              <Col xs={24} sm={12} md={8}>
                                <Card size="small"><Statistic title="Invoices" value={analytics.saleCount} /></Card>
                              </Col>
                            </Row>

                            <Text strong style={{ display: 'block', marginBottom: 8 }}>Revenue by Day</Text>
                            {analytics.revenueByDay.length === 0 ? (
                              <Empty description="No sales in this range" style={{ marginBottom: 24 }} />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, marginBottom: 24, overflowX: 'auto', padding: '0 4px' }}>
                                {analytics.revenueByDay.map((d) => {
                                  const maxRevenue = Math.max(...analytics.revenueByDay.map((x) => x.revenueCents), 1);
                                  const heightPct = Math.max((d.revenueCents / maxRevenue) * 100, 4);
                                  return (
                                    <Tooltip key={d.date} title={`${dayjs(d.date).format('DD MMM')} — ${formatRs(d.revenueCents)} (${d.saleCount} sale${d.saleCount > 1 ? 's' : ''})`}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                                        <div style={{
                                          width: 22, height: `${heightPct}%`, minHeight: 4, borderRadius: '4px 4px 2px 2px',
                                          background: 'linear-gradient(180deg, #4096ff 0%, #1677ff 100%)',
                                        }}
                                        />
                                        <Text style={{ fontSize: 9, marginTop: 4, whiteSpace: 'nowrap' }}>{dayjs(d.date).format('D MMM')}</Text>
                                      </div>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            )}

                            <Row gutter={[16, 16]}>
                              <Col xs={24} md={12}>
                                <Text strong style={{ display: 'block', marginBottom: 8 }}>Best Sellers (by quantity)</Text>
                                <Table
                                  size="small"
                                  pagination={false}
                                  scroll={{ x: 'max-content' }}
                                  dataSource={analytics.topMedicinesByQuantity.map((m, i) => ({ ...m, key: i }))}
                                  columns={[
                                    { title: 'Medicine', dataIndex: 'name', key: 'name' },
                                    { title: 'Qty Sold', dataIndex: 'quantity', key: 'quantity' },
                                  ]}
                                />
                              </Col>
                              <Col xs={24} md={12}>
                                <Text strong style={{ display: 'block', marginBottom: 8 }}>Top Revenue Medicines</Text>
                                <Table
                                  size="small"
                                  pagination={false}
                                  scroll={{ x: 'max-content' }}
                                  dataSource={analytics.topMedicinesByRevenue.map((m, i) => ({ ...m, key: i }))}
                                  columns={[
                                    { title: 'Medicine', dataIndex: 'name', key: 'name' },
                                    { title: 'Revenue', dataIndex: 'revenueCents', key: 'revenueCents', render: (v: number) => formatRs(v) },
                                  ]}
                                />
                              </Col>
                            </Row>
                          </>
                        )}
                      </div>
                    )}

                    {reportView === 'h1-register' && (
                      <div>
                        <Alert
                          type="info"
                          showIcon
                          icon={<InfoCircleOutlined />}
                          message="Schedule H1 register"
                          description="Indian pharmacy law requires a record of every sale of a controlled/prescription medicine, with the patient and prescribing doctor's details — this is that record, built automatically from your sales."
                          style={{ marginBottom: 16 }}
                        />
                        {h1Loading ? (
                          <Spin />
                        ) : h1Rows.length === 0 ? (
                          <Empty description="No controlled-drug sales recorded yet" />
                        ) : (
                          <Table columns={h1Columns} dataSource={h1Rows.map((s) => ({ ...s, key: s.id }))} bordered size="small" scroll={{ x: true }} />
                        )}
                      </div>
                    )}
                  </div>
                ),
              }] : []),
            ] as { key: string; label: React.ReactNode; children: React.ReactNode }[])}
          />
        </>
      )}

      <Modal
        title="New Customer"
        open={customerFormOpen}
        onCancel={() => setCustomerFormOpen(false)}
        footer={null}
      >
        <Form form={customerForm} layout="vertical" onFinish={addCustomer}>
          <Form.Item label="Name" name="name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item label="Phone" name="phone">
            <Input />
          </Form.Item>
          <Form.Item label="Address" name="address">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={customerSaving} block>Add Customer</Button>
        </Form>
      </Modal>

      <Drawer
        title={`Ledger — ${ledgerFor?.name ?? ''}`}
        placement="right"
        open={!!ledgerFor}
        onClose={() => setLedgerFor(null)}
        size={420}
      >
        {ledgerFor && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Outstanding Due">
                <Text strong type={ledgerFor.outstandingDueCents > 0 ? 'danger' : undefined}>
                  {formatRs(ledgerFor.outstandingDueCents)}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            {ledgerFor.outstandingDueCents > 0 && (
              <Form form={paymentForm} layout="inline" onFinish={recordPayment} style={{ marginBottom: 16 }}>
                <Form.Item name="amount" rules={[{ required: true, message: 'Amount required' }]}>
                  <InputNumber min={0.01} placeholder="Amount received" prefix="Rs." />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={paymentSaving}>Record Payment</Button>
                </Form.Item>
              </Form>
            )}

            {ledgerLoading ? (
              <Spin />
            ) : ledgerEntries.length === 0 ? (
              <Empty description="No ledger entries yet" />
            ) : (
              <List
                size="small"
                dataSource={ledgerEntries}
                renderItem={(e) => (
                  <List.Item>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text strong style={{ textTransform: 'capitalize' }}>{e.type}</Text>
                        <Text strong style={{ color: e.amountCents < 0 ? '#3f8600' : '#cf1322' }}>
                          {e.amountCents > 0 ? `+${formatRs(e.amountCents)}` : formatRs(e.amountCents)}
                        </Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        balance {formatRs(e.balanceAfterCents)} · {dayjs(e.createdAt).format('DD MMM YYYY, h:mm A')}
                        {e.note ? ` · ${e.note}` : ''}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </>
        )}
      </Drawer>

      <Modal
        title={receiptSale ? `Invoice #${receiptSale.invoiceNumber}` : ''}
        open={!!receiptSale}
        onCancel={() => setReceiptSale(null)}
        footer={<Button type="primary" onClick={() => setReceiptSale(null)}>Done</Button>}
        width={480}
      >
        {receiptSale && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              {dayjs(receiptSale.createdAt).format('DD MMM YYYY, h:mm A')}
              {' · '}{receiptSale.customerNameSnapshot || customers.find((c) => c.id === receiptSale.customerId)?.name || 'Walk-in'}
            </Text>
            <List
              size="small"
              bordered
              dataSource={receiptSale.items}
              renderItem={(i) => (
                <List.Item>
                  <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text>{i.name} x{i.quantity}</Text>
                      <Text>{formatRs(i.lineTotalCents)}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatRs(i.priceCentsPerUnit)}/{i.unit} + {i.gstRatePercent}% GST
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
            <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
              <Descriptions.Item label="Subtotal">{formatRs(receiptSale.subtotalCents)}</Descriptions.Item>
              <Descriptions.Item label="GST">{formatRs(receiptSale.gstCents)}</Descriptions.Item>
              <Descriptions.Item label={<Text strong>Total</Text>}><Text strong>{formatRs(receiptSale.totalCents)}</Text></Descriptions.Item>
              <Descriptions.Item label="Payment"><Tag color={PAYMENT_MODE_COLORS[receiptSale.paymentMode]}>{receiptSale.paymentMode.toUpperCase()}</Tag></Descriptions.Item>
              {receiptSale.paymentMode === 'credit' && (
                <Descriptions.Item label="Amount due">{formatRs(receiptSale.totalCents - receiptSale.amountPaidCents)}</Descriptions.Item>
              )}
            </Descriptions>
            {receiptSale.controlledDrugInfo && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="Controlled Drug Register entry recorded"
                description={`${receiptSale.controlledDrugInfo.patientName} · Dr. ${receiptSale.controlledDrugInfo.doctorName} (${receiptSale.controlledDrugInfo.doctorRegNo})`}
              />
            )}
          </div>
        )}
      </Modal>

      <Modal
        title="Scan Barcode"
        open={barcodeOpen}
        onCancel={() => setBarcodeOpen(false)}
        footer={<Button onClick={() => setBarcodeOpen(false)}>Done</Button>}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Point your camera at a medicine&apos;s barcode. It&apos;s matched against the SKU saved on Medicine List —
          scan the same medicine again to bump its quantity by one.
        </Text>
        <div id="billing-barcode-region" />
      </Modal>
    </div>
  );
}
