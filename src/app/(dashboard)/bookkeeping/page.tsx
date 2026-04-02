'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, Modal, TextInput, SelectInput, FormField } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import ExpenseImportModal from './ExpenseImportModal';

interface Transaction {
  id: number;
  transaction_id: string;
  txn_date: string;
  brand: string;
  direction: string;
  event_type: string;
  amount: number;
  account: string | null;
  category: string;
  vendor_or_customer: string | null;
  payment_method: string | null;
  memo: string | null;
}

interface Category {
  id: number;
  type: string;
  name: string;
}

export default function ExpenseTrackerPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Current month filter
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formVendor, setFormVendor] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPayment, setFormPayment] = useState('');
  const [formMemo, setFormMemo] = useState('');
  const [formBrand, setFormBrand] = useState('default');
  const [submitting, setSubmitting] = useState(false);

  // MTD totals
  const [mtdExpenses, setMtdExpenses] = useState(0);
  const [mtdRevenue, setMtdRevenue] = useState(0);

  // Brands from brands table (via config API)
  const [brands, setBrands] = useState<string[]>([]);

  const expenseCategories = categories.filter(c => c.type === 'expense');

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/bookkeeping?type=transactions&month=${month}&direction=OUT&limit=100`).then(r => r.json()),
      fetch('/api/bookkeeping?type=categories').then(r => r.json()),
      fetch(`/api/bookkeeping/summary?month=${month}`).then(r => r.json()),
      fetch('/api/auto/config').then(r => r.json()),
    ])
      .then(([txnData, catData, summaryData, configData]) => {
        setTransactions(txnData.transactions || []);
        setTotal(txnData.total || 0);
        setCategories(catData.categories || []);
        setMtdExpenses(summaryData.totalExpenses || 0);
        setMtdRevenue(summaryData.totalRevenue || 0);
        // Read brands from brands table (returned by config API)
        // Falls back to shop_config.brands JSONB for backwards compatibility
        if (configData.brands && Array.isArray(configData.brands) && configData.brands.length > 0) {
          setBrands(configData.brands.filter((b: { active: boolean }) => b.active).map((b: { name: string }) => b.name));
        } else if (configData.shopConfig?.brands && Array.isArray(configData.shopConfig.brands) && configData.shopConfig.brands.length > 0) {
          setBrands(configData.shopConfig.brands);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSubmit() {
    if (!formDate || !formCategory || !formAmount) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/bookkeeping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txn_date: formDate,
          vendor: formVendor,
          category: formCategory,
          amount: formAmount,
          payment_method: formPayment,
          memo: formMemo,
          brand: formBrand,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormVendor(''); setFormCategory(''); setFormAmount('');
        setFormPayment(''); setFormMemo('');
        setFormDate(new Date().toISOString().split('T')[0]);
        fetchData();
      }
    } catch { /* silent */ }
    setSubmitting(false);
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this expense?')) return;
    await fetch(`/api/bookkeeping?id=${id}`, { method: 'DELETE' });
    fetchData();
  }

  function formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const monthLabel = new Date(month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div>
      <PageHeader
        title="Expense"
        titleAccent="Tracker"
        subtitle={`Bookkeeping -- ${monthLabel}`}
        actions={
          <div style={{ display: 'flex', gap: SPACING.sm }}>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              Import CSV
            </Button>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Add Expense
            </Button>
          </div>
        }
      />

      {/* MTD summary */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: 'wrap' }}>
        <StatBox label="MTD Expenses" value={`$${mtdExpenses.toLocaleString()}`} color={COLORS.danger} />
        <StatBox label="MTD Revenue" value={`$${mtdRevenue.toLocaleString()}`} color={COLORS.success} />
        <StatBox label="Net" value={`$${(mtdRevenue - mtdExpenses).toLocaleString()}`}
          color={mtdRevenue - mtdExpenses >= 0 ? COLORS.success : COLORS.danger} />
        <StatBox label="Expenses This Month" value={String(total)} />
      </div>

      {/* Month picker */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, alignItems: 'center' }}>
        <TextInput
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ maxWidth: 200, minHeight: 40 }}
        />
      </div>

      {/* Expenses list */}
      <DashboardCard title={`Expenses -- ${monthLabel}`} noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>
            No expenses recorded for {monthLabel}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Vendor</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Memo</th>
                <th style={thStyle}>Payment</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(txn => (
                <tr key={txn.id}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDate(txn.txn_date)}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: FONT.weightMedium, color: COLORS.textPrimary }}>
                    {txn.vendor_or_customer || '--'}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: FONT.sizeXs, padding: '2px 8px',
                      background: COLORS.activeBg, borderRadius: RADIUS.sm,
                      color: COLORS.textSecondary,
                    }}>
                      {txn.category}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {txn.memo || '--'}
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted }}>{txn.payment_method || '--'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: FONT.weightBold, color: COLORS.danger, fontVariantNumeric: 'tabular-nums' }}>
                    ${Number(txn.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleDelete(txn.id)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: COLORS.textMuted, fontSize: FONT.sizeSm,
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = COLORS.danger}
                      onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}
                    >
                      x
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardCard>

      {/* Add Expense Modal */}
      {showForm && (
        <Modal
          title="Add Expense"
          onClose={() => setShowForm(false)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={!formDate || !formCategory || !formAmount || submitting}>
                {submitting ? 'Saving...' : 'Add Expense'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Date *">
              <TextInput type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
            </FormField>
            <FormField label="Amount *">
              <TextInput type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="0.00" step="0.01" />
            </FormField>
          </div>
          <FormField label="Vendor">
            <TextInput value={formVendor} onChange={e => setFormVendor(e.target.value)} placeholder="e.g. Amazon, Home Depot, Llumar..." />
          </FormField>
          <FormField label="Category *">
            <SelectInput value={formCategory} onChange={e => setFormCategory(e.target.value)}>
              <option value="">Select category...</option>
              {expenseCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </SelectInput>
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: brands.length > 0 ? '1fr 1fr' : '1fr', gap: SPACING.md }}>
            <FormField label="Payment Method">
              <SelectInput value={formPayment} onChange={e => setFormPayment(e.target.value)}>
                <option value="">Select...</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Venmo">Venmo</option>
                <option value="CashApp">CashApp</option>
                <option value="Zelle">Zelle</option>
              </SelectInput>
            </FormField>
            {brands.length > 0 && (
              <FormField label="Brand">
                <SelectInput value={formBrand} onChange={e => setFormBrand(e.target.value)}>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </SelectInput>
              </FormField>
            )}
          </div>
          <FormField label="Memo / Description">
            <TextInput value={formMemo} onChange={e => setFormMemo(e.target.value)} placeholder="What was this for?" />
          </FormField>
        </Modal>
      )}

      {showImport && (
        <ExpenseImportModal
          categories={categories}
          onClose={() => setShowImport(false)}
          onComplete={() => { setShowImport(false); fetchData(); }}
        />
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, padding: SPACING.md,
      background: COLORS.cardBg, borderRadius: RADIUS.sm,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: color || COLORS.textPrimary }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeXs,
  fontWeight: FONT.weightSemibold,
  color: COLORS.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  textAlign: 'left',
  borderBottom: `1px solid ${COLORS.border}`,
};

const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
};
