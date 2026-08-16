'use client';

import React, { useState } from 'react';
import { Button, Input, InputNumber, Space, Typography, theme } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface ItemRow {
  name: string;
  quantity: number;
  priceCents: number | null;
}

interface ItemizedQuoteFormProps {
  submitting: boolean;
  submitLabel: string;
  onSubmit: (items: { name: string; quantity: number; priceCents: number }[], totalCents: number) => void;
}

const emptyRow = (): ItemRow => ({ name: '', quantity: 1, priceCents: null });

// Shared repeatable "medicine name + qty + unit price" input, used by both
// the shop portal (submitting a quote) and the admin's manual-entry form
// (recording a phoned-in price on a shop's behalf) — one place to keep the
// itemization UX consistent, since both feed the same QuoteReceipt display.
export default function ItemizedQuoteForm({ submitting, submitLabel, onSubmit }: ItemizedQuoteFormProps) {
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const { token } = theme.useToken();

  const updateRow = (index: number, patch: Partial<ItemRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const validRows = rows.filter((r) => r.name.trim() && r.priceCents != null && r.priceCents > 0);
  const total = validRows.reduce((sum, r) => sum + (r.priceCents ?? 0) * (r.quantity || 1), 0);

  const submit = () => {
    if (validRows.length === 0) return;
    onSubmit(
      validRows.map((r) => ({ name: r.name.trim(), quantity: r.quantity || 1, priceCents: r.priceCents! })),
      total,
    );
  };

  return (
    <div>
      {/* Horizontal scroll fallback on narrow phones: the four cells below
          have a sensible minimum usable width, so rather than squashing
          them unreadably thin we let the row scroll sideways instead. */}
      <div style={{ overflowX: 'auto' }}>
        <Space direction="vertical" style={{ width: '100%', minWidth: 380 }} size="small">
          {rows.map((row, i) => (
            <Space.Compact key={i} style={{ width: '100%' }}>
              <Input
                placeholder="Medicine name"
                value={row.name}
                onChange={(e) => updateRow(i, { name: e.target.value })}
                style={{ width: '50%' }}
              />
              <InputNumber
                placeholder="Qty"
                min={1}
                value={row.quantity}
                onChange={(v) => updateRow(i, { quantity: v || 1 })}
                style={{ width: '20%' }}
              />
              <InputNumber
                placeholder="Price/unit (₹)"
                min={0.01}
                value={row.priceCents != null ? row.priceCents / 100 : null}
                onChange={(v) => updateRow(i, { priceCents: v != null ? Math.round(v * 100) : null })}
                style={{ width: '30%' }}
              />
              <Button icon={<DeleteOutlined />} onClick={() => removeRow(i)} disabled={rows.length === 1} />
            </Space.Compact>
          ))}
        </Space>
      </div>

      <Button type="dashed" icon={<PlusOutlined />} onClick={addRow} block style={{ marginTop: 8 }}>
        Add Medicine
      </Button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Total</Text>
          <div><Text strong style={{ fontSize: 16 }}>₹{(total / 100).toFixed(2)}</Text></div>
        </div>
        <Button type="primary" loading={submitting} disabled={validRows.length === 0} onClick={submit}>
          {submitLabel}
        </Button>
      </div>
      {validRows.length === 0 && (
        <Text type="secondary" style={{ fontSize: 11, color: token.colorTextTertiary }}>
          Enter at least one medicine with a name and price to continue.
        </Text>
      )}
    </div>
  );
}
