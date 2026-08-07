'use client';

import React, { useEffect, useState } from 'react';
import { Tag, Button, message } from 'antd';
import { DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import QRCode from 'qrcode';
import { downloadFile, printFile } from '../../lib/downloadFile';

export interface QuoteReceiptItem {
  name: string;
  quantity?: number;
  priceCents?: number;
}

export interface QuoteReceiptProps {
  tenantName: string;
  shopName?: string;
  requestId: string;
  quoteDate?: string;
  items?: QuoteReceiptItem[];
  totalCents?: number;
  status?: 'pending' | 'submitted' | 'declined';
  submittedVia?: 'portal' | 'whatsapp' | 'manual';
  /** API path for the downloadable PDF version of this exact receipt, e.g.
   * `/api/admin/prescription-requests/{id}/quotes/{quoteId}/receipt.pdf`.
   * Omit to hide the download button (e.g. while still pending). */
  downloadPath?: string;
}

const statusColor: Record<string, string> = {
  submitted: 'green',
  pending: 'default',
  declined: 'red',
};

const MONO_FONT = '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// Printed cash-register-style receipt: fixed light "paper" surface (kept
// constant across light/dark theme on purpose — it represents a physical
// slip, like a photo of paper, not a themed UI surface), torn zigzag top
// and bottom edges, and monospace type throughout. Branded with the
// TENANT's name at the top masthead (never the fulfilling shop's — the
// shop only appears as a small "Fulfilled by" line). Reused identically in
// the admin Prescription Requests drawer and the shop's own portal.
const TEETH = 16;
const AMP = 6;

function buildZigzagClipPath(): string {
  const points: string[] = [];
  for (let i = 0; i <= TEETH; i++) {
    const x = (i / TEETH) * 100;
    const y = i % 2 === 0 ? 0 : AMP;
    points.push(`${x}% ${y}px`);
  }
  for (let i = TEETH; i >= 0; i--) {
    const x = (i / TEETH) * 100;
    const y = i % 2 === 0 ? 0 : AMP;
    points.push(`${x}% calc(100% - ${y}px)`);
  }
  return `polygon(${points.join(', ')})`;
}

const ZIGZAG_CLIP_PATH = buildZigzagClipPath();

const money = (cents: number) => `Rs.${(cents / 100).toFixed(2)}`;

export default function QuoteReceipt({
  tenantName, shopName, requestId, quoteDate, items, totalCents, status, submittedVia, downloadPath,
}: QuoteReceiptProps) {
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const payload = [
      `${tenantName} — Prescription Quote`,
      `Ref: ${requestId}`,
      totalCents != null ? `Total: ${money(totalCents)}` : null,
      status ? `Status: ${status.toUpperCase()}` : null,
    ].filter(Boolean).join('\n');
    QRCode.toDataURL(payload, { margin: 0, width: 96, color: { dark: '#2b2b2b', light: '#00000000' } })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [tenantName, requestId, totalCents, status]);

  const handleDownload = async () => {
    if (!downloadPath) return;
    setDownloading(true);
    try {
      await downloadFile(downloadPath, `quote-${requestId.slice(0, 8)}.pdf`);
    } catch {
      message.error('Failed to download receipt');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (!downloadPath) return;
    setPrinting(true);
    try {
      await printFile(downloadPath);
      message.info('Opened in a new tab — use the print icon (or Ctrl/Cmd+P) there to send it to your printer.');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to open the receipt for printing');
    } finally {
      setPrinting(false);
    }
  };

  const dateObj = quoteDate ? new Date(quoteDate) : null;

  return (
    <div
      style={{
        maxWidth: 340,
        margin: '0 auto',
        fontFamily: MONO_FONT,
        color: '#2b2b2b',
        background: '#fbfaf7',
        clipPath: ZIGZAG_CLIP_PATH,
        padding: `${AMP + 18}px 22px`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.22), 0 1px 0 rgba(0,0,0,0.06)',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.015) 0px, rgba(0,0,0,0.015) 1px, transparent 1px, transparent 3px)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 1, textTransform: 'uppercase' }}>
          {tenantName}
        </div>
        <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#6b6b6b', marginTop: 2 }}>
          Prescription Quote
        </div>
        {shopName && (
          <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
            Fulfilled by {shopName}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #a8a8a0', margin: '10px 0' }} />

      <div style={{ fontSize: 11, lineHeight: 1.7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Ref:</span>
          <span>{requestId.slice(0, 8).toUpperCase()}</span>
        </div>
        {dateObj && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Date:</span>
            <span>
              {dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}{'  '}
              {dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        {status && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Status:</span>
            <span>
              <Tag color={statusColor[status] ?? 'default'} style={{ marginRight: 0, fontFamily: MONO_FONT }}>
                {status.toUpperCase()}
              </Tag>
            </span>
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px dashed #a8a8a0', margin: '10px 0' }} />

      {items && items.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}{item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''}
              </span>
              <span style={{ flexShrink: 0 }}>
                {item.priceCents != null ? money(item.priceCents * (item.quantity ?? 1)) : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#6b6b6b' }}>
          Consolidated total — no itemized breakdown provided.
        </div>
      )}

      <div style={{ borderTop: '1px solid #2b2b2b', margin: '12px 0 8px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontWeight: 700, fontSize: 18 }}>
        <span>Total</span>
        <span>{totalCents != null ? money(totalCents) : '—'}</span>
      </div>

      {submittedVia && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b6b6b', marginTop: 6 }}>
          <span>Via:</span>
          <span>{submittedVia}</span>
        </div>
      )}

      <div style={{ borderTop: '1px dashed #a8a8a0', margin: '14px 0 10px' }} />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {qrDataUrl && <img src={qrDataUrl} alt="Receipt QR code" width={80} height={80} />}
      </div>

      {downloadPath && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button
            block
            size="small"
            icon={<PrinterOutlined />}
            loading={printing}
            onClick={handlePrint}
            style={{
              fontFamily: MONO_FONT,
              letterSpacing: 1,
              fontSize: 11,
              textTransform: 'uppercase',
              borderStyle: 'dashed',
              borderColor: '#a8a8a0',
              color: '#2b2b2b',
              background: 'transparent',
            }}
          >
            Print
          </Button>
          <Button
            block
            size="small"
            icon={<DownloadOutlined />}
            loading={downloading}
            onClick={handleDownload}
            style={{
              fontFamily: MONO_FONT,
              letterSpacing: 1,
              fontSize: 11,
              textTransform: 'uppercase',
              borderStyle: 'dashed',
              borderColor: '#a8a8a0',
              color: '#2b2b2b',
              background: 'transparent',
            }}
          >
            Download
          </Button>
        </div>
      )}
    </div>
  );
}
