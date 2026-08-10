'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Typography, Alert, Spin, Tag, Button, Space, message, Drawer, Select, Image, Switch,
  Descriptions, Empty, Popconfirm,
} from 'antd';
import {
  ScanOutlined, SendOutlined, CheckCircleOutlined, UnorderedListOutlined, DollarOutlined, NotificationOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { apiCall } from '../../../lib/api';
import QuoteReceipt from '../../components/QuoteReceipt';
import ItemizedQuoteForm from '../../components/ItemizedQuoteForm';

const { Title, Text } = Typography;

type RequestStatus =
  | 'pending_dispatch' | 'dispatched' | 'quoted' | 'awaiting_patient_choice' | 'sent_to_patient'
  | 'confirmed' | 'cancelled' | 'expired';

interface PrescriptionRequestRow {
  id: string;
  patientId: string;
  patient?: { fullName?: string; phoneNumber?: string };
  tenantName?: string;
  imageUrl: string;
  status: RequestStatus;
  dispatchedShopIds: string[];
  chosenQuoteId?: string;
  resultingOrderId?: string;
  createdAt: string;
}

interface QuoteItem { name: string; quantity?: number; priceCents?: number; }

interface QuoteRow {
  id: string;
  requestId: string;
  shopId: string;
  shopName?: string;
  status: 'pending' | 'submitted' | 'declined' | 'not_selected';
  items?: QuoteItem[];
  totalCents?: number;
  note?: string;
  submittedVia?: 'portal' | 'whatsapp' | 'manual';
  submittedAt?: string;
}

interface MedicineShopOption { id: string; name: string; isActive: boolean; }

interface OrderDetail {
  id: string;
  totalCents: number;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded';
  shopNotifiedAt?: string;
}

const paymentStatusColor: Record<OrderDetail['paymentStatus'], string> = {
  unpaid: 'default',
  pending: 'gold',
  paid: 'green',
  failed: 'red',
  refunded: 'purple',
};

const statusColor: Record<string, string> = {
  pending_dispatch: 'default',
  dispatched: 'blue',
  quoted: 'purple',
  awaiting_patient_choice: 'gold',
  sent_to_patient: 'orange',
  confirmed: 'green',
  cancelled: 'red',
  expired: 'red',
};

export default function PrescriptionRequestsPage() {
  const [requests, setRequests] = useState<PrescriptionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shops, setShops] = useState<MedicineShopOption[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [autoModeSaving, setAutoModeSaving] = useState(false);

  const [selected, setSelected] = useState<PrescriptionRequestRow | null>(null);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [dispatchShopIds, setDispatchShopIds] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [selectingQuoteId, setSelectingQuoteId] = useState<string | null>(null);
  const [lettingChoose, setLettingChoose] = useState(false);
  const [manualSavingId, setManualSavingId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [notifying, setNotifying] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqResult, shopResult, autoResult] = await Promise.all([
        apiCall('GET', '/api/admin/prescription-requests'),
        apiCall('GET', '/api/admin/medicine-shops'),
        apiCall('GET', '/api/admin/medicine-orders/auto-mode'),
      ]);
      setRequests(reqResult.data ?? reqResult);
      const shopList: MedicineShopOption[] = shopResult.data ?? shopResult;
      setShops(shopList.filter((s) => s.isActive));
      setAutoMode((autoResult.data ?? autoResult).enabled);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.message || 'Failed to load prescription requests');
      else setError('An unexpected error occurred');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleAutoMode = async (checked: boolean) => {
    setAutoModeSaving(true);
    try {
      await apiCall('PATCH', '/api/admin/medicine-orders/auto-mode', { enabled: checked });
      setAutoMode(checked);
      message.success(checked ? 'Auto-mode enabled' : 'Auto-mode disabled');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to update auto-mode');
      else message.error('An unexpected error occurred');
    } finally { setAutoModeSaving(false); }
  };

  const refreshDetail = async (id: string) => {
    try {
      const result = await apiCall('GET', `/api/admin/prescription-requests/${id}`);
      const detail = result.data ?? result;
      const request: PrescriptionRequestRow = detail.request;
      setSelected(request);
      setQuotes(detail.quotes ?? []);

      if (request.resultingOrderId) {
        try {
          const orderResult = await apiCall('GET', `/api/admin/medicine-orders/${request.resultingOrderId}`);
          setOrderDetail(orderResult.data ?? orderResult);
        } catch { setOrderDetail(null); }
      } else {
        setOrderDetail(null);
      }
    } catch { /* keep stale */ }
  };

  const notifyShop = async () => {
    if (!orderDetail) return;
    setNotifying(true);
    try {
      const result = await apiCall('POST', `/api/admin/medicine-orders/${orderDetail.id}/notify-shop`);
      setOrderDetail(result.data ?? result);
      message.success('Pharmacy notified to deliver');
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to notify pharmacy');
      else message.error('An unexpected error occurred');
    } finally { setNotifying(false); }
  };

  const openDetail = async (row: PrescriptionRequestRow) => {
    setSelected(row);
    setDrawerLoading(true);
    setDispatchShopIds([]);
    setOrderDetail(null);
    try {
      await refreshDetail(row.id);
    } catch {
      message.error('Failed to load request details');
    } finally { setDrawerLoading(false); }
  };

  const dispatch = async () => {
    if (!selected || dispatchShopIds.length === 0) return;
    setDispatching(true);
    try {
      await apiCall('POST', `/api/admin/prescription-requests/${selected.id}/dispatch`, { shopIds: dispatchShopIds });
      message.success('Dispatched to selected shops');
      setDispatchShopIds([]);
      await refreshDetail(selected.id);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to dispatch');
      else message.error('An unexpected error occurred');
    } finally { setDispatching(false); }
  };

  const selectQuote = async (quoteId: string) => {
    if (!selected) return;
    setSelectingQuoteId(quoteId);
    try {
      await apiCall('POST', `/api/admin/prescription-requests/${selected.id}/quotes/${quoteId}/select`);
      message.success('Receipt sent to patient');
      await refreshDetail(selected.id);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to send receipt');
      else message.error('An unexpected error occurred');
    } finally { setSelectingQuoteId(null); }
  };

  // Alternative to picking a quote yourself — sends every submitted quote
  // to the patient as a WhatsApp list (shop name + price) and lets them
  // reply with a number to choose. See whatsapp-bot.service.ts's
  // sendQuoteChoiceList/handleQuoteChoice for the conversation flow.
  const letPatientChoose = async () => {
    if (!selected) return;
    setLettingChoose(true);
    try {
      await apiCall('POST', `/api/admin/prescription-requests/${selected.id}/let-patient-choose`);
      message.success('Sent all quotes to the patient to choose');
      await refreshDetail(selected.id);
      fetchAll();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to send quotes to patient');
      else message.error('An unexpected error occurred');
    } finally { setLettingChoose(false); }
  };

  const saveManualQuote = async (
    quoteId: string,
    items: { name: string; quantity: number; priceCents: number }[],
    totalCents: number,
  ) => {
    if (!selected) return;
    setManualSavingId(quoteId);
    try {
      await apiCall('PATCH', `/api/admin/prescription-requests/${selected.id}/quotes/${quoteId}`, {
        items, totalCents,
      });
      message.success('Quote recorded');
      await refreshDetail(selected.id);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) message.error(err.response?.data?.message || 'Failed to record quote');
      else message.error('An unexpected error occurred');
    } finally { setManualSavingId(null); }
  };

  const columns = [
    {
      title: 'Patient', key: 'patient',
      render: (_: unknown, r: PrescriptionRequestRow) => r.patient?.fullName || r.patient?.phoneNumber || '—',
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: RequestStatus) => <Tag color={statusColor[s]}>{s.replace(/_/g, ' ').toUpperCase()}</Tag>,
    },
    {
      title: 'Shops Dispatched', key: 'dispatched',
      render: (_: unknown, r: PrescriptionRequestRow) => r.dispatchedShopIds?.length ?? 0,
    },
    {
      title: 'Uploaded', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: PrescriptionRequestRow) => <Button size="small" onClick={() => openDetail(r)}>View</Button>,
    },
  ];

  const alreadyDispatchedShopIds = new Set(selected?.dispatchedShopIds ?? []);
  const availableToDispatch = shops.filter((s) => !alreadyDispatchedShopIds.has(s.id));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ScanOutlined style={{ marginRight: 8 }} />Prescription Requests
        </Title>
        <Space>
          <Text type="secondary" style={{ fontSize: 13 }}>Auto-select cheapest quote</Text>
          <Switch checked={autoMode} loading={autoModeSaving} onChange={toggleAutoMode} />
        </Space>
      </div>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      {requests.length === 0 && !loading && !error && (
        <Alert
          type="info"
          showIcon
          message="No prescription uploads yet"
          description="Patients upload a prescription photo through your WhatsApp bot's 'Order Medicine' option — they'll show up here for you to dispatch to onboarded medicine shops for quotes."
          style={{ marginBottom: 16 }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : (
        <Table columns={columns} dataSource={requests.map((r) => ({ ...r, key: r.id }))} bordered size="middle" />
      )}

      <Drawer
        title="Prescription Request"
        placement="right"
        open={!!selected}
        onClose={() => setSelected(null)}
        size={560}
      >
        {drawerLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : selected && (
          <>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Patient">{selected.patient?.fullName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{selected.patient?.phoneNumber || '—'}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={statusColor[selected.status]}>{selected.status.replace(/_/g, ' ').toUpperCase()}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Text strong style={{ display: 'block', marginBottom: 8 }}>Prescription Photo</Text>
            <Image src={selected.imageUrl} alt="Prescription" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 20 }} />

            {orderDetail && (
              <>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>Order & Payment</Text>
                <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: orderDetail.paymentStatus === 'paid' ? 10 : 0 }}>
                    <Text>
                      <DollarOutlined style={{ marginRight: 6 }} />
                      ₹{(orderDetail.totalCents / 100).toFixed(2)}
                    </Text>
                    <Tag color={paymentStatusColor[orderDetail.paymentStatus]}>
                      {orderDetail.paymentStatus.toUpperCase()}
                    </Tag>
                  </div>
                  {orderDetail.paymentStatus === 'paid' && (
                    <Button
                      block
                      icon={<NotificationOutlined />}
                      loading={notifying}
                      disabled={!!orderDetail.shopNotifiedAt}
                      onClick={notifyShop}
                    >
                      {orderDetail.shopNotifiedAt ? 'Pharmacy Notified' : 'Notify Shop to Deliver'}
                    </Button>
                  )}
                  {orderDetail.paymentStatus !== 'paid' && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Waiting for the patient to complete payment before the pharmacy can be notified.
                    </Text>
                  )}
                </div>
              </>
            )}

            <Text strong style={{ display: 'block', marginBottom: 8 }}>Dispatch to Shops</Text>
            {availableToDispatch.length === 0 ? (
              <Empty description="All active shops have already been dispatched" style={{ marginBottom: 20 }} />
            ) : (
              <Space.Compact style={{ width: '100%', marginBottom: 20 }}>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Select shops to request quotes from"
                  value={dispatchShopIds}
                  onChange={setDispatchShopIds}
                  options={availableToDispatch.map((s) => ({ value: s.id, label: s.name }))}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={dispatching}
                  disabled={dispatchShopIds.length === 0}
                  onClick={dispatch}
                >
                  Dispatch
                </Button>
              </Space.Compact>
            )}

            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong>Quotes</Text>
              {quotes.some((q) => q.status === 'submitted') && (
                <Popconfirm
                  title="Send every submitted quote to the patient as a WhatsApp list, and let them pick the shop themselves?"
                  onConfirm={letPatientChoose}
                >
                  <Button
                    size="small"
                    icon={<UnorderedListOutlined />}
                    loading={lettingChoose}
                    disabled={['awaiting_patient_choice', 'sent_to_patient', 'confirmed', 'cancelled'].includes(selected.status)}
                  >
                    Let Patient Choose
                  </Button>
                </Popconfirm>
              )}
            </Space>
            {selected.status === 'awaiting_patient_choice' && (
              <Alert
                type="info"
                showIcon
                message="Quotes sent — waiting for the patient to pick a shop over WhatsApp"
                style={{ marginBottom: 12 }}
              />
            )}
            {quotes.length === 0 ? (
              <Empty description="No quotes yet" style={{ marginBottom: 20 }} />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {quotes.map((q) => (
                  <div key={q.id}>
                    {q.status === 'submitted' ? (
                      <>
                        <QuoteReceipt
                          tenantName={selected.tenantName || 'ZyroHealth'}
                          shopName={q.shopName}
                          requestId={q.requestId}
                          quoteDate={q.submittedAt}
                          items={q.items}
                          totalCents={q.totalCents}
                          status={q.status}
                          submittedVia={q.submittedVia}
                          downloadPath={`/api/admin/prescription-requests/${selected.id}/quotes/${q.id}/receipt.pdf`}
                        />
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                          <Popconfirm title="Send this quote to the patient as their receipt?" onConfirm={() => selectQuote(q.id)}>
                            <Button
                              size="small"
                              type="primary"
                              icon={<CheckCircleOutlined />}
                              loading={selectingQuoteId === q.id}
                              disabled={
                                selected.chosenQuoteId === q.id ||
                                selected.status === 'sent_to_patient' ||
                                selected.status === 'awaiting_patient_choice' ||
                                selected.status === 'confirmed'
                              }
                            >
                              {selected.chosenQuoteId === q.id ? 'Sent to Patient' : 'Send to Patient'}
                            </Button>
                          </Popconfirm>
                        </div>
                      </>
                    ) : q.status === 'declined' ? (
                      <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{q.shopName || 'Unknown shop'}</Text>
                          <Tag color="red">DECLINED</Tag>
                        </div>
                      </div>
                    ) : q.status === 'not_selected' ? (
                      <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text strong>{q.shopName || 'Unknown shop'}</Text>
                          <Tag>NOT SELECTED</Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Quoted ₹{((q.totalCents ?? 0) / 100).toFixed(2)} — another shop was chosen instead.
                        </Text>
                      </div>
                    ) : (
                      <div style={{ border: '1px solid rgba(128,128,128,0.3)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <Text strong>{q.shopName || 'Unknown shop'}</Text>
                          <Tag>PENDING</Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                          Enter a price on this shop&apos;s behalf (e.g. they phoned it in):
                        </Text>
                        <ItemizedQuoteForm
                          submitting={manualSavingId === q.id}
                          submitLabel="Save Quote"
                          onSubmit={(items, totalCents) => saveManualQuote(q.id, items, totalCents)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </Space>
            )}
          </>
        )}
      </Drawer>
    </div>
  );
}
