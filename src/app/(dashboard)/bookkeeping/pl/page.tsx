'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

interface CategoryTotal {
  category: string;
  amount: number;
}

interface Summary {
  period: { start: string; end: string };
  revenue: CategoryTotal[];
  expenses: CategoryTotal[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  transactionCount: number;
}

export default function ProfitLossPage() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [viewMode, setViewMode] = useState<'month' | 'year'>('month');
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [year, setYear] = useState(String(now.getFullYear()));

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = viewMode === 'month' ? `month=${month}` : `year=${year}`;
    fetch(`/api/bookkeeping/summary?${params}`)
      .then(r => r.json())
      .then(data => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [viewMode, month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodLabel = viewMode === 'month'
    ? new Date(month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : year;

  // Export as CSV
  function handleExport() {
    if (!summary) return;
    const lines: string[] = [];
    lines.push(`Profit & Loss Statement -- ${periodLabel}`);
    lines.push('');
    lines.push('REVENUE');
    lines.push('Category,Amount');
    for (const r of summary.revenue) {
      lines.push(`${r.category},${r.amount.toFixed(2)}`);
    }
    lines.push(`Total Revenue,${summary.totalRevenue.toFixed(2)}`);
    lines.push('');
    lines.push('EXPENSES');
    lines.push('Category,Amount');
    for (const e of summary.expenses) {
      lines.push(`${e.category},${e.amount.toFixed(2)}`);
    }
    lines.push(`Total Expenses,${summary.totalExpenses.toFixed(2)}`);
    lines.push('');
    lines.push(`NET PROFIT,${summary.netProfit.toFixed(2)}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PL_${viewMode === 'month' ? month : year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Profit &"
        titleAccent="Loss"
        subtitle={`Bookkeeping -- ${periodLabel}`}
        actions={
          <Button variant="secondary" onClick={handleExport} disabled={!summary}>
            Export CSV
          </Button>
        }
      />

      {/* Period picker */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <SelectInput value={viewMode} onChange={e => setViewMode(e.target.value as 'month' | 'year')} style={{ maxWidth: isMobile ? '100%' : 140, minHeight: 40, flex: isMobile ? '1 1 100%' : undefined }}>
          <option value="month">Monthly</option>
          <option value="year">Annual</option>
        </SelectInput>
        {viewMode === 'month' ? (
          <TextInput type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ maxWidth: isMobile ? '100%' : 200, minHeight: 40, flex: isMobile ? '1 1 100%' : undefined }} />
        ) : (
          <SelectInput value={year} onChange={e => setYear(e.target.value)} style={{ maxWidth: isMobile ? '100%' : 120, minHeight: 40, flex: isMobile ? '1 1 100%' : undefined }}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
          </SelectInput>
        )}
      </div>

      {loading ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        </DashboardCard>
      ) : !summary ? (
        <DashboardCard>
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>No data</div>
        </DashboardCard>
      ) : (
        <>
          {/* Top-level summary */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: SPACING.md, marginBottom: SPACING.lg }}>
            <div style={{
              padding: isMobile ? SPACING.md : SPACING.xl,
              background: COLORS.cardBg, borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Revenue</div>
              <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: FONT.weightBold, color: COLORS.success }}>
                ${summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              padding: isMobile ? SPACING.md : SPACING.xl,
              background: COLORS.cardBg, borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.border}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Expenses</div>
              <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: FONT.weightBold, color: COLORS.danger }}>
                ${summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              padding: isMobile ? SPACING.md : SPACING.xl,
              background: COLORS.cardBg, borderRadius: RADIUS.md,
              border: `2px solid ${summary.netProfit >= 0 ? COLORS.success : COLORS.danger}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: '1px' }}>Net Profit</div>
              <div style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: FONT.weightBold, color: summary.netProfit >= 0 ? COLORS.success : COLORS.danger }}>
                ${summary.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Two-column: Revenue | Expenses */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.lg }}>
            {/* Revenue breakdown */}
            <DashboardCard title="Revenue">
              {summary.revenue.length === 0 ? (
                <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>No revenue recorded</div>
              ) : (
                <div>
                  {summary.revenue.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: `${SPACING.sm}px 0`,
                      borderBottom: i < summary.revenue.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    }}>
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>{r.category}</span>
                      <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.success, fontVariantNumeric: 'tabular-nums' }}>
                        ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: `${SPACING.md}px 0 0`,
                    marginTop: SPACING.sm,
                    borderTop: `2px solid ${COLORS.border}`,
                    fontWeight: FONT.weightBold, fontSize: FONT.sizeBase,
                  }}>
                    <span style={{ color: COLORS.textPrimary }}>Total</span>
                    <span style={{ color: COLORS.success }}>
                      ${summary.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </DashboardCard>

            {/* Expenses breakdown */}
            <DashboardCard title="Expenses">
              {summary.expenses.length === 0 ? (
                <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>No expenses recorded</div>
              ) : (
                <div>
                  {summary.expenses.map((e, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: `${SPACING.sm}px 0`,
                      borderBottom: i < summary.expenses.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                    }}>
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>{e.category}</span>
                      <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.danger, fontVariantNumeric: 'tabular-nums' }}>
                        ${e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: `${SPACING.md}px 0 0`,
                    marginTop: SPACING.sm,
                    borderTop: `2px solid ${COLORS.border}`,
                    fontWeight: FONT.weightBold, fontSize: FONT.sizeBase,
                  }}>
                    <span style={{ color: COLORS.textPrimary }}>Total</span>
                    <span style={{ color: COLORS.danger }}>
                      ${summary.totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </DashboardCard>
          </div>
        </>
      )}
    </div>
  );
}
