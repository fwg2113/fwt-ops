'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader, DashboardCard, Button, DataTable, StatusBadge, Modal, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import { useIsMobile, useIsTablet } from '@/app/hooks/useIsMobile';

interface GiftCertificate {
  id: number;
  gc_code: string;
  discount_type: 'dollar' | 'percent';
  amount: number;
  charge_deposit: boolean;
  redeemed: boolean;
  redeemed_at: string | null;
  redeemed_booking_id: string | null;
  start_date: string | null;
  end_date: string | null;
  disable_default_discounts: boolean;
  allow_same_day: boolean;
  promo_note: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
}

interface Summary {
  total: number;
  dollarGCs: number;
  promos: number;
  redeemed: number;
  unredeemed: number;
  totalValue: number;
}

type FilterType = 'all' | 'dollar' | 'percent' | 'redeemed' | 'active';

interface ServiceDef { service_key: string; label: string; is_primary: boolean; is_addon: boolean; service_type: string; }
interface FilmDef { id: number; name: string; }

export default function GiftCertificatesPage() {
  const isMobile = useIsMobile();
  const [gcs, setGcs] = useState<GiftCertificate[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [films, setFilms] = useState<FilmDef[]>([]);

  // Create form
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<'dollar' | 'percent'>('dollar');
  const [newAmount, setNewAmount] = useState('');
  const [newChargeDeposit, setNewChargeDeposit] = useState(false);
  const [newDisableDiscounts, setNewDisableDiscounts] = useState(false);
  const [newAllowSameDay, setNewAllowSameDay] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newMinPurchase, setNewMinPurchase] = useState('');
  const [newApplicableServices, setNewApplicableServices] = useState<Set<string>>(new Set());
  const [newExcludedServices, setNewExcludedServices] = useState<Set<string>>(new Set());
  const [newApplicableFilms, setNewApplicableFilms] = useState<Set<string>>(new Set());
  const [newExcludedFilms, setNewExcludedFilms] = useState<Set<string>>(new Set());
  const [serviceMode, setServiceMode] = useState<'all' | 'only' | 'exclude'>('all');
  const [filmMode, setFilmMode] = useState<'all' | 'only' | 'exclude'>('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auto/gift-certificates')
      .then(r => r.json())
      .then(d => { setGcs(d.giftCertificates || []); setSummary(d.summary || null); setLoading(false); })
      .catch(() => setLoading(false));

    fetch('/api/auto/config')
      .then(r => r.json())
      .then(d => {
        setServices((d.services || []).filter((s: ServiceDef) => s.service_type === 'tint'));
        setFilms(d.films || []);
      })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let list = gcs;
    if (filter === 'dollar') list = list.filter(gc => gc.discount_type === 'dollar' && gc.amount > 0);
    else if (filter === 'percent') list = list.filter(gc => gc.discount_type === 'percent');
    else if (filter === 'redeemed') list = list.filter(gc => gc.redeemed);
    else if (filter === 'active') list = list.filter(gc => !gc.redeemed && gc.discount_type === 'dollar' && gc.amount > 0);

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(gc =>
        gc.gc_code.toLowerCase().includes(s) ||
        (gc.customer_name && gc.customer_name.toLowerCase().includes(s)) ||
        (gc.customer_phone && gc.customer_phone.includes(s))
      );
    }
    return list;
  }, [gcs, filter, search]);

  function resetCreateForm() {
    setNewCode(''); setNewAmount(''); setNewNote(''); setNewStartDate(''); setNewEndDate('');
    setNewChargeDeposit(false); setNewDisableDiscounts(false); setNewAllowSameDay(false);
    setNewMinPurchase(''); setServiceMode('all'); setFilmMode('all');
    setNewApplicableServices(new Set()); setNewExcludedServices(new Set());
    setNewApplicableFilms(new Set()); setNewExcludedFilms(new Set());
  }

  async function handleCreate() {
    if (!newCode || !newAmount) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auto/gift-certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gc_code: newCode.trim().toUpperCase(),
          discount_type: newType,
          amount: parseFloat(newAmount),
          charge_deposit: newChargeDeposit,
          disable_default_discounts: newDisableDiscounts,
          allow_same_day: newAllowSameDay,
          promo_note: newNote || null,
          start_date: newStartDate || null,
          end_date: newEndDate || null,
          min_purchase: newMinPurchase ? parseFloat(newMinPurchase) : null,
          applicable_services: serviceMode === 'only' ? Array.from(newApplicableServices) : [],
          excluded_services: serviceMode === 'exclude' ? Array.from(newExcludedServices) : [],
          applicable_films: filmMode === 'only' ? Array.from(newApplicableFilms) : [],
          excluded_films: filmMode === 'exclude' ? Array.from(newExcludedFilms) : [],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGcs(prev => [data.giftCertificate, ...prev]);
        setCreating(false);
        resetCreateForm();
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  async function toggleRedeemed(gc: GiftCertificate) {
    const updates = gc.redeemed
      ? { redeemed: false, redeemed_at: null, redeemed_booking_id: null }
      : { redeemed: true, redeemed_at: new Date().toISOString() };

    try {
      await fetch('/api/auto/gift-certificates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gc.id, ...updates }),
      });
      setGcs(prev => prev.map(g => g.id === gc.id ? { ...g, ...updates } as GiftCertificate : g));
    } catch { /* silent */ }
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active GCs' },
    { key: 'dollar', label: 'Dollar' },
    { key: 'percent', label: 'Promos' },
    { key: 'redeemed', label: 'Redeemed' },
  ];

  const columns = [
    {
      key: 'gc_code', label: 'Code', width: 100,
      render: (gc: GiftCertificate) => (
        <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontFamily: 'monospace' }}>
          {gc.gc_code}
        </span>
      ),
    },
    {
      key: 'type', label: 'Type', width: 90,
      render: (gc: GiftCertificate) => (
        <StatusBadge
          label={gc.discount_type === 'dollar' ? 'Dollar' : 'Percent'}
          variant={gc.discount_type === 'dollar' ? 'info' : 'warning'}
        />
      ),
    },
    {
      key: 'amount', label: 'Value', width: 80,
      render: (gc: GiftCertificate) => (
        <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
          {gc.discount_type === 'dollar' ? `$${gc.amount}` : `${gc.amount}%`}
        </span>
      ),
    },
    {
      key: 'status', label: 'Status', width: 100,
      render: (gc: GiftCertificate) => {
        if (gc.redeemed) return <StatusBadge label="Redeemed" variant="success" />;
        if (gc.end_date && new Date(gc.end_date) < new Date()) return <StatusBadge label="Expired" variant="danger" />;
        return <StatusBadge label="Active" variant="info" />;
      },
    },
    {
      key: 'customer', label: 'Customer', width: 150,
      render: (gc: GiftCertificate) => (
        <span style={{ color: COLORS.textSecondary, fontSize: FONT.sizeSm }}>
          {gc.customer_name || '—'}
        </span>
      ),
    },
    {
      key: 'dates', label: 'Valid', width: 160,
      render: (gc: GiftCertificate) => {
        if (!gc.start_date && !gc.end_date) return <span style={{ color: COLORS.textMuted }}>No limit</span>;
        return (
          <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeXs }}>
            {gc.start_date || '...'} to {gc.end_date || '...'}
          </span>
        );
      },
    },
    {
      key: 'flags', label: 'Flags', width: 120,
      render: (gc: GiftCertificate) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {!gc.charge_deposit && <StatusBadge label="No Dep" variant="neutral" />}
          {gc.allow_same_day && <StatusBadge label="Same Day" variant="warning" />}
          {gc.disable_default_discounts && <StatusBadge label="No Disc" variant="neutral" />}
        </div>
      ),
    },
    {
      key: 'actions', label: '', width: 80, align: 'right' as const,
      render: (gc: GiftCertificate) => (
        <button onClick={() => toggleRedeemed(gc)} style={{
          background: gc.redeemed ? COLORS.dangerBg : COLORS.successBg,
          color: gc.redeemed ? COLORS.danger : COLORS.success,
          border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
        }}>
          {gc.redeemed ? 'Un-redeem' : 'Redeem'}
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Gift"
        titleAccent="Certificates"
        subtitle="Automotive"
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 1v12M1 7h12"/>
            </svg>
            New GC / Promo
          </Button>
        }
      />

      {/* Summary Stats */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: SPACING.md, marginBottom: SPACING.xl }}>
          <QuickStat label="Total" value={summary.total} color={COLORS.textPrimary} />
          <QuickStat label="Active GCs" value={summary.unredeemed} color="#3b82f6" />
          <QuickStat label="Promos" value={summary.promos} color="#f59e0b" />
          <QuickStat label="Redeemed" value={summary.redeemed} color="#22c55e" />
          <QuickStat label="Outstanding Value" value={`$${summary.totalValue.toLocaleString()}`} color={COLORS.red} />
        </div>
      )}

      {/* Filters + Search */}
      <div style={{
        display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg, flexWrap: 'wrap', alignItems: 'center',
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: isMobile ? '8px 16px' : '6px 16px', borderRadius: RADIUS.lg, cursor: 'pointer',
              background: filter === f.key ? COLORS.activeBg : 'transparent',
              color: filter === f.key ? COLORS.red : COLORS.textTertiary,
              border: `1px solid ${filter === f.key ? COLORS.red : COLORS.borderInput}`,
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            }}>
              {f.label}
            </button>
          ))}
        </div>
        {!isMobile && <div style={{ flex: 1 }} />}
        <TextInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, name, phone..."
          style={{ maxWidth: isMobile ? '100%' : 250, width: isMobile ? '100%' : undefined, minHeight: 36, fontSize: FONT.sizeSm }}
        />
      </div>

      {/* Table */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        ) : isMobile ? (
          filtered.length === 0 ? (
            <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>No gift certificates found.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((gc, idx) => {
                const statusLabel = gc.redeemed ? 'Redeemed' : (gc.end_date && new Date(gc.end_date) < new Date()) ? 'Expired' : 'Active';
                const statusVariant = gc.redeemed ? 'success' as const : (gc.end_date && new Date(gc.end_date) < new Date()) ? 'danger' as const : 'info' as const;
                return (
                  <div key={gc.id} style={{
                    padding: `${SPACING.md}px ${SPACING.lg}px`,
                    borderBottom: idx < filtered.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                        <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontFamily: 'monospace', fontSize: FONT.sizeSm }}>
                          {gc.gc_code}
                        </span>
                        <StatusBadge label={statusLabel} variant={statusVariant} />
                      </div>
                      <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>
                        {gc.discount_type === 'dollar' ? `$${gc.amount}` : `${gc.amount}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textSecondary }}>
                        {gc.customer_name || '--'}
                      </span>
                      <button onClick={() => toggleRedeemed(gc)} style={{
                        background: gc.redeemed ? COLORS.dangerBg : COLORS.successBg,
                        color: gc.redeemed ? COLORS.danger : COLORS.success,
                        border: 'none', borderRadius: RADIUS.sm, padding: '6px 12px',
                        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                      }}>
                        {gc.redeemed ? 'Un-redeem' : 'Redeem'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {!gc.charge_deposit && <StatusBadge label="No Dep" variant="neutral" />}
                      {gc.allow_same_day && <StatusBadge label="Same Day" variant="warning" />}
                      {gc.disable_default_discounts && <StatusBadge label="No Disc" variant="neutral" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={gc => gc.id}
            emptyMessage="No gift certificates found."
            compact
          />
        )}
      </DashboardCard>

      {/* Create Modal */}
      {creating && (
        <Modal title="Create Gift Certificate / Promo" onClose={() => { setCreating(false); resetCreateForm(); }} width={520}
          footer={
            <>
              <Button variant="secondary" onClick={() => { setCreating(false); resetCreateForm(); }}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={saving || !newCode || !newAmount}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </>
          }
        >
          {/* Basics */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Code" required>
              <TextInput value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g., FWT100" style={{ textTransform: 'uppercase' }} />
            </FormField>
            <FormField label="Type" required>
              <SelectInput value={newType} onChange={e => setNewType(e.target.value as 'dollar' | 'percent')}>
                <option value="dollar">Dollar Amount</option>
                <option value="percent">Percentage</option>
              </SelectInput>
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
            <FormField label={newType === 'dollar' ? 'Amount ($)' : 'Percentage (%)'} required>
              <TextInput type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                placeholder={newType === 'dollar' ? '50.00' : '20'} />
            </FormField>
            <FormField label="Minimum Purchase ($)" hint="Leave blank for no minimum">
              <TextInput type="number" value={newMinPurchase} onChange={e => setNewMinPurchase(e.target.value)} placeholder="0.00" />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Valid From">
              <TextInput type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
            </FormField>
            <FormField label="Valid Until">
              <TextInput type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} />
            </FormField>
          </div>

          <FormField label="Note (shown to customer)">
            <TextInput value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Optional promo note..." />
          </FormField>

          {/* Service Restrictions */}
          <SectionDivider label="Service Restrictions" />
          <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.md }}>
            {(['all', 'only', 'exclude'] as const).map(mode => (
              <button key={mode} onClick={() => { setServiceMode(mode); setNewApplicableServices(new Set()); setNewExcludedServices(new Set()); }}
                style={{
                  padding: '6px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                  background: serviceMode === mode ? COLORS.activeBg : 'transparent',
                  color: serviceMode === mode ? COLORS.red : COLORS.textTertiary,
                  border: `1px solid ${serviceMode === mode ? COLORS.red : COLORS.borderInput}`,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                }}>
                {mode === 'all' ? 'All Services' : mode === 'only' ? 'Only These' : 'Exclude These'}
              </button>
            ))}
          </div>
          {serviceMode !== 'all' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: SPACING.lg }}>
              {services.map(svc => {
                const targetSet = serviceMode === 'only' ? newApplicableServices : newExcludedServices;
                const setFn = serviceMode === 'only' ? setNewApplicableServices : setNewExcludedServices;
                const isSelected = targetSet.has(svc.service_key);
                return (
                  <button key={svc.service_key} onClick={() => {
                    const next = new Set(targetSet);
                    if (isSelected) next.delete(svc.service_key); else next.add(svc.service_key);
                    setFn(next);
                  }} style={{
                    padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                    background: isSelected ? (serviceMode === 'only' ? '#22c55e18' : '#ef444418') : 'transparent',
                    color: isSelected ? (serviceMode === 'only' ? '#22c55e' : '#ef4444') : COLORS.textMuted,
                    border: `1px solid ${isSelected ? (serviceMode === 'only' ? '#22c55e' : '#ef4444') : COLORS.borderInput}`,
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  }}>
                    {svc.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Film Restrictions */}
          <SectionDivider label="Film Restrictions" />
          <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.md }}>
            {(['all', 'only', 'exclude'] as const).map(mode => (
              <button key={mode} onClick={() => { setFilmMode(mode); setNewApplicableFilms(new Set()); setNewExcludedFilms(new Set()); }}
                style={{
                  padding: '6px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                  background: filmMode === mode ? COLORS.activeBg : 'transparent',
                  color: filmMode === mode ? COLORS.red : COLORS.textTertiary,
                  border: `1px solid ${filmMode === mode ? COLORS.red : COLORS.borderInput}`,
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                }}>
                {mode === 'all' ? 'All Films' : mode === 'only' ? 'Only These' : 'Exclude These'}
              </button>
            ))}
          </div>
          {filmMode !== 'all' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: SPACING.lg }}>
              {films.map(film => {
                const targetSet = filmMode === 'only' ? newApplicableFilms : newExcludedFilms;
                const setFn = filmMode === 'only' ? setNewApplicableFilms : setNewExcludedFilms;
                const isSelected = targetSet.has(film.name);
                return (
                  <button key={film.id} onClick={() => {
                    const next = new Set(targetSet);
                    if (isSelected) next.delete(film.name); else next.add(film.name);
                    setFn(next);
                  }} style={{
                    padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                    background: isSelected ? (filmMode === 'only' ? '#22c55e18' : '#ef444418') : 'transparent',
                    color: isSelected ? (filmMode === 'only' ? '#22c55e' : '#ef4444') : COLORS.textMuted,
                    border: `1px solid ${isSelected ? (filmMode === 'only' ? '#22c55e' : '#ef4444') : COLORS.borderInput}`,
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  }}>
                    {film.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Flags */}
          <SectionDivider label="Options" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
            <CheckboxRow label="Charge deposit" checked={newChargeDeposit} onChange={setNewChargeDeposit} />
            <CheckboxRow label="Disable default 10% add-on discounts" checked={newDisableDiscounts} onChange={setNewDisableDiscounts} />
            <CheckboxRow label="Allow same-day booking" checked={newAllowSameDay} onChange={setNewAllowSameDay} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function QuickStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      background: COLORS.cardBg, border: `1px solid ${COLORS.borderAccent}`,
      borderRadius: RADIUS.xl, padding: `${SPACING.md}px ${SPACING.lg}px`,
      display: 'flex', alignItems: 'center', gap: SPACING.sm,
    }}>
      <span style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color }}>{value}</span>
      <span style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', lineHeight: 1.3 }}>{label}</span>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACING.md,
      margin: `${SPACING.xl}px 0 ${SPACING.md}px`,
    }}>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
      <span style={{
        fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
        color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: COLORS.border }} />
    </div>
  );
}

function CheckboxRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, accentColor: COLORS.red }} />
      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>{label}</span>
    </label>
  );
}
