'use client';

import { useState, useEffect, useMemo } from 'react';
import { Modal, Button, FormField, TextInput, SelectInput, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { BulkConfig, AutoVehicle } from '@/app/components/booking/types';

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface SelectedRow {
  serviceKey: string;
  label: string;
  filmId: number;
  filmName: string;
  price: number;
  shadeFront: string | null;
  shadeRear: string | null;
}

interface ModalProps {
  config: BulkConfig;
  vehicle: AutoVehicle;
  year: string;
  make: string;
  model: string;
  selectedServices: SelectedRow[];
  total: number;
  onClose: () => void;
  onComplete?: () => void;
  prefillName?: string;
  prefillPhone?: string;
  prefillEmail?: string;
}

// ============================================================================
// BOOK APPOINTMENT MODAL
// ============================================================================

export function BookAppointmentModal({
  config, vehicle, year, make, model, selectedServices, total, onClose,
  prefillName, prefillPhone, prefillEmail,
}: ModalProps) {
  const nameParts = (prefillName || '').split(' ');
  const [appointmentType, setAppointmentType] = useState('dropoff');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [customerFirst, setCustomerFirst] = useState(nameParts[0] || '');
  const [customerLast, setCustomerLast] = useState(nameParts.slice(1).join(' ') || '');
  const [customerPhone, setCustomerPhone] = useState(prefillPhone || '');
  const [customerEmail, setCustomerEmail] = useState(prefillEmail || '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // GC / Promo code
  const [gcCode, setGcCode] = useState('');
  const [gcValid, setGcValid] = useState<{ valid: boolean; code?: string; discountType?: string; amount?: number; promoNote?: string } | null>(null);
  const [gcLoading, setGcLoading] = useState(false);
  const [gcError, setGcError] = useState('');

  async function validateGC() {
    if (!gcCode.trim()) return;
    setGcLoading(true); setGcError(''); setGcValid(null);
    try {
      const res = await fetch('/api/auto/validate-gc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gcCode }),
      });
      const data = await res.json();
      if (data.valid) setGcValid(data); else setGcError(data.error || 'Invalid code');
    } catch { setGcError('Validation failed'); }
    setGcLoading(false);
  }

  const discountAmount = gcValid
    ? gcValid.discountType === 'dollar'
      ? Math.min(gcValid.amount || 0, total)
      : Math.round(total * ((gcValid.amount || 0) / 100))
    : 0;
  const adjustedTotal = Math.max(0, total - discountAmount);

  // Day schedule
  const [dayAppointments, setDayAppointments] = useState<{
    customer_name: string; appointment_time: string | null; appointment_type: string;
    vehicle_year: number | null; vehicle_make: string | null; vehicle_model: string | null;
    status: string; duration_minutes: number | null;
  }[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [daySummary, setDaySummary] = useState<{ total: number; dropoffs: number; waiting: number; headsups: number } | null>(null);

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

  const appointmentTypes = useMemo(() => {
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

  async function handleSubmit() {
    if (!selectedDate || !selectedTime || !customerFirst) return;
    setSubmitting(true);
    try {
      const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';
      const res = await fetch('/api/auto/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: customerFirst, lastName: customerLast,
          phone: customerPhone, email: customerEmail,
          vehicleYear: year, vehicleMake: make, vehicleModel: model,
          classKeys: vehicle.class_keys.join('|'),
          serviceType: 'tint', appointmentType,
          servicesJson: selectedServices.map(s => ({
            serviceKey: s.serviceKey, label: s.label,
            filmId: s.filmId || null, filmName: s.filmName, filmAbbrev: null,
            shadeFront: s.shadeFront, shadeRear: s.shadeRear, shade: s.shadeFront,
            price: s.price, discountAmount: 0, duration: 60, module: 'auto_tint',
          })),
          subtotal: total,
          discountCode: gcValid?.code || null,
          discountType: gcValid?.discountType || null,
          discountPercent: gcValid?.discountType === 'percent' ? gcValid.amount : 0,
          discountAmount, depositPaid: 0, balanceDue: adjustedTotal,
          appointmentDate: selectedDate,
          appointmentTime: isHeadsUp ? null : selectedTime,
          durationMinutes: selectedServices.length * 60,
          windowStatus: 'never', hasAftermarketTint: null, additionalInterests: '',
          notes: notes || 'Booked from Quick Tint Quote', calendarTitle: '', emojiMarker: '',
        }),
      });
      const data = await res.json();
      if (data.success) setSuccess(true);
    } catch { /* silent */ }
    setSubmitting(false);
  }

  if (success) {
    return (
      <Modal title="Appointment Booked" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>Appointment created</div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: SPACING.sm }}>{year} {make} {model} -- {selectedDate} at {selectedTime}</div>
          <div style={{ marginTop: SPACING.lg }}><Button variant="primary" onClick={onClose}>Done</Button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Book Appointment" onClose={onClose} footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!selectedDate || !selectedTime || !customerFirst || submitting}>
          {submitting ? 'Creating...' : 'Create Appointment'}
        </Button>
      </div>
    }>
      {/* Vehicle summary */}
      <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
        <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{year} {make} {model}</div>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
          {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''}
          {discountAmount > 0 ? (
            <> -- <span style={{ textDecoration: 'line-through' }}>${total.toLocaleString()}</span>{' '}
            <span style={{ color: COLORS.success, fontWeight: FONT.weightBold }}>${adjustedTotal.toLocaleString()}</span>
            <span style={{ color: COLORS.success }}> (-${discountAmount})</span></>
          ) : <> -- ${total.toLocaleString()}</>}
        </div>
      </div>

      {/* GC / Promo Code */}
      <div style={{ marginBottom: SPACING.lg }}>
        <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <FormField label="Gift Certificate / Promo Code">
              <TextInput value={gcCode} onChange={e => { setGcCode(e.target.value); setGcValid(null); setGcError(''); }} placeholder="Enter code (optional)" />
            </FormField>
          </div>
          <div style={{ marginBottom: SPACING.lg }}>
            <Button variant="secondary" onClick={validateGC} disabled={!gcCode.trim() || gcLoading}>
              {gcLoading ? 'Checking...' : 'Apply'}
            </Button>
          </div>
        </div>
        {gcValid && <div style={{ padding: SPACING.sm, background: COLORS.successBg, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, color: COLORS.success, marginTop: -SPACING.sm }}>
          {gcValid.discountType === 'dollar' ? `$${gcValid.amount} gift certificate applied` : `${gcValid.amount}% promo applied`}{gcValid.promoNote && ` -- ${gcValid.promoNote}`}
        </div>}
        {gcError && <div style={{ padding: SPACING.sm, background: COLORS.dangerBg, borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, color: COLORS.danger, marginTop: -SPACING.sm }}>{gcError}</div>}
      </div>

      {/* Customer info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
        <FormField label="First Name *"><TextInput value={customerFirst} onChange={e => setCustomerFirst(e.target.value)} placeholder="First name" /></FormField>
        <FormField label="Last Name"><TextInput value={customerLast} onChange={e => setCustomerLast(e.target.value)} placeholder="Last name" /></FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
        <FormField label="Phone"><TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(301) 555-1234" /></FormField>
        <FormField label="Email"><TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" /></FormField>
      </div>

      {/* Appointment details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
        <FormField label="Type"><SelectInput value={appointmentType} onChange={e => setAppointmentType(e.target.value)}>
          {appointmentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectInput></FormField>
        <FormField label="Date *"><TextInput type="date" value={selectedDate} min={today} onChange={e => setSelectedDate(e.target.value)} /></FormField>
        <FormField label="Time *"><SelectInput value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
          <option value="">Select Time</option>
          {timeSlots.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </SelectInput></FormField>
      </div>

      {selectedDate && (
        <div style={{ marginBottom: SPACING.lg }}>
          <MiniTimeline appointments={dayAppointments} loading={loadingDay}
            dateLabel={`Schedule for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
            summary={daySummary} height={360} />
        </div>
      )}

      <FormField label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes..."
          style={{ width: '100%', padding: `${SPACING.sm}px ${SPACING.md}px`, background: COLORS.inputBg, border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm, color: COLORS.textPrimary, fontSize: FONT.sizeSm, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
      </FormField>
    </Modal>
  );
}

// ============================================================================
// SEND TO CUSTOMER MODAL (Tailored Booking Link)
// ============================================================================

export function SendToCustomerModal({
  config, vehicle, year, make, model, selectedServices, total, onClose, onComplete,
  prefillName, prefillPhone, prefillEmail,
}: ModalProps) {
  const [customerName, setCustomerName] = useState(prefillName || '');
  const [customerPhone, setCustomerPhone] = useState(prefillPhone || '');
  const [customerEmail, setCustomerEmail] = useState(prefillEmail || '');
  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const shopRequiresDeposit = config.shopConfig.require_deposit;
  const shopDepositAmount = config.shopConfig.deposit_amount || 50;
  const [chargeDeposit, setChargeDeposit] = useState(shopRequiresDeposit);
  const [depositAmount, setDepositAmount] = useState(shopDepositAmount);

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auto/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || null, customer_phone: customerPhone || null, customer_email: customerEmail || null,
          vehicle_year: parseInt(year), vehicle_make: make, vehicle_model: model,
          vehicle_id: vehicle.id, class_keys: vehicle.class_keys.join('|'),
          services: selectedServices.map(s => ({
            service_key: s.serviceKey, label: s.label, film_id: s.filmId || null,
            film_name: s.filmName, price: s.price, shade_front: s.shadeFront, shade_rear: s.shadeRear,
          })),
          total_price: total, charge_deposit: chargeDeposit,
          deposit_amount: chargeDeposit ? depositAmount : 0, send_method: 'copy',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedLink(data.booking_url);
      }
    } catch { /* silent */ }
    setSubmitting(false);
  }

  async function handleCopy() {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Send to Customer" onClose={onClose} footer={
      !generatedLink ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={submitting}>
            {submitting ? 'Generating...' : 'Generate Booking Link'}
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
          <Button variant="primary" onClick={() => { if (onComplete) onComplete(); else onClose(); }}>Done</Button>
        </div>
      )
    }>
      {!generatedLink ? (
        <>
          {/* Vehicle + services summary */}
          <div style={{ padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{year} {make} {model}</div>
            {selectedServices.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
                <span>{s.label}{s.filmName !== 'N/A' ? ` (${s.filmName})` : ''}{s.shadeFront ? ` - ${s.shadeFront}` : ''}</span>
                <span>${s.price}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTop: `1px solid ${COLORS.border}`, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
              <span>Total</span><span>${total.toLocaleString()}</span>
            </div>
          </div>

          {/* Deposit settings */}
          <div style={{ padding: SPACING.md, background: COLORS.activeBg, borderRadius: RADIUS.sm, marginBottom: SPACING.lg, border: `1px solid ${COLORS.borderAccent}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>Require Deposit</div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Default: {shopRequiresDeposit ? `$${shopDepositAmount}` : 'No deposit'}</div>
              </div>
              <button onClick={() => setChargeDeposit(!chargeDeposit)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: chargeDeposit ? COLORS.red : COLORS.border, position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: chargeDeposit ? 23 : 3, transition: 'left 0.2s' }} />
              </button>
            </div>
            {chargeDeposit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>$</span>
                <TextInput type="number" value={String(depositAmount)} onChange={e => setDepositAmount(Number(e.target.value) || 0)}
                  style={{ maxWidth: 100, minHeight: 32, fontSize: FONT.sizeSm }} />
              </div>
            )}
          </div>

          {/* Customer info */}
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>Customer info (optional -- for lead tracking)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
            <FormField label="Name"><TextInput value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" /></FormField>
            <FormField label="Phone"><TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(301) 555-1234" /></FormField>
          </div>
          <FormField label="Email"><TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" /></FormField>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: SPACING.lg }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>Booking Link Generated</div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
            Customer will see their {year} {make} {model} with all services pre-selected.
            {chargeDeposit ? ` $${depositAmount} deposit required to book.` : ' No deposit required.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, padding: SPACING.md, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}` }}>
            <input readOnly value={generatedLink} style={{ flex: 1, background: 'none', border: 'none', color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', fontFamily: 'monospace' }}
              onClick={e => (e.target as HTMLInputElement).select()} />
            <Button variant={copied ? 'primary' : 'secondary'} onClick={handleCopy}>{copied ? 'Copied' : 'Copy'}</Button>
          </div>
          {customerName && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.md }}>Lead tracked for {customerName}{customerPhone ? ` (${customerPhone})` : ''}</div>}
        </div>
      )}
    </Modal>
  );
}
