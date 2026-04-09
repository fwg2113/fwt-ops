'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader, DashboardCard, DataTable, StatusBadge, Button } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';
import EditUpsellModal from './EditUpsellModal';

// ============================================================================
// TYPES
// ============================================================================
interface Invoice {
  id: string;
  invoice_number: string;
  public_token: string;
  booking_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  line_items_json: unknown[];
  subtotal: number;
  starting_total: number | null;
  upsell_amount: number | null;
  upsell_override: number | null;
  discount_code: string | null;
  discount_amount: number;
  deposit_paid: number;
  balance_due: number;
  total_paid: number;
  status: string;
  checkout_type: string;
  payment_method: string | null;
  sent_via: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  payment_confirmed_at: string | null;
  created_at: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'red'> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'warning',
  paid: 'success',
  partial: 'warning',
  void: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  viewed: 'Viewed',
  paid: 'Paid',
  partial: 'Partial',
  void: 'Void',
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
];

// ============================================================================
// HELPERS
// ============================================================================
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function InvoicingPage() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingUpsellInvoice, setEditingUpsellInvoice] = useState<Invoice | null>(null);
  // Month filter -- defaults to current month, "all" shows everything
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (monthFilter && monthFilter !== 'all') params.set('month', monthFilter);
      params.set('limit', '1000');
      const res = await fetch(`/api/auto/invoices?${params.toString()}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [monthFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Filter invoices
  const filtered = filter === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === filter);

  // Stats
  const stats = {
    total: invoices.length,
    unpaid: invoices.filter(i => ['draft', 'sent', 'viewed'].includes(i.status)).length,
    totalOutstanding: invoices
      .filter(i => ['draft', 'sent', 'viewed', 'partial'].includes(i.status))
      .reduce((sum, i) => sum + i.balance_due, 0),
    totalCollected: invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total_paid || 0), 0),
    totalUpsell: invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.upsell_override ?? i.upsell_amount ?? 0), 0),
  };

  // Mark as paid (manual confirmation)
  async function handleMarkPaid(inv: Invoice) {
    try {
      await fetch('/api/auto/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: inv.id,
          status: 'paid',
          payment_confirmed_at: new Date().toISOString(),
          total_paid: inv.balance_due,
          balance_due: 0,
        }),
      });
      fetchInvoices();
      setSelectedInvoice(null);
    } catch { /* silent */ }
  }

  // Void invoice
  async function handleVoid(inv: Invoice) {
    try {
      await fetch('/api/auto/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, status: 'void' }),
      });
      fetchInvoices();
      setSelectedInvoice(null);
    } catch { /* silent */ }
  }

  // Table columns
  const columns = [
    {
      key: 'invoice_number',
      label: 'Invoice',
      width: 140,
      render: (row: Invoice) => (
        <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
          {row.invoice_number}
        </span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row: Invoice) => (
        <div>
          <div style={{ fontWeight: FONT.weightMedium, color: COLORS.textPrimary }}>{row.customer_name}</div>
          {row.customer_phone && (
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{formatPhone(row.customer_phone)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      render: (row: Invoice) => (
        <span style={{ color: COLORS.textSecondary }}>
          {[row.vehicle_year, row.vehicle_make, row.vehicle_model].filter(Boolean).join(' ')}
        </span>
      ),
    },
    {
      key: 'starting_total',
      label: 'Starting',
      align: 'right' as const,
      width: 90,
      render: (row: Invoice) => {
        const start = Number(row.starting_total || 0);
        return start > 0 ? (
          <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
            {formatCurrency(start)}
          </span>
        ) : (
          <span style={{ color: COLORS.textPlaceholder, fontSize: FONT.sizeXs }}>--</span>
        );
      },
    },
    {
      key: 'final_subtotal',
      label: 'Final Sub',
      align: 'right' as const,
      width: 90,
      render: (row: Invoice) => (
        <span
          title="Pre-discount services value (used for upsell calculation)"
          style={{ color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}
        >
          {formatCurrency(Number(row.subtotal || 0))}
        </span>
      ),
    },
    {
      key: 'total',
      label: 'Total Paid',
      align: 'right' as const,
      width: 90,
      render: (row: Invoice) => (
        <span
          title="Final amount paid by customer (after discounts, deposits, etc.)"
          style={{ color: COLORS.textSecondary, fontSize: FONT.sizeSm }}
        >
          {formatCurrency(Number(row.total_paid || 0))}
        </span>
      ),
    },
    {
      key: 'upsell_amount',
      label: 'Upsell',
      align: 'right' as const,
      width: 120,
      render: (row: Invoice) => {
        const isOverridden = row.upsell_override != null;
        const effective = Number(row.upsell_override ?? row.upsell_amount ?? 0);
        return (
          <div
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}
            onClick={e => e.stopPropagation()}
          >
            {effective > 0 ? (
              <span
                title={isOverridden ? `Manual override (auto: ${formatCurrency(Number(row.upsell_amount || 0))})` : undefined}
                style={{
                  color: '#22c55e', fontWeight: FONT.weightBold, fontSize: FONT.sizeSm,
                  fontStyle: isOverridden ? 'italic' : 'normal',
                  textDecoration: isOverridden ? 'underline dotted' : 'none',
                }}
              >
                +{formatCurrency(effective)}{isOverridden ? '*' : ''}
              </span>
            ) : (
              <span
                title={isOverridden ? `Manual override (auto: ${formatCurrency(Number(row.upsell_amount || 0))})` : undefined}
                style={{
                  color: COLORS.textPlaceholder, fontSize: FONT.sizeXs,
                  fontStyle: isOverridden ? 'italic' : 'normal',
                }}
              >
                {isOverridden ? '$0*' : '--'}
              </span>
            )}
            <button
              onClick={() => setEditingUpsellInvoice(row)}
              title="Override upsell (PIN required)"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: COLORS.textMuted, padding: 2, display: 'flex', alignItems: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        );
      },
    },
    {
      key: 'balance_due',
      label: 'Balance',
      align: 'right' as const,
      width: 90,
      render: (row: Invoice) => (
        <span style={{
          fontWeight: FONT.weightBold,
          color: row.status === 'paid' ? COLORS.success : row.balance_due > 0 ? COLORS.textPrimary : COLORS.textMuted,
        }}>
          {row.status === 'paid' ? formatCurrency(0) : formatCurrency(row.balance_due)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 90,
      align: 'center' as const,
      render: (row: Invoice) => (
        <StatusBadge
          label={STATUS_LABELS[row.status] || row.status}
          variant={STATUS_VARIANTS[row.status] || 'neutral'}
        />
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      width: 80,
      align: 'right' as const,
      render: (row: Invoice) => (
        <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'right' as const,
      render: (row: Invoice) => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Open customer view */}
          <button
            onClick={() => window.open(`/invoice/${row.public_token}`, '_blank')}
            title="Open customer view"
            style={{
              background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
              borderRadius: RADIUS.sm, padding: '4px 8px', cursor: 'pointer',
              color: COLORS.textMuted, display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          {/* Copy link */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/invoice/${row.public_token}`);
            }}
            title="Copy invoice link"
            style={{
              background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
              borderRadius: RADIUS.sm, padding: '4px 8px', cursor: 'pointer',
              color: COLORS.textMuted, display: 'flex', alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Manage invoices and payments"
      />

      {/* Stats Row */}
      <div style={{
        display: 'flex', gap: isMobile ? SPACING.sm : SPACING.lg, marginBottom: SPACING.md, flexWrap: 'wrap',
        flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center',
      }}>
        <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
          <StatPill label="Total" value={stats.total} />
          <StatPill label="Unpaid" value={stats.unpaid} color="#f59e0b" />
          <MonthPicker value={monthFilter} onChange={setMonthFilter} />
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? SPACING.md : SPACING.lg,
          fontSize: isMobile ? FONT.sizeSm : FONT.sizeBase, color: COLORS.textTertiary,
          flexWrap: 'wrap',
        }}>
          <span>
            Outstanding: <strong style={{ color: COLORS.warning }}>{formatCurrency(stats.totalOutstanding)}</strong>
          </span>
          <span>
            Collected: <strong style={{ color: COLORS.success }}>{formatCurrency(stats.totalCollected)}</strong>
          </span>
          <span>
            Upsell: <strong style={{ color: '#22c55e' }}>{formatCurrency(stats.totalUpsell)}</strong>
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: SPACING.lg,
        background: COLORS.inputBg, borderRadius: RADIUS.md, padding: 4,
        width: isMobile ? '100%' : 'fit-content',
        overflowX: isMobile ? 'auto' : 'visible',
        WebkitOverflowScrolling: 'touch' as any,
      }}>
        {FILTER_TABS.map(tab => {
          const isActive = filter === tab.key;
          const count = tab.key === 'all'
            ? invoices.length
            : invoices.filter(i => i.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '6px 16px',
                borderRadius: RADIUS.sm,
                border: 'none',
                background: isActive ? COLORS.cardBg : 'transparent',
                color: isActive ? COLORS.textPrimary : COLORS.textMuted,
                fontSize: FONT.sizeXs,
                fontWeight: isActive ? FONT.weightSemibold : FONT.weightMedium,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {tab.label}
              {count > 0 && (
                <span style={{
                  fontSize: '0.6rem',
                  background: isActive ? `${COLORS.red}20` : 'rgba(255,255,255,0.06)',
                  color: isActive ? COLORS.red : COLORS.textMuted,
                  padding: '1px 6px',
                  borderRadius: 10,
                  fontWeight: FONT.weightBold,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Invoice Table / Mobile Cards */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>
            Loading invoices...
          </div>
        ) : isMobile ? (
          filtered.length === 0 ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
              {filter === 'all' ? 'No invoices yet. Create one from the Appointments page.' : `No ${filter} invoices.`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((row, idx) => (
                <div
                  key={row.id}
                  onClick={() => setSelectedInvoice(row)}
                  style={{
                    padding: `${SPACING.md}px ${SPACING.lg}px`,
                    borderBottom: idx < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {/* Row 1: Invoice #, status, balance */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                      <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>{row.invoice_number}</span>
                      <StatusBadge
                        label={STATUS_LABELS[row.status] || row.status}
                        variant={STATUS_VARIANTS[row.status] || 'neutral'}
                      />
                    </div>
                    <span style={{
                      fontWeight: FONT.weightBold, fontSize: FONT.sizeSm,
                      color: row.status === 'paid' ? COLORS.success : row.balance_due > 0 ? COLORS.textPrimary : COLORS.textMuted,
                    }}>
                      {row.status === 'paid' ? formatCurrency(0) : formatCurrency(row.balance_due)}
                    </span>
                  </div>
                  {/* Row 2: Customer, vehicle, date */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      {row.customer_name}
                      {row.vehicle_year || row.vehicle_make ? ` -- ${[row.vehicle_year, row.vehicle_make, row.vehicle_model].filter(Boolean).join(' ')}` : ''}
                    </div>
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, flexShrink: 0, marginLeft: SPACING.sm }}>{formatDate(row.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(row) => row.id}
            onRowClick={setSelectedInvoice}
            emptyMessage={filter === 'all' ? 'No invoices yet. Create one from the Appointments page.' : `No ${filter} invoices.`}
          />
        )}
      </DashboardCard>

      {/* ================================================================ */}
      {/* DETAIL PANEL (slide-over) */}
      {/* ================================================================ */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onMarkPaid={() => handleMarkPaid(selectedInvoice)}
          onVoid={() => handleVoid(selectedInvoice)}
          onRefresh={fetchInvoices}
          onCounterCheckout={(invoiceId) => {
            setSelectedInvoice(null);
            router.push(`/invoicing/checkout/${invoiceId}`);
          }}
          onEditUpsell={() => setEditingUpsellInvoice(selectedInvoice)}
          isMobile={isMobile}
        />
      )}

      {/* Edit Upsell PIN-gated modal */}
      {editingUpsellInvoice && (
        <EditUpsellModal
          documentId={editingUpsellInvoice.id}
          customerName={editingUpsellInvoice.customer_name}
          autoUpsell={Number(editingUpsellInvoice.upsell_amount || 0)}
          currentOverride={editingUpsellInvoice.upsell_override}
          currentSubtotal={Number(editingUpsellInvoice.subtotal || 0)}
          currentStartingTotal={Number(editingUpsellInvoice.starting_total || 0)}
          onClose={() => setEditingUpsellInvoice(null)}
          onSaved={() => {
            setEditingUpsellInvoice(null);
            fetchInvoices();
            setSelectedInvoice(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// STAT PILL
// ============================================================================
function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Build a list of months from Jan 2024 to current month + "All Time"
  const options: { value: string; label: string }[] = [{ value: 'all', label: 'All Time' }];
  const now = new Date();
  for (let y = now.getFullYear(); y >= 2024; y--) {
    const startMonth = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = startMonth; m >= 0; m--) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const label = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      options.push({ value: key, label });
    }
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 12px', borderRadius: RADIUS.lg, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
        background: COLORS.inputBg, color: COLORS.textPrimary,
        border: `1px solid ${COLORS.borderInput}`, cursor: 'pointer', outline: 'none',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: RADIUS.lg,
      background: color ? `${color}15` : COLORS.hoverBg,
      border: `1px solid ${color ? `${color}30` : COLORS.border}`,
    }}>
      <span style={{
        fontSize: FONT.sizePageTitle, fontWeight: FONT.weightBold,
        color: color || COLORS.textPrimary,
      }}>
        {value}
      </span>
      <span style={{
        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
        color: COLORS.textMuted, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// INVOICE DETAIL PANEL
// ============================================================================
function InvoiceDetailPanel({ invoice, onClose, onMarkPaid, onVoid, onRefresh, onCounterCheckout, onEditUpsell, isMobile }: {
  invoice: Invoice;
  onClose: () => void;
  onMarkPaid: () => void;
  onVoid: () => void;
  onRefresh: () => void;
  onCounterCheckout: (invoiceId: string) => void;
  onEditUpsell?: () => void;
  isMobile?: boolean;
}) {
  const inv = invoice;
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const lineItems = Array.isArray(inv.line_items_json) ? inv.line_items_json as Array<{
    label?: string; filmName?: string; filmAbbrev?: string; shade?: string; price?: number; rollId?: string | null;
  }> : [];
  const vehicleStr = [inv.vehicle_year, inv.vehicle_make, inv.vehicle_model].filter(Boolean).join(' ');
  const isPaid = inv.status === 'paid';
  const isVoid = inv.status === 'void';

  async function handleSend(method: 'sms' | 'email') {
    setSending(method);
    setSendResult(null);
    try {
      const res = await fetch('/api/auto/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id, method }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult({ ok: true, msg: `Sent via ${method.toUpperCase()}` });
        onRefresh();
      } else {
        setSendResult({ ok: false, msg: data.error || 'Send failed' });
      }
    } catch {
      setSendResult({ ok: false, msg: 'Network error' });
    } finally {
      setSending(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isMobile ? '100%' : 480, height: '100vh',
          background: COLORS.pageBg, overflowY: 'auto',
          borderLeft: isMobile ? 'none' : `1px solid ${COLORS.borderAccent}`,
          padding: isMobile ? SPACING.lg : SPACING.xxl,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl }}>
          <div>
            <div style={{ fontSize: FONT.sizeTitle, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
              {inv.invoice_number}
            </div>
            <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 2 }}>
              {formatDateTime(inv.created_at)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
            <StatusBadge
              label={STATUS_LABELS[inv.status] || inv.status}
              variant={STATUS_VARIANTS[inv.status] || 'neutral'}
            />
            <button onClick={onClose} style={{
              background: 'transparent', border: 'none', color: COLORS.textMuted,
              cursor: 'pointer', padding: 4,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Customer + Vehicle */}
        <div style={{
          background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
          border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.lg }}>
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Customer</div>
              <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{inv.customer_name}</div>
              {inv.customer_phone && <div style={{ fontSize: FONT.sizeSm, color: COLORS.textTertiary }}>{formatPhone(inv.customer_phone)}</div>}
              {inv.customer_email && <div style={{ fontSize: FONT.sizeSm, color: COLORS.textTertiary }}>{inv.customer_email}</div>}
            </div>
            <div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Vehicle</div>
              <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{vehicleStr}</div>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div style={{
          background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
          border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
        }}>
          <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
            Services
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: `${SPACING.sm}px 0`,
              borderBottom: idx < lineItems.length - 1 ? `1px solid ${COLORS.border}` : 'none',
            }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>{item.label || 'Service'}</div>
                {(item.filmName || item.filmAbbrev) && (
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {item.filmName || item.filmAbbrev}{item.shade ? ` ${item.shade}` : ''}
                  </div>
                )}
                {item.rollId && (
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textPlaceholder }}>
                    Roll: {item.rollId}
                  </div>
                )}
              </div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                {formatCurrency(item.price || 0)}
              </div>
            </div>
          ))}
        </div>

        {/* Pricing Summary */}
        <div style={{
          background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
          border: `1px solid ${COLORS.border}`, marginBottom: SPACING.xl,
        }}>
          {Number(inv.starting_total || 0) > 0 && Number(inv.starting_total || 0) !== inv.subtotal && (
            <Row label="Original Booking" value={formatCurrency(Number(inv.starting_total || 0))} color={COLORS.textMuted} />
          )}
          <Row label="Subtotal" value={formatCurrency(inv.subtotal)} />
          {(() => {
            const isOverridden = inv.upsell_override != null;
            const effective = Number(inv.upsell_override ?? inv.upsell_amount ?? 0);
            if (effective > 0 || isOverridden) {
              return (
                <Row
                  label={isOverridden ? 'Upsell (overridden)' : 'Upsell'}
                  value={`+${formatCurrency(effective)}`}
                  color="#22c55e"
                  bold
                />
              );
            }
            return null;
          })()}
          {onEditUpsell && (
            <button
              onClick={onEditUpsell}
              style={{
                background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
                color: COLORS.textMuted, padding: '4px 10px', borderRadius: RADIUS.sm,
                fontSize: FONT.sizeXs, cursor: 'pointer', marginTop: 4, marginBottom: SPACING.sm,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Override Upsell (PIN required)
            </button>
          )}
          {inv.discount_amount > 0 && (
            <Row label={`Discount${inv.discount_code ? ` (${inv.discount_code})` : ''}`} value={`-${formatCurrency(inv.discount_amount)}`} color={COLORS.success} />
          )}
          {inv.deposit_paid > 0 && (
            <Row label="Deposit Paid" value={`-${formatCurrency(inv.deposit_paid)}`} color={COLORS.success} />
          )}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: SPACING.sm, paddingTop: SPACING.sm }}>
            <Row
              label="Balance Due"
              value={isPaid ? formatCurrency(0) : formatCurrency(inv.balance_due)}
              bold
              color={isPaid ? COLORS.success : COLORS.red}
            />
          </div>
        </div>

        {/* Activity */}
        {(inv.sent_at || inv.viewed_at || inv.payment_confirmed_at) && (
          <div style={{
            background: COLORS.cardBg, borderRadius: RADIUS.lg, padding: SPACING.lg,
            border: `1px solid ${COLORS.border}`, marginBottom: SPACING.xl,
          }}>
            <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.md }}>
              Activity
            </div>
            {inv.payment_confirmed_at && (
              <ActivityRow icon="check" label="Payment confirmed" time={formatDateTime(inv.payment_confirmed_at)} color={COLORS.success} />
            )}
            {inv.viewed_at && (
              <ActivityRow icon="eye" label="Viewed by customer" time={formatDateTime(inv.viewed_at)} color={COLORS.info} />
            )}
            {inv.sent_at && (
              <ActivityRow icon="send" label={`Sent via ${inv.sent_via || 'link'}`} time={formatDateTime(inv.sent_at)} color={COLORS.warning} />
            )}
          </div>
        )}

        {/* Checkout Actions */}
        {!isPaid && !isVoid && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
            {/* Primary checkout actions */}
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button
                onClick={() => onCounterCheckout(inv.id)}
                style={{
                  flex: 1, padding: '14px', borderRadius: RADIUS.md, border: 'none',
                  background: COLORS.success, color: '#fff',
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                Counter Checkout
              </button>
            </div>

            {/* Secondary actions */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/invoice/${inv.public_token}`);
              }}
              style={{
                padding: '12px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderInput}`,
                background: 'transparent', color: COLORS.textPrimary,
                fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy Invoice Link
            </button>

            {/* Send via SMS / Email */}
            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button
                onClick={() => handleSend('sms')}
                disabled={!inv.customer_phone || sending !== null}
                style={{
                  flex: 1, padding: '12px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderInput}`,
                  background: 'transparent', color: inv.customer_phone ? COLORS.textPrimary : COLORS.textMuted,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                  cursor: inv.customer_phone ? 'pointer' : 'not-allowed',
                  opacity: sending === 'sms' ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                {sending === 'sms' ? 'Sending...' : 'Send SMS'}
              </button>
              <button
                onClick={() => handleSend('email')}
                disabled={!inv.customer_email || sending !== null}
                style={{
                  flex: 1, padding: '12px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.borderInput}`,
                  background: 'transparent', color: inv.customer_email ? COLORS.textPrimary : COLORS.textMuted,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                  cursor: inv.customer_email ? 'pointer' : 'not-allowed',
                  opacity: sending === 'email' ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {sending === 'email' ? 'Sending...' : 'Send Email'}
              </button>
            </div>

            {/* Send result feedback */}
            {sendResult && (
              <div style={{
                padding: '8px 12px', borderRadius: RADIUS.sm,
                background: sendResult.ok ? COLORS.successBg : COLORS.dangerBg,
                color: sendResult.ok ? COLORS.success : COLORS.danger,
                fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                textAlign: 'center',
              }}>
                {sendResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: SPACING.sm }}>
              <button
                onClick={onMarkPaid}
                style={{
                  flex: 1, padding: '12px', borderRadius: RADIUS.md, border: 'none',
                  background: COLORS.success, color: '#fff',
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                }}
              >
                Mark as Paid
              </button>
              <button
                onClick={onVoid}
                style={{
                  padding: '12px 20px', borderRadius: RADIUS.md, border: `1px solid ${COLORS.danger}30`,
                  background: 'transparent', color: COLORS.danger,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                  cursor: 'pointer',
                }}
              >
                Void
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MICRO COMPONENTS
// ============================================================================
function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: FONT.sizeSm, color: color || COLORS.textMuted }}>{label}</span>
      <span style={{
        fontSize: bold ? FONT.sizeBase : FONT.sizeSm,
        fontWeight: bold ? FONT.weightBold : FONT.weightMedium,
        color: color || COLORS.textPrimary,
      }}>{value}</span>
    </div>
  );
}

function ActivityRow({ icon, label, time, color }: { icon: string; label: string; time: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary, flex: 1 }}>{label}</span>
      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{time}</span>
    </div>
  );
}
