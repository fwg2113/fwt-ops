'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile } from '@/app/hooks/useIsMobile';

interface Connection {
  id: number;
  institution_name: string;
  account_name: string;
  default_brand: string;
  connected_at: string;
}

interface FilteredTransaction {
  date: string;
  description: string;
  amount: number;
  reason: string;
}

interface FetchedTransaction {
  plaid_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  vendor: string;
  brand: string;
  duplicate: boolean;
  selected: boolean;
  account: string;
}

interface VendorMapping {
  id: number;
  pattern: string;
  category: string;
  vendor_name: string | null;
  brand: string | null;
  filter_out: boolean;
}

// ============================================================================
// CSV PARSING + BANK FORMAT DETECTION
// ============================================================================

type BankFormat = 'pnc_checking' | 'pnc_cc' | 'td_bank' | 'venmo' | 'chase' | 'amex' | 'generic';

interface BankFormatConfig {
  name: string;
  dateCol: number;
  descCol: number;
  amountCol: number;
  debitCol?: number; // separate debit column (TD Bank)
  creditCol?: number;
  amountIsExpensePositive: boolean; // true = positive means expense (PNC CC, Plaid), false = negative means expense (PNC Checking)
  skipRows: number; // header rows to skip
}

const BANK_FORMATS: Record<BankFormat, BankFormatConfig> = {
  pnc_checking: { name: 'PNC Checking', dateCol: 0, descCol: 1, amountCol: 2, amountIsExpensePositive: false, skipRows: 1 },
  pnc_cc: { name: 'PNC Credit Card', dateCol: 0, descCol: 1, amountCol: 3, amountIsExpensePositive: true, skipRows: 1 },
  td_bank: { name: 'TD Bank', dateCol: 0, descCol: 4, amountCol: -1, debitCol: 5, creditCol: 6, amountIsExpensePositive: true, skipRows: 1 },
  venmo: { name: 'Venmo', dateCol: 2, descCol: 5, amountCol: 8, amountIsExpensePositive: false, skipRows: 3 },
  chase: { name: 'Chase', dateCol: 0, descCol: 2, amountCol: 3, amountIsExpensePositive: true, skipRows: 1 },
  amex: { name: 'American Express', dateCol: 0, descCol: 1, amountCol: 2, amountIsExpensePositive: true, skipRows: 1 },
  generic: { name: 'Generic', dateCol: 0, descCol: 1, amountCol: 2, amountIsExpensePositive: false, skipRows: 1 },
};

function detectBankFormat(headers: string[]): BankFormat {
  const h = headers.map(s => (s || '').toLowerCase().trim());
  // PNC Checking: Date, Description, Withdrawals, Deposits, Balance
  if (h.includes('withdrawals') && h.includes('deposits')) return 'pnc_checking';
  // PNC CC: Date, Description, Spending Category, Amount
  if (h.includes('spending category')) return 'pnc_cc';
  // TD Bank: DATE, ... DESCRIPTION, DEBIT, CREDIT
  if (h.includes('bank rtn') || h.includes('transaction type')) return 'td_bank';
  // Venmo: has Username, Note, From, To columns
  if (h.some(v => v.includes('username')) || h.some(v => v.includes('note'))) return 'venmo';
  // Chase: Transaction Date, Post Date, Description, Amount
  if (h.includes('post date') || (h.includes('transaction date') && h.includes('description'))) return 'chase';
  // Amex: Date, Description, Amount
  if (h.length <= 5 && h.includes('date') && h.includes('amount')) return 'amex';
  return 'generic';
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current.trim()); current = '';
        if (row.some(v => v)) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  if (current || row.length) { row.push(current.trim()); if (row.some(v => v)) rows.push(row); }
  return rows;
}

