'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

interface Transaction {
  id: number;
  transaction_id: string;
  txn_date: string;
  brand: string;
  direction: string;
  event_type: string;
  amount: number;
  category: string;
  vendor_or_customer: string | null;
  payment_method: string | null;
  memo: string | null;
  invoice_id: string | null;
  posted_at: string | null;
}

export default function LedgerPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [direction, setDirection] = useState('');

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ type: 'transactions', month, limit: String(limit), offset: String(offset) });
    if (direction) params.set('direction', direction);

    fetch(`/api/bookkeeping?${params}`)
      .then(r => r.json())
      .then(data => {
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, direction, offset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const monthLabel = new Date(month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Running totals
  const totalIn = transactions.filter(t => t.direction === 'IN').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions.filter(t => t.direction === 'OUT').reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div>
      <PageHeader
        title="Transaction"
        titleAccent="Ledger"
        subtitle={`Bookkeeping -- All transactions for ${monthLabel}`}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: isMobile ? SPACING.sm : SPACING.lg, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextInput
          type="month"
          value={month}
          onChange={e => { setMonth(e.target.value); setOffset(0); }}
          style={{ maxWidth: isMobile ? '100%' : 200, minHeight: 40, width: isMobile ? '100%' : 'auto', flex: isMobile ? '1 1 100%' : undefined }}
        />
        <SelectInput value={direction} onChange={e => { setDirection(e.target.value); setOffset(0); }} style={{ maxWidth: isMobile ? '100%' : 160, minHeight: 40, flex: isMobile ? '1 1 100%' : undefined }}>
          <option value="">All Transactions</option>
          <option value="IN">Revenue (IN)</option>
          <option value="OUT">Expenses (OUT)</option>
        </SelectInput>
        {!isMobile && <div style={{ flex: 1 }} />}
        <div style={{ display: 'flex', gap: isMobile ? SPACING.md : SPACING.lg, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : undefined }}>
          <span style={{ fontSize: FONT.sizeSm }}>
            <span style={{ color: COLORS.textMuted }}>IN:</span>{' '}
            <span style={{ color: COLORS.success, fontWeight: FONT.weightBold }}>${totalIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </span>
          <span style={{ fontSize: FONT.sizeSm }}>
            <span style={{ color: COLORS.textMuted }}>OUT:</span>{' '}
            <span style={{ color: COLORS.danger, fontWeight: FONT.weightBold }}>${totalOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </span>
          <span style={{ fontSize: FONT.sizeSm }}>
            <span style={{ color: COLORS.textMuted }}>NET:</span>{' '}
            <span style={{ color: totalIn - totalOut >= 0 ? COLORS.success : COLORS.danger, fontWeight: FONT.weightBold }}>
              ${(totalIn - totalOut).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </span>
        </div>
      </div>

      {/* Ledger table */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>
            No transactions for {monthLabel}
          </div>
        ) : (
          isMobile ? (
            <div style={{ padding: SPACING.sm }}>
              {transactions.map(txn => {
                const isIn = txn.direction === 'IN';
                return (
                  <div key={txn.id} style={{
                    padding: `${SPACING.md}px ${SPACING.md}px`,
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    {/* Row 1: Vendor/Customer + Amount */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs }}>
                      <span style={{ fontWeight: FONT.weightMedium, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                        {txn.vendor_or_customer || txn.category}
                      </span>
                      <span style={{
                        fontWeight: FONT.weightBold, fontSize: FONT.sizeSm,
                        color: isIn ? COLORS.success : COLORS.danger,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {isIn ? '+' : '-'}${Number(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {/* Row 2: Date + Type badge + Category */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(txn.txn_date)}</span>
                      <span style={{
                        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                        padding: '1px 6px', borderRadius: RADIUS.sm,
                        color: isIn ? COLORS.success : COLORS.danger,
                        background: isIn ? COLORS.successBg : COLORS.dangerBg,
                      }}>
                        {txn.direction}
                      </span>
                      <span>{txn.category}</span>
                      {txn.payment_method && <span>{txn.payment_method}</span>}
                    </div>
                    {/* Row 3: Memo (if exists) */}
                    {txn.memo && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.xs, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {txn.memo}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Vendor / Customer</th>
                    <th style={thStyle}>Memo</th>
                    <th style={thStyle}>Payment</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(txn => {
                    const isIn = txn.direction === 'IN';
                    return (
                      <tr key={txn.id}>
                        <td style={{ ...tdStyle, fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>
                          {txn.transaction_id}
                        </td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {formatDate(txn.txn_date)}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                            padding: '2px 8px', borderRadius: RADIUS.sm,
                            color: isIn ? COLORS.success : COLORS.danger,
                            background: isIn ? COLORS.successBg : COLORS.dangerBg,
                          }}>
                            {txn.direction} / {txn.event_type}
                          </span>
                        </td>
                        <td style={tdStyle}>{txn.category}</td>
                        <td style={{ ...tdStyle, fontWeight: FONT.weightMedium, color: COLORS.textPrimary }}>
                          {txn.vendor_or_customer || '--'}
                        </td>
                        <td style={{ ...tdStyle, color: COLORS.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.memo || '--'}
                        </td>
                        <td style={{ ...tdStyle, color: COLORS.textMuted }}>{txn.payment_method || '--'}</td>
                        <td style={{
                          ...tdStyle, textAlign: 'right', fontWeight: FONT.weightBold,
                          color: isIn ? COLORS.success : COLORS.danger,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {isIn ? '+' : '-'}${Number(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Pagination */}
        {total > limit && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: SPACING.sm,
            padding: SPACING.md, borderTop: `1px solid ${COLORS.border}`,
          }}>
            <Button variant="secondary" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>
              Previous
            </Button>
            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, padding: '6px 12px' }}>
              {offset + 1}-{Math.min(offset + limit, total)} of {total}
            </span>
            <Button variant="secondary" onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}>
              Next
            </Button>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
  color: COLORS.textMuted, textTransform: 'uppercase',
  letterSpacing: '0.5px', textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
};

const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm, color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
};
