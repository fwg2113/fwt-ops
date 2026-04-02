'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardCard, Button, FormField, SelectInput, TextInput, Modal, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { BulkConfig, AutoVehicle, AutoVehiclePricingOverride } from '@/app/components/booking/types';
import { calculateServicePrice, getAvailableFilms, getAddFee, getAllowedShades, needsSplitShades } from '@/app/components/booking/pricing';
import { SendToCustomerModal, type SelectedRow } from './QuickTintModals';

interface Props {
  onExit: () => void;
}

// Table styles
const thStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
  textTransform: 'uppercase', letterSpacing: '0.5px', color: COLORS.textMuted,
  borderBottom: `2px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`, fontSize: FONT.sizeSm,
  borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap',
};

export default function QuickTintMode({ onExit }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showBookConfirm, setShowBookConfirm] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [bookingDirect, setBookingDirect] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);

  // Customer
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; first_name: string; last_name: string; phone: string; email: string | null }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // YMM
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Services
  const [selectedRows, setSelectedRows] = useState<SelectedRow[]>([]);

  // Scheduling (on main screen)
  const [appointmentType, setAppointmentType] = useState('dropoff');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [dayAppointments, setDayAppointments] = useState<{
    customer_name: string; appointment_time: string | null; appointment_type: string;
    vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null;
    status: string; duration_minutes: number | null; services_json?: unknown; id: string;
  }[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [daySummary, setDaySummary] = useState<{ total: number; dropoffs: number; waiting: number; headsups: number } | null>(null);

  // Deposit override for "Send as Tailored Quote" path
  const [depositOverride, setDepositOverride] = useState<number | null>(null);
  const [overrideDeposit, setOverrideDeposit] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/auto/config').then(r => r.json()),
      fetch('/api/auto/customers').then(r => r.json()),
    ]).then(([configData, custData]) => {
      setConfig(configData as BulkConfig);
      setCustomers(Array.isArray(custData) ? custData : custData.customers || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Fetch day schedule when date changes
  useEffect(() => {
    if (!selectedDate) { setDayAppointments([]); setDaySummary(null); return; }
    setLoadingDay(true);
    fetch(`/api/auto/appointments?date=${selectedDate}`)
      .then(r => r.json())
      .then(data => {
        setDayAppointments(
          (data.appointments || [])
            .filter((a: { status: string }) => a.status !== 'cancelled')
            .sort((a: { appointment_time: string | null }, b: { appointment_time: string | null }) =>
              (a.appointment_time || '99:99').localeCompare(b.appointment_time || '99:99'))
        );
        setDaySummary(data.summary || null);
      })
      .catch(() => { setDayAppointments([]); setDaySummary(null); })
      .finally(() => setLoadingDay(false));
  }, [selectedDate]);

  // YMM cascade
  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const all = new Set<number>();
    config.vehicles.forEach(v => { for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) all.add(y); });
    return Array.from(all).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !selectedYear) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end) set.add(v.make); });
    return Array.from(set).sort();
  }, [config, selectedYear]);

  const models = useMemo(() => {
    if (!config || !selectedYear || !selectedMake) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end && v.make === selectedMake) set.add(v.model); });
    return Array.from(set).sort();
  }, [config, selectedYear, selectedMake]);

  const vehicle = useMemo<AutoVehicle | null>(() => {
    if (!config || !selectedYear || !selectedMake || !selectedModel) return null;
    const year = parseInt(selectedYear);
    return config.vehicles.find(v =>
      v.make === selectedMake && v.model === selectedModel && year >= v.year_start && year <= v.year_end
    ) || null;
  }, [config, selectedYear, selectedMake, selectedModel]);

  const films = useMemo(() => {
    if (!config) return [];
    return vehicle ? getAvailableFilms(vehicle, config.films) : config.films;
  }, [config, vehicle]);

  const tintServices = useMemo(() => {
    if (!config) return [];
    return config.services.filter(s => s.enabled && s.service_type === 'tint').sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const removalServices = useMemo(() => {
    if (!config) return [];
    return config.services.filter(s => s.enabled && s.service_type === 'removal').sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const priceMatrix = useMemo(() => {
    if (!config || !vehicle) return null;
    const matrix: Record<string, Record<number, number>> = {};
    for (const svc of tintServices) {
      matrix[svc.service_key] = {};
      for (const film of films) {
        matrix[svc.service_key][film.id] = calculateServicePrice(vehicle, svc.service_key, film.id, config.pricing, config.vehicleClasses, config.vehiclePricingOverrides as AutoVehiclePricingOverride[]);
      }
    }
    for (const svc of removalServices) {
      matrix[svc.service_key] = {};
      matrix[svc.service_key][0] = calculateServicePrice(vehicle, svc.service_key, null, config.pricing, config.vehicleClasses, config.vehiclePricingOverrides as AutoVehiclePricingOverride[]);
    }
    return matrix;
  }, [config, vehicle, tintServices, removalServices, films]);

  const addFee = useMemo(() => {
    if (!config || !vehicle) return 0;
    return getAddFee(vehicle, config.vehicleClasses);
  }, [config, vehicle]);

  const toggleRow = useCallback((serviceKey: string, label: string, filmId: number, filmName: string, price: number) => {
    setSelectedRows(prev => {
      const exists = prev.find(r => r.serviceKey === serviceKey && r.filmId === filmId);
      if (exists) return prev.filter(r => !(r.serviceKey === serviceKey && r.filmId === filmId));
      return [...prev, { serviceKey, label, filmId, filmName, price, shadeFront: null, shadeRear: null }];
    });
  }, []);

  const updateRowShade = useCallback((serviceKey: string, filmId: number, field: 'shadeFront' | 'shadeRear', value: string | null) => {
    setSelectedRows(prev => prev.map(r =>
      r.serviceKey === serviceKey && r.filmId === filmId ? { ...r, [field]: value } : r
    ));
  }, []);

  const isSelected = useCallback((serviceKey: string, filmId: number) => {
    return selectedRows.some(r => r.serviceKey === serviceKey && r.filmId === filmId);
  }, [selectedRows]);

  const totalSelected = selectedRows.reduce((sum, r) => sum + r.price, 0);
  useEffect(() => { setSelectedRows([]); }, [vehicle]);

  const appointmentTypes = useMemo(() => {
    if (!config) return [];
    const types: { value: string; label: string }[] = [];
    if (config.shopConfig.enable_dropoff) types.push({ value: 'dropoff', label: 'Drop-off' });
    if (config.shopConfig.enable_waiting) types.push({ value: 'waiting', label: 'Waiting' });
    if (config.shopConfig.enable_headsup_30) types.push({ value: 'headsup_30', label: 'Heads-Up (30 min)' });
    if (config.shopConfig.enable_headsup_60) types.push({ value: 'headsup_60', label: 'Heads-Up (60 min)' });
    return types;
  }, [config]);

  const timeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [];
    for (let h = 7; h <= 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        slots.push({ value: hour24, label: `${hour12}:${String(m).padStart(2, '0')} ${ampm}` });
      }
    }
    return slots;
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const hasSchedule = Boolean(selectedDate && selectedTime);

  // Customer search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch || customerSearch.length < 1) return [];
    const term = customerSearch.toLowerCase();
    return customers.filter(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
      c.phone?.includes(term) || c.email?.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [customerSearch, customers]);

  function selectCustomer(c: typeof customers[0]) {
    setSelectedCustomerId(c.id);
    setCustomerName(`${c.first_name} ${c.last_name}`.trim());
    setCustomerPhone(c.phone || '');
    setCustomerEmail(c.email || '');
    setCustomerSearch(`${c.first_name} ${c.last_name}`.trim());
    setShowDropdown(false);
  }

  // ============================================================
  // ACTION: Add to Schedule (direct book, no deposit)
  // ============================================================
  async function handleDirectBook() {
    if (!vehicle || !selectedDate || !selectedTime || !customerName) return;
    setBookingDirect(true);
    try {
      const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';
      const nameParts = customerName.trim().split(' ');
      const res = await fetch('/api/auto/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: nameParts[0] || '', lastName: nameParts.slice(1).join(' ') || '',
          phone: customerPhone, email: customerEmail,
          vehicleYear: selectedYear, vehicleMake: selectedMake, vehicleModel: selectedModel,
          classKeys: vehicle.class_keys.join('|'),
          serviceType: 'tint', appointmentType,
          servicesJson: selectedRows.map(s => ({
            serviceKey: s.serviceKey, label: s.label, filmId: s.filmId || null,
            filmName: s.filmName, filmAbbrev: null, shadeFront: s.shadeFront,
            shadeRear: s.shadeRear, shade: s.shadeFront, price: s.price,
            discountAmount: 0, duration: 60, module: 'auto_tint',
          })),
          subtotal: totalSelected, discountCode: null, discountType: null,
          discountPercent: 0, discountAmount: 0, depositPaid: 0,
          balanceDue: totalSelected,
          appointmentDate: selectedDate,
          appointmentTime: isHeadsUp ? null : selectedTime,
          durationMinutes: selectedRows.length * 60,
          windowStatus: 'never', hasAftermarketTint: null, additionalInterests: '',
          notes: 'Booked from Fast Lane', calendarTitle: '', emojiMarker: '',
        }),
      });
      const data = await res.json();
      if (data.success) setBookingSuccess(true);
    } catch { /* silent */ }
    setBookingDirect(false);
  }

  // ============================================================
  // ACTION: Send as Tailored Quote (customer approves, deposit per settings)
  // ============================================================
  async function handleSendTailoredQuote() {
    if (!vehicle) return;
    setSendingQuote(true);
    try {
      const res = await fetch('/api/auto/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || null, customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake, vehicle_model: selectedModel,
          vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
          services: selectedRows.map(s => ({
            service_key: s.serviceKey, label: s.label, film_id: s.filmId || null,
            film_name: s.filmName, price: s.price, shade_front: s.shadeFront, shade_rear: s.shadeRear,
          })),
          total_price: totalSelected,
          charge_deposit: overrideDeposit ? (depositOverride !== null && depositOverride > 0) : (config?.shopConfig.require_deposit ?? true),
          deposit_amount: overrideDeposit ? (depositOverride || 0) : (config?.shopConfig.deposit_amount || 50),
          send_method: 'copy',
          // Pass the pre-selected schedule so customer sees it
          suggested_date: selectedDate || null,
          suggested_time: selectedTime || null,
          suggested_type: appointmentType || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLink(data.booking_url);
      }
    } catch { /* silent */ }
    setSendingQuote(false);
  }

  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleCopyLink() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ============================================================
  // ACTION: Multi-Service Quote
  // ============================================================
  async function handleCreateQuote() {
    if (!vehicle || selectedRows.length === 0) return;
    setCreating(true);
    const docRes = await fetch('/api/documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type: 'quote', customer_id: selectedCustomerId || null,
        customer_name: customerName || null, customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        vehicle_year: parseInt(selectedYear), vehicle_make: selectedMake,
        vehicle_model: selectedModel, class_keys: vehicle.class_keys.join('|'),
        subtotal: totalSelected, balance_due: totalSelected,
      }),
    });
    const doc = await docRes.json();
    if (!doc.id) { setCreating(false); return; }

    await fetch(`/api/documents/${doc.id}/line-items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedRows.map((row, idx) => ({
        module: 'auto_tint', group_id: 'grp_quick_tint',
        description: row.label, quantity: 1, unit_price: row.price, line_total: row.price, sort_order: idx,
        custom_fields: {
          serviceKey: row.serviceKey, filmId: row.filmId > 0 ? row.filmId : null,
          filmName: row.filmName !== 'N/A' ? row.filmName : null,
          shadeFront: row.shadeFront, shadeRear: row.shadeRear, shade: row.shadeFront || null,
          vehicleYear: parseInt(selectedYear), vehicleMake: selectedMake,
          vehicleModel: selectedModel, classKeys: vehicle.class_keys.join('|'),
        },
      }))),
    });
    router.push(`/documents/${doc.id}`);
  }

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return <div style={{ padding: SPACING.xxl, color: COLORS.textMuted, textAlign: 'center' }}>Loading pricing data...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: SPACING.lg, padding: `${SPACING.md}px 0`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
          <div style={{
            padding: `${SPACING.xs}px ${SPACING.md}px`, borderRadius: RADIUS.md,
            background: `${COLORS.red}15`, border: `1px solid ${COLORS.red}40`,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.red,
          }}>
            Fast Lane Quote / Appointment
          </div>
          <button onClick={onExit} style={{
            background: 'none', border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
            color: COLORS.textMuted, fontSize: FONT.sizeXs, padding: `${SPACING.xs}px ${SPACING.sm}px`,
            cursor: 'pointer',
          }}>
            Exit Fast Lane
          </button>
        </div>
        {selectedRows.length > 0 && (
          <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
            {selectedRows.length} service{selectedRows.length !== 1 ? 's' : ''} -- ${totalSelected.toLocaleString()}
          </span>
        )}
      </div>

      {/* Customer */}
      <DashboardCard title="Customer" allowOverflow>
        <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <FormField label="Search or Enter Name">
              <TextInput
                value={customerSearch || customerName}
                onChange={e => { setCustomerSearch(e.target.value); setCustomerName(e.target.value); setSelectedCustomerId(null); setShowDropdown(true); }}
                onFocus={() => { if (filteredCustomers.length > 0) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                placeholder="Customer name..."
              />
            </FormField>
            {showDropdown && filteredCustomers.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: COLORS.cardBg, border: `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.sm, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}>
                {filteredCustomers.map(c => (
                  <div key={c.id} onMouseDown={() => selectCustomer(c)} style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, cursor: 'pointer',
                    borderBottom: `1px solid ${COLORS.border}`, fontSize: FONT.sizeSm, color: COLORS.textPrimary,
                  }}>
                    <div style={{ fontWeight: FONT.weightSemibold }}>{c.first_name} {c.last_name}</div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{c.phone}{c.email ? ` -- ${c.email}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 160 }}>
            <FormField label="Phone"><TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone..." /></FormField>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FormField label="Email"><TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Email..." /></FormField>
          </div>
        </div>
      </DashboardCard>

      {/* YMM Selector */}
      <div style={{ marginTop: SPACING.lg }}>
        <DashboardCard title="Select Vehicle">
          <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <FormField label="Year"><SelectInput value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedMake(''); setSelectedModel(''); }}>
                <option value="">Select Year</option>
                {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </SelectInput></FormField>
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <FormField label="Make"><SelectInput value={selectedMake} onChange={e => { setSelectedMake(e.target.value); setSelectedModel(''); }}>
                <option value="">{selectedYear ? 'Select Make' : '---'}</option>
                {makes.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput></FormField>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FormField label="Model"><SelectInput value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="">{selectedMake ? 'Select Model' : '---'}</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput></FormField>
            </div>
            {vehicle && (
              <div style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, background: COLORS.activeBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderAccent}`, marginBottom: SPACING.lg }}>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Class</div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>{vehicle.class_keys.join(', ')}</div>
                {addFee > 0 && <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow, marginTop: 2 }}>+${addFee} ADD_FEE (Full Sides)</div>}
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* Pricing Matrix */}
      {vehicle && priceMatrix && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title={`${selectedYear} ${selectedMake} ${selectedModel}`} noPadding
            actions={selectedRows.length > 0 ? (
              <button onClick={() => setSelectedRows([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, fontSize: FONT.sizeXs, textDecoration: 'underline' }}>Clear Selection</button>
            ) : (
              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Click cells to select services</span>
            )}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 2, background: COLORS.cardBg, minWidth: 160 }}>Service</th>
                    {films.map(film => (
                      <th key={film.id} style={{ ...thStyle, minWidth: 100, textAlign: 'center' }}>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{film.name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tintServices.map(svc => (
                    <tr key={svc.service_key}>
                      <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 1, background: COLORS.cardBg, fontWeight: FONT.weightMedium, color: COLORS.textSecondary }}>
                        <div>{svc.label}</div>
                        {svc.service_key === 'FULL_SIDES' && addFee > 0 && <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow }}>incl. +${addFee} add fee</div>}
                      </td>
                      {films.map(film => {
                        const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                        const sel = isSelected(svc.service_key, film.id);
                        return (
                          <td key={film.id} onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                            style={{ ...tdStyle, textAlign: 'center', cursor: price > 0 ? 'pointer' : 'default', background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent', borderColor: sel ? COLORS.red : COLORS.border, transition: 'background 0.15s' }}
                            onMouseEnter={e => { if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg; }}
                            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                            {price > 0 ? <span style={{ fontSize: FONT.sizeBase, fontWeight: sel ? FONT.weightBold : FONT.weightMedium, color: sel ? COLORS.red : COLORS.textPrimary }}>${price}</span>
                              : <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {removalServices.length > 0 && (
                    <>
                      <tr><td colSpan={films.length + 1} style={{ padding: `${SPACING.sm}px ${SPACING.lg}px`, fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.yellow, textTransform: 'uppercase', letterSpacing: '1px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.activeBg }}>Removal Services</td></tr>
                      {removalServices.map(svc => {
                        const price = priceMatrix[svc.service_key]?.[0] ?? 0;
                        const sel = isSelected(svc.service_key, 0);
                        return (
                          <tr key={svc.service_key}>
                            <td style={{ ...tdStyle, position: 'sticky', left: 0, zIndex: 1, background: COLORS.cardBg, fontWeight: FONT.weightMedium, color: COLORS.textSecondary }}>{svc.label}</td>
                            <td colSpan={films.length} onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, 0, 'N/A', price)}
                              style={{ ...tdStyle, cursor: price > 0 ? 'pointer' : 'default', background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent', transition: 'background 0.15s' }}
                              onMouseEnter={e => { if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg; }}
                              onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}>
                              {price > 0 ? <span style={{ fontSize: FONT.sizeBase, fontWeight: sel ? FONT.weightBold : FONT.weightMedium, color: sel ? COLORS.red : COLORS.textPrimary }}>${price} (flat rate)</span>
                                : <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* Selected Services + Shades */}
      {selectedRows.length > 0 && config && vehicle && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Selected Services">
            {selectedRows.map((row, i) => {
              const shades = row.filmId > 0 ? getAllowedShades(row.serviceKey, row.filmId, config.filmShades, config.serviceShades, config.films) : [];
              const splitShade = row.filmId > 0 && needsSplitShades(vehicle, config.classRules, row.serviceKey);
              return (
                <div key={i} style={{ padding: SPACING.md, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, fontSize: FONT.sizeSm }}>{row.label}</div>
                    <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{row.filmName !== 'N/A' ? row.filmName : 'No film'}{row.shadeFront ? ` -- ${row.shadeFront}${row.shadeRear ? ` / ${row.shadeRear}` : ''}` : ''}</div>
                  </div>
                  {shades.length > 0 && (
                    <div style={{ display: 'flex', gap: SPACING.sm }}>
                      {splitShade ? (<>
                        <ShadeGroup label="Front" shades={shades} selected={row.shadeFront} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', v)} />
                        <ShadeGroup label="Rear" shades={shades} selected={row.shadeRear} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeRear', v)} />
                      </>) : (
                        <ShadeGroup label="Shade" shades={shades} selected={row.shadeFront} onSelect={v => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', v)} />
                      )}
                    </div>
                  )}
                  <span style={{ fontWeight: FONT.weightBold, color: COLORS.success, fontSize: FONT.sizeBase, minWidth: 60, textAlign: 'right' }}>${row.price}</span>
                  <button onClick={() => toggleRow(row.serviceKey, row.label, row.filmId, row.filmName, row.price)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textMuted, padding: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACING.md, paddingTop: SPACING.md, borderTop: `1px solid ${COLORS.border}`, fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
              Total: <span style={{ color: COLORS.success, marginLeft: SPACING.sm }}>${totalSelected.toLocaleString()}</span>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* SCHEDULING -- appointment type, date, time, MiniTimeline */}
      {/* ============================================================ */}
      {selectedRows.length > 0 && config && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Schedule (optional)">
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
              Set a date and time to book directly, or leave blank to let the customer choose.
            </div>
            <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap', marginBottom: SPACING.md }}>
              <div style={{ width: 140 }}>
                <FormField label="Type"><SelectInput value={appointmentType} onChange={e => setAppointmentType(e.target.value)}>
                  {appointmentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectInput></FormField>
              </div>
              <div style={{ width: 170 }}>
                <FormField label="Date"><TextInput type="date" value={selectedDate} min={today} onChange={e => setSelectedDate(e.target.value)} style={{ cursor: 'pointer' }} /></FormField>
              </div>
              <div style={{ width: 140 }}>
                <FormField label="Time"><SelectInput value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
                  <option value="">Select Time</option>
                  {timeSlots.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectInput></FormField>
              </div>
            </div>

            {selectedDate && (
              <MiniTimeline
                appointments={dayAppointments} loading={loadingDay}
                dateLabel={`Schedule for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
                summary={daySummary} height={360}
              />
            )}
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* ACTION BUTTONS */}
      {/* ============================================================ */}
      {selectedRows.length > 0 && vehicle && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard>
            <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap', justifyContent: 'center' }}>
              {/* Book Appointment -- only enabled when date + time are set */}
              <button
                onClick={() => { if (hasSchedule && customerName) setShowBookConfirm(true); }}
                disabled={!hasSchedule || !customerName}
                style={{
                  flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                  background: hasSchedule && customerName ? COLORS.red : COLORS.inputBg,
                  color: hasSchedule && customerName ? '#fff' : COLORS.textMuted,
                  border: `1px solid ${hasSchedule && customerName ? COLORS.red : COLORS.borderInput}`,
                  borderRadius: RADIUS.md, cursor: hasSchedule && customerName ? 'pointer' : 'not-allowed',
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>Book Appointment</div>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, opacity: 0.8 }}>
                  {hasSchedule && customerName
                    ? 'Add to schedule or send for approval'
                    : !customerName && !hasSchedule
                      ? 'Enter customer name and select a date and time to enable'
                      : !customerName
                        ? 'Enter customer name to enable'
                        : 'Select a date and time above to enable'
                  }
                </div>
              </button>

              {/* When Ready -- no date/time needed */}
              <button
                onClick={() => setShowSendModal(true)}
                style={{
                  flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderAccentSolid}`,
                  borderRadius: RADIUS.md, cursor: 'pointer',
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>When Ready</div>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, color: COLORS.textMuted }}>
                  Send personalized booking link
                </div>
              </button>

              {/* Multi-Service Quote */}
              <button
                onClick={handleCreateQuote}
                disabled={creating}
                style={{
                  flex: 1, minWidth: 200, padding: `${SPACING.lg}px ${SPACING.xl}px`,
                  background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.borderInput}`,
                  borderRadius: RADIUS.md, cursor: 'pointer',
                  fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, textAlign: 'center',
                }}
              >
                <div style={{ fontSize: FONT.sizeBase, marginBottom: 4 }}>{creating ? 'Creating...' : 'Multi-Service Quote'}</div>
                <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightMedium, color: COLORS.textMuted }}>
                  Customer needs more than tint
                </div>
              </button>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* ============================================================ */}
      {/* BOOK APPOINTMENT CONFIRMATION MODAL -- two choices */}
      {/* ============================================================ */}
      {showBookConfirm && config && vehicle && (
        <Modal title="Book Appointment" onClose={() => { setShowBookConfirm(false); setGeneratedLink(''); setOverrideDeposit(false); setDepositOverride(null); }}>
          {bookingSuccess ? (
            <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>Appointment Added to Schedule</div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: SPACING.sm }}>
                {customerName} -- {selectedYear} {selectedMake} {selectedModel} -- {selectedDate}
              </div>
              <div style={{ marginTop: SPACING.lg }}><Button variant="primary" onClick={onExit}>Done</Button></div>
            </div>
          ) : generatedLink ? (
            <div style={{ textAlign: 'center', padding: SPACING.lg }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>Tailored Quote Sent</div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
                Customer approves and books at {selectedDate} {selectedTime ? `at ${selectedTime}` : ''}.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
                <input readOnly value={generatedLink} style={{ flex: 1, background: 'none', border: 'none', color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', fontFamily: 'monospace' }}
                  onClick={e => (e.target as HTMLInputElement).select()} />
                <Button variant={copied ? 'primary' : 'secondary'} onClick={handleCopyLink}>{copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <Button variant="primary" onClick={onExit}>Done</Button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{customerName} -- {selectedYear} {selectedMake} {selectedModel}</div>
                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
                  {selectedRows.length} service{selectedRows.length !== 1 ? 's' : ''} -- ${totalSelected.toLocaleString()}
                  {' -- '}{selectedDate} at {selectedTime}
                </div>
              </div>

              {/* Two options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
                {/* Option 1: Add to Schedule */}
                <button onClick={handleDirectBook} disabled={bookingDirect}
                  style={{
                    padding: SPACING.lg, background: COLORS.activeBg, border: `2px solid ${COLORS.red}`,
                    borderRadius: RADIUS.md, cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: 4 }}>
                    {bookingDirect ? 'Adding...' : 'Add to Schedule'}
                  </div>
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                    Book the appointment directly. No deposit, no customer approval needed.
                  </div>
                </button>

                {/* Option 2: Send as Tailored Quote */}
                <button onClick={handleSendTailoredQuote} disabled={sendingQuote}
                  style={{
                    padding: SPACING.lg, background: 'transparent', border: `1px solid ${COLORS.borderInput}`,
                    borderRadius: RADIUS.md, cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: 4 }}>
                    {sendingQuote ? 'Generating...' : 'Send as Tailored Quote'}
                  </div>
                  <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
                    Customer receives a link to approve and confirm. Deposit: {
                      overrideDeposit
                        ? (depositOverride && depositOverride > 0 ? `$${depositOverride}` : 'None')
                        : (config.shopConfig.require_deposit ? `$${config.shopConfig.deposit_amount || 50} (shop default)` : 'None (shop default)')
                    }
                  </div>
                </button>

                {/* Deposit override */}
                <div style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
                    <input type="checkbox" checked={overrideDeposit} onChange={e => setOverrideDeposit(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }} />
                    <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Override deposit</span>
                  </label>
                  {overrideDeposit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>$</span>
                      <TextInput type="number" value={depositOverride !== null ? String(depositOverride) : ''}
                        onChange={e => setDepositOverride(Number(e.target.value) || 0)}
                        placeholder="0" style={{ width: 80, minHeight: 28, fontSize: FONT.sizeSm }} />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* When Ready modal (tailored booking link, no date/time) */}
      {showSendModal && config && vehicle && (
        <SendToCustomerModal
          config={config} vehicle={vehicle}
          year={selectedYear} make={selectedMake} model={selectedModel}
          selectedServices={selectedRows} total={totalSelected}
          onClose={() => setShowSendModal(false)}
          onComplete={onExit}
          prefillName={customerName} prefillPhone={customerPhone} prefillEmail={customerEmail}
        />
      )}
    </div>
  );
}

// Small shade button group
function ShadeGroup({ label, shades, selected, onSelect }: {
  label: string;
  shades: { id: number; shade_value: string }[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 3 }}>
        {shades.map(s => (
          <button key={s.id} onClick={() => onSelect(s.shade_value)} style={{
            padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: '11px',
            fontWeight: selected === s.shade_value ? 700 : 500,
            background: selected === s.shade_value ? COLORS.activeBg : 'transparent',
            color: selected === s.shade_value ? COLORS.red : COLORS.textMuted,
            border: `1px solid ${selected === s.shade_value ? COLORS.red : COLORS.borderInput}`,
          }}>{s.shade_value}</button>
        ))}
      </div>
    </div>
  );
}