function parseDate(val: string): string | null {
  if (!val) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const y = slashMatch[3].length === 2 ? '20' + slashMatch[3] : slashMatch[3];
    return `${y}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
  }
  // Try Date parse
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch { /* */ }
  return null;
}

// Income patterns to auto-skip
const CSV_INCOME_PATTERNS = [
  /^(ACH\s+)?DEP(OSIT)?\b/i,
  /MOBILE\s+DEP/i,
  /PAYPAL\s+TRANSFER/i,
  /SHOPIFY\s+ACH/i,
  /ZELLE\s+(FROM|RECEIVED)/i,
  /INTEREST\s+(PAYMENT|EARNED)/i,
];

function cleanVendor(desc: string): string {
  return desc
    .replace(/^DEBIT CARD PURCHASE\s+x+\d+\s+/i, '')
    .replace(/^RECURRING DEBIT CARD\s+x+\d+\s+/i, '')
    .replace(/^ACH\s+(DEP\s+)?/i, '')
    .replace(/\s+CARD\d+$/i, '')
    .replace(/\s+\d{3}-[\dx]{3,}-?\d{0,4}\s+\w{2}$/i, '')
    .replace(/\s+[A-Z]{2}$/i, '')
    .trim()
    .replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase())
    .substring(0, 50);
}

export default function BankFetchPage() {
  const isMobile = useIsMobile();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [vendorMappings, setVendorMappings] = useState<VendorMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch state
  const [selectedConnection, setSelectedConnection] = useState<number | ''>('');
  const [dateRange, setDateRange] = useState('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [fetching, setFetching] = useState(false);
  const [transactions, setTransactions] = useState<FetchedTransaction[]>([]);
  const [fetchInfo, setFetchInfo] = useState<{ total: number; filteredCount: number } | null>(null);
  const [filteredTxns, setFilteredTxns] = useState<FilteredTransaction[]>([]);
  const [showFiltered, setShowFiltered] = useState(false);

  // Post state
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);

  // Categories for dropdown
  const [categories, setCategories] = useState<string[]>([]);

  // Brands
  const [brands, setBrands] = useState<Array<{ short_name: string }>>([]);

  // CSV import state
  const [csvFormat, setCsvFormat] = useState<BankFormat | ''>('');
  const [csvAccountName, setCsvAccountName] = useState('CSV Import');
  const [csvDefaultBrand, setCsvDefaultBrand] = useState('default');

  // Save rule modal
  const [ruleTarget, setRuleTarget] = useState<FetchedTransaction | null>(null);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleVendor, setRuleVendor] = useState('');
  const [ruleBrand, setRuleBrand] = useState('');
  const [ruleFilterOut, setRuleFilterOut] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [plaidRes, catRes, settingsRes] = await Promise.all([
      fetch('/api/plaid').then(r => r.json()),
      fetch('/api/bookkeeping?type=categories').then(r => r.json()),
      fetch('/api/auto/settings').then(r => r.json()),
    ]);
    setConnections(plaidRes.connections || []);
    setVendorMappings(plaidRes.vendorMappings || []);
    const expCats = ((catRes.categories || []) as Array<{ name: string; type: string }>)
      .filter(c => c.type === 'expense')
      .map(c => c.name);
    setCategories(expCats);
    setBrands((settingsRes.brands || []).map((b: { short_name: string }) => ({ short_name: b.short_name })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleConnectBank() {
    // Get a link token from the server
    const res = await fetch('/api/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'link_token', data: {} }),
    });
    const { link_token } = await res.json();
    if (!link_token) { alert('Failed to create link token'); return; }

    // Load Plaid Link SDK if not already loaded
    if (!(window as unknown as Record<string, unknown>).Plaid) {
      const script = document.createElement('script');
      script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      script.async = true;
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Plaid'));
        document.head.appendChild(script);
      });
    }

    // Open Plaid Link
    const plaid = (window as unknown as Record<string, unknown>).Plaid as {
      create: (config: Record<string, unknown>) => { open: () => void };
    };

    const handler = plaid.create({
      token: link_token,
      onSuccess: async (publicToken: string, metadata: { institution?: { name?: string; institution_id?: string } }) => {
        const institutionName = metadata?.institution?.name || 'Bank';
        const institutionId = metadata?.institution?.institution_id || '';
        const accountName = prompt(`Display name for this account (e.g., "${institutionName} Checking"):`, institutionName) || institutionName;

        await fetch('/api/plaid', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'exchange',
            data: {
              public_token: publicToken,
              institution_name: institutionName,
              institution_id: institutionId,
              account_name: accountName,
            },
          }),
        });
        fetchData(); // refresh connections list
      },
      onExit: () => { /* user closed */ },
    });

    handler.open();
  }

  async function handleCSVFile(file: File) {
    // Fetch existing ledger transactions BEFORE reading file (async-safe)
    let existingForDupeCheck: Array<{ txn_date: string; amount: number }> = [];
    try {
      const dupeRes = await fetch('/api/bookkeeping?type=recent_for_dupes');
      const dupeData = await dupeRes.json();
      existingForDupeCheck = dupeData.transactions || [];
    } catch { /* fall back to empty */ }

    const text = await file.text();
    if (!text) return;

    const rows = parseCSV(text);
    if (rows.length < 2) return;

    // Auto-detect format from first row (headers)
    const headers = rows[0];
    const detected = detectBankFormat(headers);
    const format = csvFormat || detected;
    const config = BANK_FORMATS[format];

    setPostResult(null);

    // Process rows (skip header rows)
    const processed: FetchedTransaction[] = [];
    const filtered: FilteredTransaction[] = [];

    for (let i = config.skipRows; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(v => !v)) continue;

        const dateStr = parseDate(row[config.dateCol] || '');
        if (!dateStr) continue;

        const description = (row[config.descCol] || '').trim();
        if (!description) continue;

        // Parse amount based on format
        let amount = 0;
        let isExpense = true;

        if (format === 'pnc_checking') {
          // Withdrawals column (index 2) = expense, Deposits column (index 3) = income
          const withdrawal = parseFloat((row[2] || '0').replace(/[$,]/g, ''));
          const deposit = parseFloat((row[3] || '0').replace(/[$,]/g, ''));
          if (deposit > 0) { amount = deposit; isExpense = false; }
          else { amount = Math.abs(withdrawal); isExpense = true; }
        } else if (config.debitCol !== undefined && config.creditCol !== undefined) {
          // TD Bank style: separate debit/credit columns
          const debit = parseFloat((row[config.debitCol] || '0').replace(/[$,]/g, ''));
          const credit = parseFloat((row[config.creditCol] || '0').replace(/[$,]/g, ''));
          if (credit > 0) { amount = credit; isExpense = false; }
          else { amount = Math.abs(debit); isExpense = true; }
        } else {
          const raw = parseFloat((row[config.amountCol] || '0').replace(/[$,]/g, ''));
          if (config.amountIsExpensePositive) {
            amount = Math.abs(raw);
            isExpense = raw > 0;
          } else {
            amount = Math.abs(raw);
            isExpense = raw < 0 || raw > 0; // for checking accounts, negative = expense
            // Actually for PNC checking: negative = withdrawal (expense), positive = deposit (income)
            isExpense = raw < 0;
            if (raw > 0) isExpense = false;
            amount = Math.abs(raw);
          }
        }

        if (amount === 0) continue;

        // Skip income
        if (!isExpense || CSV_INCOME_PATTERNS.some(p => p.test(description))) {
          filtered.push({ date: dateStr, description, amount, reason: 'Income' });
          continue;
        }

        // Auto-categorize using vendor mappings
        const descLower = description.toLowerCase();
        let category = '';
        let vendor = cleanVendor(description);
        let brand = csvDefaultBrand;
        let filterOut = false;

        for (const mapping of vendorMappings) {
          if (descLower.includes(mapping.pattern.toLowerCase())) {
            category = mapping.category;
            if (mapping.vendor_name) vendor = mapping.vendor_name;
            if (mapping.brand) brand = mapping.brand;
            filterOut = mapping.filter_out;
            break;
          }
        }

        if (filterOut) {
          filtered.push({ date: dateStr, description, amount, reason: 'Filter Rule' });
          continue;
        }

        // Tiered duplicate check against ledger (same logic as Plaid path)
        const isDup = (() => {
          const cents = Math.round((amount % 1) * 100);
          const windowDays = cents !== 0 ? 5 : (Math.floor(amount) >= 100 && (Math.floor(amount) % 100 === 0 || Math.floor(amount) % 50 === 0)) ? 1 : 3;
          const txnDate = new Date(dateStr + 'T12:00:00');
          return existingForDupeCheck.some(ex => {
            const exDate = new Date(ex.txn_date + 'T12:00:00');
            const dayDiff = Math.abs((txnDate.getTime() - exDate.getTime()) / (1000 * 60 * 60 * 24));
            return dayDiff <= windowDays && Math.abs(Number(ex.amount) - amount) < 0.01;
          });
        })();

        processed.push({
          plaid_id: `csv-${i}`,
          date: dateStr,
          description,
          amount,
          category,
          vendor,
          brand,
          duplicate: isDup,
          selected: !isDup && !!category,
          account: csvAccountName,
        });
      }

      setTransactions(processed);
      setFilteredTxns(filtered);
      setFetchInfo({ total: rows.length - config.skipRows, filteredCount: filtered.length });
      setShowFiltered(false);

    // Auto-set the detected format
    if (!csvFormat) setCsvFormat(detected);
  }

  async function handleFetch() {
    if (!selectedConnection) return;
    setFetching(true);
    setPostResult(null);

    let startDate: string;
    let endDate: string;
    const now = new Date();

    if (dateRange === 'custom') {
      startDate = customStart;
      endDate = customEnd;
    } else {
      const days = parseInt(dateRange);
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      startDate = start.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    }

    const res = await fetch('/api/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'fetch',
        data: { connection_id: selectedConnection, start_date: startDate, end_date: endDate },
      }),
    });
    const data = await res.json();
    setTransactions(data.transactions || []);
    setFilteredTxns(data.filtered || []);
    setFetchInfo({ total: data.total || 0, filteredCount: data.filteredCount || 0 });
    setShowFiltered(false);
    setFetching(false);
  }

  function toggleSelect(idx: number) {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t));
  }

  function selectAll() { setTransactions(prev => prev.map(t => ({ ...t, selected: true }))); }
  function deselectAll() { setTransactions(prev => prev.map(t => ({ ...t, selected: false }))); }
  function selectMapped() { setTransactions(prev => prev.map(t => ({ ...t, selected: !!t.category && !t.duplicate }))); }
  function deselectDuplicates() { setTransactions(prev => prev.map(t => t.duplicate ? { ...t, selected: false } : t)); }

  function updateTxn(idx: number, updates: Partial<FetchedTransaction>) {
    setTransactions(prev => prev.map((t, i) => i === idx ? { ...t, ...updates } : t));
  }

  async function handlePost() {
    const selected = transactions.filter(t => t.selected);
    const uncategorized = selected.filter(t => !t.category);
    if (uncategorized.length > 0) {
      alert(`${uncategorized.length} selected transactions have no category. Please categorize them first.`);
      return;
    }
    if (selected.length === 0) {
      alert('No transactions selected.');
      return;
    }

    setPosting(true);

    // Build transaction records
    const records = selected.map(t => ({
      txn_date: t.date,
      brand: t.brand || 'default',
      category: t.category,
      amount: t.amount,
      vendor: t.vendor,
      account: t.account,
      memo: t.description,
      payment_method: null,
      service_line: null,
    }));

    const res = await fetch('/api/bookkeeping/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: records, posted_by: 'bank_import' }),
    });

    if (res.ok) {
      const data = await res.json();
      setPostResult(`Posted ${data.count || selected.length} transactions.`);
      // Remove posted transactions from the list
      setTransactions(prev => prev.filter(t => !t.selected));
    } else {
      setPostResult('Error posting transactions.');
    }
    setPosting(false);
  }

  async function handleSaveRule() {
    if (!rulePattern || (!ruleFilterOut && !ruleCategory)) return;
    await fetch('/api/plaid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_rule',
        data: {
          pattern: rulePattern,
          category: ruleFilterOut ? 'Ignored' : ruleCategory,
          vendor_name: ruleVendor || null,
          brand: ruleBrand || null,
          filter_out: ruleFilterOut,
        },
      }),
    });
    // Remove the row from the current view if filtering out
    if (ruleFilterOut && ruleTarget) {
      const targetDesc = ruleTarget.description;
      setTransactions(prev => {
        const removed = prev.filter(t => !t.description.toLowerCase().includes(rulePattern.toLowerCase()));
        const filtered = prev.filter(t => t.description.toLowerCase().includes(rulePattern.toLowerCase()));
        setFilteredTxns(old => [...old, ...filtered.map(t => ({ date: t.date, description: t.description, amount: t.amount, reason: 'Filter Rule' }))]);
        return removed;
      });
    }
    setRuleTarget(null);
    setRuleFilterOut(false);
    fetchData(); // refresh mappings
  }

  const selectedCount = transactions.filter(t => t.selected).length;
  const selectedTotal = transactions.filter(t => t.selected).reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <PageHeader title="Bank" titleAccent="Import" subtitle="Fetch transactions from connected bank accounts" />

      {/* Connected Accounts + Fetch Controls */}
      <DashboardCard title="Fetch Transactions">
        {loading ? (
          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Loading...</div>
        ) : (
          <>
          {/* Connected accounts list */}
          {connections.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: SPACING.md }}>
              {connections.map(c => (
                <span key={c.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 20,
                  background: COLORS.hoverBg, border: `1px solid ${COLORS.border}`,
                  fontSize: FONT.sizeXs, color: COLORS.textPrimary, fontWeight: 600,
                }}>
                  {c.account_name}
                </span>
              ))}
              <button onClick={handleConnectBank} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 12px', borderRadius: 20, cursor: 'pointer',
                background: 'transparent', border: `1px dashed ${COLORS.border}`,
                fontSize: FONT.sizeXs, color: COLORS.textMuted,
              }}>
                + Connect Bank
              </button>
            </div>
          )}
          {connections.length === 0 && (
            <div style={{ marginBottom: SPACING.md }}>
              <p style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, margin: `0 0 ${SPACING.sm}px` }}>No bank accounts connected.</p>
              <Button variant="primary" onClick={handleConnectBank}>Connect Bank Account</Button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: SPACING.md, alignItems: isMobile ? 'stretch' : 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Account</label>
              <SelectInput value={selectedConnection} onChange={e => setSelectedConnection(e.target.value ? parseInt(e.target.value) : '')}>
                <option value="">Select account...</option>
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.account_name} ({c.institution_name})</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Date Range</label>
              <SelectInput value={dateRange} onChange={e => setDateRange(e.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="60">Last 60 days</option>
                <option value="90">Last 90 days</option>
                <option value="custom">Custom</option>
              </SelectInput>
            </div>
            {dateRange === 'custom' && (
              <>
                <div>
                  <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Start</label>
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                    style={{ padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm }} />
                </div>
                <div>
                  <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>End</label>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                    style={{ padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm }} />
                </div>
              </>
            )}
            <Button variant="primary" onClick={handleFetch} disabled={fetching || !selectedConnection}>
              {fetching ? 'Fetching...' : 'Fetch'}
            </Button>
          </div>
          </>
        )}
      </DashboardCard>

      {/* CSV Upload */}
      <DashboardCard title="Import CSV">
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: SPACING.md, alignItems: isMobile ? 'stretch' : 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Bank Format</label>
            <SelectInput value={csvFormat} onChange={e => setCsvFormat(e.target.value as BankFormat | '')}>
              <option value="">Auto-Detect</option>
              <option value="pnc_checking">PNC Checking</option>
              <option value="pnc_cc">PNC Credit Card</option>
              <option value="td_bank">TD Bank</option>
              <option value="chase">Chase</option>
              <option value="amex">American Express</option>
              <option value="venmo">Venmo</option>
              <option value="generic">Generic (Date, Description, Amount)</option>
            </SelectInput>
          </div>
          <div>
            <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Account Name</label>
            <input value={csvAccountName} onChange={e => setCsvAccountName(e.target.value)} placeholder="PNC Checking"
              style={{ padding: '8px 12px', background: COLORS.inputBg, color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, width: isMobile ? '100%' : 160 }} />
          </div>
          <div>
            <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, display: 'block', marginBottom: 4 }}>Default Brand</label>
            <SelectInput value={csvDefaultBrand} onChange={e => setCsvDefaultBrand(e.target.value)} style={{ width: isMobile ? '100%' : 100 }}>
              <option value="default">--</option>
              <option value="FWT">FWT</option>
              <option value="FWG">FWG</option>
              <option value="FA">FA</option>
              <option value="SHARED">SHARED</option>
            </SelectInput>
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 20px', borderRadius: RADIUS.sm, cursor: 'pointer',
            background: COLORS.red, color: '#fff', fontSize: FONT.sizeSm, fontWeight: 600,
            border: 'none', whiteSpace: 'nowrap',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Upload CSV
            <input type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCSVFile(f); e.target.value = ''; }} />
          </label>
        </div>
        {csvFormat && (
          <div style={{ marginTop: SPACING.sm, fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
            Format: {BANK_FORMATS[csvFormat]?.name || csvFormat}
          </div>
        )}
      </DashboardCard>

      {/* Results */}
      {transactions.length > 0 && (
        <>
          {/* Legend */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: SPACING.md, alignItems: 'center',
            margin: `${SPACING.md}px 0`, padding: `${SPACING.sm}px ${SPACING.md}px`,
            background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
          }}>
            <span style={{ fontSize: FONT.sizeXs, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legend:</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#dcfce7', color: '#15803d' }}>Mapped</span>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Auto-categorized by a vendor rule</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#fee2e2', color: '#991b1b' }}>New</span>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>No rule matched -- needs a category</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#fef3c7', color: '#92400e' }}>Dup?</span>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Possible duplicate already in ledger</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#e5e7eb', color: '#6b7280' }}>Ignored</span>
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Hidden by an ignore rule (shown in Filtered section)</span>
            </span>
          </div>

          {/* Toolbar */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: SPACING.sm, alignItems: 'center',
            margin: `${SPACING.sm}px 0`, padding: `${SPACING.sm}px 0`,
          }}>
            <button onClick={selectAll} style={toolBtnStyle}>Select All</button>
            <button onClick={deselectAll} style={toolBtnStyle}>Deselect All</button>
            <button onClick={selectMapped} style={toolBtnStyle}>Select Mapped</button>
            <button onClick={deselectDuplicates} style={toolBtnStyle}>Deselect Duplicates</button>
            <div style={{ flex: 1 }} />
            {fetchInfo && (
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                {transactions.length} expenses ({fetchInfo.filteredCount} filtered out of {fetchInfo.total} total)
              </span>
            )}
          </div>

          {/* Transaction table */}
          <DashboardCard noPadding>
            <div style={{ overflowX: 'auto' }}>
              {transactions.map((txn, idx) => (
                <div key={txn.plaid_id} style={{
                  display: 'flex', flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'stretch' : 'center',
                  gap: isMobile ? 6 : SPACING.sm,
                  padding: `${SPACING.sm}px ${SPACING.md}px`,
                  borderBottom: `1px solid ${COLORS.border}`,
                  background: txn.duplicate ? 'rgba(234,179,8,0.05)' : txn.selected ? 'rgba(34,197,94,0.03)' : 'transparent',
                  opacity: txn.duplicate && !txn.selected ? 0.6 : 1,
                }}>
                  {/* Checkbox */}
                  <input type="checkbox" checked={txn.selected} onChange={() => toggleSelect(idx)}
                    style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer', flexShrink: 0 }} />

                  {/* Status badge */}
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8, flexShrink: 0, textAlign: 'center', minWidth: 50,
                    background: txn.duplicate ? '#fef3c7' : txn.category ? '#dcfce7' : '#fee2e2',
                    color: txn.duplicate ? '#92400e' : txn.category ? '#15803d' : '#991b1b',
                  }}>
                    {txn.duplicate ? 'Dup?' : txn.category ? 'Mapped' : 'New'}
                  </span>

                  {/* Date */}
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, minWidth: 80, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {txn.date}
                  </span>

                  {/* Description */}
                  <span style={{
                    flex: 2, fontSize: FONT.sizeXs, color: COLORS.textSecondary, minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap',
                  }} title={txn.description}>
                    {txn.description}
                  </span>

                  {/* Amount */}
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: 700, color: COLORS.danger, minWidth: 80, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    ${txn.amount.toFixed(2)}
                  </span>

                  {/* Brand */}
                  <select value={txn.brand} onChange={e => updateTxn(idx, { brand: e.target.value })}
                    style={{ ...selectStyle, width: isMobile ? '100%' : 80 }}>
                    <option value="default">--</option>
                    <option value="FWT">FWT</option>
                    <option value="FWG">FWG</option>
                    <option value="FA">FA</option>
                    <option value="SHARED">SHARED</option>
                  </select>

                  {/* Category */}
                  <select value={txn.category} onChange={e => updateTxn(idx, { category: e.target.value })}
                    style={{ ...selectStyle, width: isMobile ? '100%' : 160, color: txn.category ? COLORS.textPrimary : '#dc2626' }}>
                    <option value="">-- Category --</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Vendor */}
                  <input value={txn.vendor} onChange={e => updateTxn(idx, { vendor: e.target.value })}
                    style={{ ...inputStyle, width: isMobile ? '100%' : 120 }} placeholder="Vendor" />

                  {/* Save Rule button */}
                  <button onClick={() => {
                    setRuleTarget(txn);
                    setRulePattern(txn.description.substring(0, 30));
                    setRuleCategory(txn.category);
                    setRuleVendor(txn.vendor);
                    setRuleBrand(txn.brand);
                    setRuleFilterOut(false);
                  }} title="Save as rule" style={{
                    background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
                    padding: '2px 4px', fontSize: FONT.sizeXs, flexShrink: 0, opacity: 0.6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12.667 2H3.333C2.597 2 2 2.597 2 3.333v9.334C2 13.403 2.597 14 3.333 14h9.334c.736 0 1.333-.597 1.333-1.333V3.333C14 2.597 13.403 2 12.667 2z"/>
                      <path d="M11.333 14V8.667H4.667V14"/><path d="M4.667 2v3.333h5.333"/>
                    </svg>
                  </button>

                  {/* Quick Ignore button */}
                  <button onClick={() => {
                    setRuleTarget(txn);
                    setRulePattern(txn.description.substring(0, 30));
                    setRuleCategory('');
                    setRuleVendor('');
                    setRuleBrand('');
                    setRuleFilterOut(true);
                  }} title="Always ignore this" style={{
                    background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer',
                    padding: '2px 4px', fontSize: FONT.sizeXs, flexShrink: 0, opacity: 0.6,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </DashboardCard>

          {/* Post bar */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: SPACING.md, alignItems: 'center',
            margin: `${SPACING.md}px 0`, padding: `${SPACING.md}px 0`,
          }}>
            <Button variant="primary" onClick={handlePost} disabled={posting || selectedCount === 0}>
              {posting ? 'Posting...' : `Post ${selectedCount} Transactions ($${selectedTotal.toFixed(2)})`}
            </Button>
            {postResult && (
              <span style={{ fontSize: FONT.sizeSm, color: postResult.startsWith('Error') ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                {postResult}
              </span>
            )}
          </div>
        </>
      )}

      {/* Filtered Transactions (collapsible) */}
      {filteredTxns.length > 0 && (
        <DashboardCard>
          <button onClick={() => setShowFiltered(!showFiltered)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
              style={{ transform: showFiltered ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M4 2l4 4-4 4"/>
            </svg>
            <span style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: COLORS.textMuted }}>
              Filtered Transactions ({filteredTxns.length})
            </span>
            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
              -- income, pending, and filtered-out transactions
            </span>
          </button>
          {showFiltered && (
            <div style={{ marginTop: SPACING.md }}>
              {filteredTxns.map((txn, idx) => (
                <div key={idx} style={{
                  display: 'flex', gap: SPACING.md, alignItems: 'center',
                  padding: `${SPACING.xs}px 0`,
                  borderBottom: idx < filteredTxns.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  opacity: 0.6,
                }}>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                    background: txn.reason === 'Income' ? '#dcfce7' : txn.reason === 'Pending' ? '#fef3c7' : '#fee2e2',
                    color: txn.reason === 'Income' ? '#15803d' : txn.reason === 'Pending' ? '#92400e' : '#991b1b',
                    minWidth: 55, textAlign: 'center', flexShrink: 0,
                  }}>
                    {txn.reason}
                  </span>
                  <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, minWidth: 80, flexShrink: 0 }}>{txn.date}</span>
                  <span style={{ flex: 1, fontSize: FONT.sizeXs, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {txn.description}
                  </span>
                  <span style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: txn.reason === 'Income' ? COLORS.success : COLORS.textMuted, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {txn.reason === 'Income' ? '+' : '-'}${Math.abs(txn.amount).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DashboardCard>
      )}

      {/* Save Rule Modal */}
      {ruleTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: COLORS.pageBg, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, padding: SPACING.xl, width: isMobile ? 'calc(100% - 32px)' : 400 }}>
            <h3 style={{ margin: `0 0 ${SPACING.md}px`, color: COLORS.textPrimary, fontSize: '16px', fontWeight: 600 }}>Save Vendor Rule</h3>
            <p style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Future transactions matching this pattern will be auto-categorized.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
              <div>
                <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Match Pattern</label>
                <input value={rulePattern} onChange={e => setRulePattern(e.target.value)}
                  style={{ ...inputStyle, width: '100%' }} />
              </div>

              {/* Always Ignore toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${SPACING.sm}px ${SPACING.md}px`, borderRadius: RADIUS.sm,
                background: ruleFilterOut ? 'rgba(234,179,8,0.1)' : COLORS.inputBg,
                border: `1px solid ${ruleFilterOut ? '#fbbf24' : COLORS.borderInput}`,
              }}>
                <div>
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: 600, color: ruleFilterOut ? '#92400e' : COLORS.textPrimary }}>Always Ignore</div>
                  <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                    {ruleFilterOut ? 'This transaction will be hidden on every import' : 'Hides matching transactions from future imports'}
                  </div>
                </div>
                <button onClick={() => setRuleFilterOut(!ruleFilterOut)} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: ruleFilterOut ? '#f59e0b' : COLORS.border, position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: ruleFilterOut ? 23 : 3, transition: 'left 0.2s' }} />
                </button>
              </div>

              {!ruleFilterOut && (
                <>
                  <div>
                    <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Category</label>
                    <select value={ruleCategory} onChange={e => setRuleCategory(e.target.value)}
                      style={{ ...selectStyle, width: '100%' }}>
                      <option value="">Select...</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Vendor Name</label>
                    <input value={ruleVendor} onChange={e => setRuleVendor(e.target.value)}
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Default Brand</label>
                    <select value={ruleBrand} onChange={e => setRuleBrand(e.target.value)}
                      style={{ ...selectStyle, width: '100%' }}>
                      <option value="">Use Account Default</option>
                      <option value="FWT">FWT</option>
                      <option value="FWG">FWG</option>
                      <option value="FA">FA</option>
                      <option value="SHARED">SHARED</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.lg }}>
              <Button variant="primary" onClick={handleSaveRule} disabled={!rulePattern || (!ruleFilterOut && !ruleCategory)}>
                {ruleFilterOut ? 'Save Ignore Rule' : 'Save Rule'}
              </Button>
              <Button variant="ghost" onClick={() => { setRuleTarget(null); setRuleFilterOut(false); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '4px 6px', background: COLORS.inputBg, color: COLORS.textPrimary,
  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
  fontSize: FONT.sizeXs, cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', background: COLORS.inputBg, color: COLORS.textPrimary,
  border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
  fontSize: FONT.sizeXs,
};

const toolBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
  background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
  color: COLORS.textMuted, fontSize: '0.7rem', fontWeight: 600,
};
