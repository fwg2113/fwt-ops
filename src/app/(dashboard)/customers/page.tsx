'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, Modal, TextInput, FormField, SelectInput, StatusBadge } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import CustomerProfile from './CustomerProfile';
import ImportModal from './ImportModal';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  lifetime_spend: number;
  visit_count: number;
  first_visit_date: string | null;
  last_visit_date: string | null;
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('last_visit_date');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Modals
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Create form
  const [createFirst, setCreateFirst] = useState('');
  const [createLast, setCreateLast] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchCustomers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search, sort, dir: 'desc', limit: String(limit), offset: String(offset),
    });
    fetch(`/api/customers?${params}`)
      .then(r => r.json())
      .then(data => {
        setCustomers(data.customers || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, sort, offset]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setOffset(0); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function formatPhone(phone: string | null): string {
    if (!phone) return '--';
    const d = phone.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
  }

  async function handleCreate() {
    if (!createFirst && !createLast) return;
    setCreating(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: createFirst,
          last_name: createLast,
          phone: createPhone,
          email: createEmail,
        }),
      });
      const data = await res.json();
      if (data.customer) {
        setShowCreate(false);
        setCreateFirst(''); setCreateLast(''); setCreatePhone(''); setCreateEmail('');
        fetchCustomers();
        setSelectedCustomerId(data.customer.id);
      }
    } catch { /* silent */ }
    setCreating(false);
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  // If a customer is selected, show their profile
  if (selectedCustomerId) {
    return (
      <CustomerProfile
        customerId={selectedCustomerId}
        onBack={() => { setSelectedCustomerId(null); fetchCustomers(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Customer"
        titleAccent="Database"
        subtitle={`${total.toLocaleString()} customers`}
        actions={
          <div style={{ display: 'flex', gap: SPACING.sm }}>
            <Button variant="secondary" onClick={() => setShowImport(true)}>
              Import CSV
            </Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              Add Customer
            </Button>
          </div>
        }
      />

      {/* Search + Sort bar */}
      <div style={{ display: 'flex', gap: SPACING.md, marginBottom: SPACING.lg, alignItems: 'center' }}>
        <div style={{ flex: 1, maxWidth: 400 }}>
          <TextInput
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, email, or company..."
            style={{ minHeight: 40 }}
          />
        </div>
        <SelectInput value={sort} onChange={e => { setSort(e.target.value); setOffset(0); }} style={{ minHeight: 40, maxWidth: 200 }}>
          <option value="last_visit_date">Last Visit</option>
          <option value="lifetime_spend">Lifetime Spend</option>
          <option value="visit_count">Visit Count</option>
          <option value="first_name">Name (A-Z)</option>
          <option value="created_at">Date Added</option>
        </SelectInput>
        <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
          {total > 0 ? `${offset + 1}-${Math.min(offset + limit, total)} of ${total}` : ''}
        </span>
      </div>

      {/* Customer list */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>Loading customers...</div>
        ) : customers.length === 0 ? (
          <div style={{ padding: SPACING.xxl, textAlign: 'center', color: COLORS.textMuted }}>
            {search ? 'No customers match your search.' : 'No customers yet. Add one or import a CSV.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Email</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Visits</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Lifetime Spend</th>
                <th style={thStyle}>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = COLORS.hoverBg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                      {c.first_name} {c.last_name}
                    </div>
                    {c.company_name && (
                      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{c.company_name}</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums' }}>{formatPhone(c.phone)}</td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted }}>{c.email || '--'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: FONT.weightSemibold }}>{c.visit_count}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: FONT.weightSemibold, color: COLORS.success }}>
                    ${Number(c.lifetime_spend || 0).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
                    {c.last_visit_date ? new Date(c.last_visit_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: SPACING.sm,
            padding: SPACING.md, borderTop: `1px solid ${COLORS.border}`,
          }}>
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              style={pageBtnStyle(offset === 0)}
            >
              Previous
            </button>
            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, padding: '6px 12px' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              style={pageBtnStyle(offset + limit >= total)}
            >
              Next
            </button>
          </div>
        )}
      </DashboardCard>

      {/* Create Customer Modal */}
      {showCreate && (
        <Modal
          title="Add Customer"
          onClose={() => setShowCreate(false)}
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={(!createFirst && !createLast) || creating}>
                {creating ? 'Creating...' : 'Add Customer'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
            <FormField label="First Name">
              <TextInput value={createFirst} onChange={e => setCreateFirst(e.target.value)} placeholder="First name" />
            </FormField>
            <FormField label="Last Name">
              <TextInput value={createLast} onChange={e => setCreateLast(e.target.value)} placeholder="Last name" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Phone">
              <TextInput value={createPhone} onChange={e => setCreatePhone(e.target.value)} placeholder="(301) 555-1234" />
            </FormField>
            <FormField label="Email">
              <TextInput value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="email@example.com" />
            </FormField>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onComplete={() => { setShowImport(false); fetchCustomers(); }}
        />
      )}
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
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
};

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 16px',
    fontSize: FONT.sizeSm,
    fontWeight: FONT.weightMedium,
    background: disabled ? 'transparent' : COLORS.inputBg,
    color: disabled ? COLORS.textMuted : COLORS.textSecondary,
    border: `1px solid ${COLORS.borderInput}`,
    borderRadius: RADIUS.sm,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
