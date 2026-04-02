'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, FormField, TextInput, SelectInput, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, FONT, SPACING, RADIUS } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';
import type { BulkConfig, AutoVehicle, AutoFilmShade } from '@/app/components/booking/types';
import {
  calculateServicePrice, getAllowedShades, needsSplitShades, getAvailableFilms,
} from '@/app/components/booking/pricing';

interface ServiceLine {
  serviceKey: string;
  label: string;
  filmId: number | null;
  filmName: string | null;
  filmAbbrev: string | null;
  shadeFront: string | null;
  shadeRear: string | null;
  shade: string | null;
  price: number;
  discountAmount: number;
  duration: number;
}

interface Props {
  appointment: Appointment;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function EditAppointmentModal({ appointment, onSave, onClose }: Props) {
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [services, setServices] = useState<ServiceLine[]>([]);
  const [status, setStatus] = useState(appointment.status);
  const [notes, setNotes] = useState(appointment.notes || '');
  const [priceOverride, setPriceOverride] = useState('');
  const [saving, setSaving] = useState(false);

  // Reschedule state
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState(appointment.appointment_date || '');
  const [newTime, setNewTime] = useState(appointment.appointment_time || '');
  const [newApptType, setNewApptType] = useState(appointment.appointment_type);
  const [dayAppts, setDayAppts] = useState<{
    customer_name: string; appointment_time: string | null;
    appointment_type: string; vehicle_year: number | null;
    vehicle_make: string | null; vehicle_model: string | null;
    duration_minutes: number | null; services_json?: unknown;
    status: string; id: string;
  }[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayCounts, setDayCounts] = useState<{ total: number; dropoffs: number; waiting: number; headsups: number } | null>(null);

  // Editable vehicle
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [vYear, setVYear] = useState(String(appointment.vehicle_year || ''));
  const [vMake, setVMake] = useState(appointment.vehicle_make || '');
  const [vModel, setVModel] = useState(appointment.vehicle_model || '');

  // Add service state
  const [addingService, setAddingService] = useState(false);
  const [newServiceKey, setNewServiceKey] = useState('');
  const [newFilmId, setNewFilmId] = useState<number | null>(null);
  const [newShadeFront, setNewShadeFront] = useState<string | null>(null);
  const [newShadeRear, setNewShadeRear] = useState<string | null>(null);

  // Load config
  useEffect(() => {
    fetch('/api/auto/config').then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  // Initialize services from appointment
  useEffect(() => {
    if (Array.isArray(appointment.services_json)) {
      setServices(appointment.services_json as ServiceLine[]);
    }
  }, [appointment]);

  // Fetch day schedule when reschedule date changes
  useEffect(() => {
    if (!rescheduling || !newDate) { setDayAppts([]); setDayCounts(null); return; }
    setLoadingDay(true);
    fetch(`/api/auto/appointments?date=${newDate}`)
      .then(r => r.json())
      .then(data => {
        setDayAppts(
          (data.appointments || [])
            .filter((a: { status: string; id: string }) => a.status !== 'cancelled' && a.id !== appointment.id)
            .sort((a: { appointment_time: string | null }, b: { appointment_time: string | null }) =>
              (a.appointment_time || '99:99').localeCompare(b.appointment_time || '99:99'))
        );
        setDayCounts(data.summary || null);
      })
      .catch(() => { setDayAppts([]); setDayCounts(null); })
      .finally(() => setLoadingDay(false));
  }, [rescheduling, newDate, appointment.id]);

  // Time slots for reschedule
  const rescheduleTimeSlots = useMemo(() => {
    const slots: { value: string; label: string }[] = [];
    for (let h = 7; h <= 18; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
        const label = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
        slots.push({ value: hour24, label });
      }
    }
    return slots;
  }, []);

  const rescheduleApptTypes = useMemo(() => {
    if (!config) return [];
    const types: { value: string; label: string }[] = [];
    if (config.shopConfig.enable_dropoff) types.push({ value: 'dropoff', label: 'Drop-off' });
    if (config.shopConfig.enable_waiting) types.push({ value: 'waiting', label: 'Waiting' });
    if (config.shopConfig.enable_headsup_30) types.push({ value: 'headsup_30', label: 'Heads-Up (30 min)' });
    if (config.shopConfig.enable_headsup_60) types.push({ value: 'headsup_60', label: 'Heads-Up (60 min)' });
    return types;
  }, [config]);

  // Resolve vehicle from current YMM state
  // Falls back to a synthetic vehicle using the appointment's stored class_keys
  const vehicle = useMemo((): AutoVehicle | null => {
    if (!config) return null;
    if (vYear && vMake && vModel) {
      const year = parseInt(vYear);
      const found = config.vehicles.find(v =>
        v.make === vMake && v.model === vModel && year >= v.year_start && year <= v.year_end
      );
      if (found) return found;
    }
    // Fallback: build a synthetic vehicle from the appointment's stored class_keys
    // This ensures pricing works even if the exact vehicle isn't found in the DB
    if (appointment.class_keys) {
      return {
        id: 0,
        make: appointment.vehicle_make || '',
        model: appointment.vehicle_model || '',
        year_start: appointment.vehicle_year || 2020,
        year_end: appointment.vehicle_year || 2030,
        class_keys: appointment.class_keys.split('|'),
        window_count: null,
        door_count: null,
        has_front_quarters: false,
        has_rear_quarters: false,
        vehicle_category: null,
        duration_override_minutes: null,
        active: true,
      } as AutoVehicle;
    }
    return null;
  }, [config, vYear, vMake, vModel, appointment]);

  const requiresSplit = useMemo(() => {
    if (!config || !vehicle) return false;
    return needsSplitShades(vehicle, config.classRules);
  }, [config, vehicle]);

  const availableFilms = useMemo(() => {
    if (!config || !vehicle) return config?.films || [];
    return getAvailableFilms(vehicle, config.films);
  }, [config, vehicle]);

  // Vehicle dropdowns
  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const s = new Set<number>();
    config.vehicles.forEach(v => { for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) s.add(y); });
    return Array.from(s).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !vYear) return [];
    const year = parseInt(vYear);
    const s = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end) s.add(v.make); });
    return Array.from(s).sort();
  }, [config, vYear]);

  const models = useMemo(() => {
    if (!config || !vYear || !vMake) return [];
    const year = parseInt(vYear);
    const s = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end && v.make === vMake) s.add(v.model); });
    return Array.from(s).sort();
  }, [config, vYear, vMake]);

  // Reprice all services when vehicle changes
  const repriceServices = useCallback(() => {
    if (!vehicle || !config) return;
    setServices(prev => prev.map(svc => {
      if (svc.filmId) {
        const price = calculateServicePrice(vehicle, svc.serviceKey, svc.filmId, config.pricing, config.vehicleClasses);
        return { ...svc, price };
      }
      // Removal services (no film)
      const price = calculateServicePrice(vehicle, svc.serviceKey, null, config.pricing, config.vehicleClasses);
      return { ...svc, price };
    }));
  }, [vehicle, config]);

  // Available services for add
  const availableServiceDefs = useMemo(() => {
    if (!config) return [];
    const existingKeys = new Set(services.map(s => s.serviceKey));
    return config.services.filter(s => s.enabled && !existingKeys.has(s.service_key)).sort((a, b) => a.sort_order - b.sort_order);
  }, [config, services]);

  // New service shades
  const newServiceShades = useMemo(() => {
    if (!config || !newFilmId || !newServiceKey) return [];
    return getAllowedShades(newServiceKey, newFilmId, config.filmShades, config.serviceShades);
  }, [config, newFilmId, newServiceKey]);

  // New service price
  const newServicePrice = useMemo(() => {
    if (!vehicle || !config || !newServiceKey) return 0;
    const svcDef = config.services.find(s => s.service_key === newServiceKey);
    if (svcDef?.service_type === 'removal') return calculateServicePrice(vehicle, newServiceKey, null, config.pricing, config.vehicleClasses);
    if (!newFilmId) return 0;
    return calculateServicePrice(vehicle, newServiceKey, newFilmId, config.pricing, config.vehicleClasses);
  }, [vehicle, config, newServiceKey, newFilmId]);

  const newServiceDuration = useMemo(() => {
    if (!config || !newServiceKey) return 30;
    return config.services.find(s => s.service_key === newServiceKey)?.duration_minutes || 30;
  }, [config, newServiceKey]);

  // Does new service need split shades?
  const newServiceNeedsSplit = useMemo(() => {
    if (!config || !vehicle || !newServiceKey) return false;
    const svcDef = config.services.find(s => s.service_key === newServiceKey);
    if (!svcDef?.is_primary) return false;
    return requiresSplit;
  }, [config, vehicle, newServiceKey, requiresSplit]);

  // Pricing
  const subtotal = services.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDiscount = services.reduce((sum, s) => sum + (s.discountAmount || 0), 0);
  const depositPaid = Number(appointment.deposit_paid) || 0;
  const calculatedBalance = subtotal - totalDiscount - depositPaid;
  const finalBalance = priceOverride ? parseFloat(priceOverride) : calculatedBalance;
  const totalDuration = services.reduce((sum, s) => sum + (s.duration || 30), 0);

  // Get shades for a service
  function getShadesFor(serviceKey: string, filmId: number): AutoFilmShade[] {
    if (!config) return [];
    return getAllowedShades(serviceKey, filmId, config.filmShades, config.serviceShades, config.films);
  }

  // Service editing functions
  function removeService(index: number) {
    setServices(prev => prev.filter((_, i) => i !== index));
  }

  // Change the service type itself (e.g., 2 Front Doors → Full Sides & Rear)
  function changeServiceType(index: number, newKey: string) {
    if (!config) return;
    const svcDef = config.services.find(s => s.service_key === newKey);
    if (!svcDef) return;
    const isRemoval = svcDef.service_type === 'removal';
    const isSunStrip = newKey === 'SUN_STRIP';

    setServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      // If switching to sun strip, auto-set film/shade
      if (isSunStrip) {
        const blackFilm = config.films.find(f => f.name === 'Black');
        const price = vehicle ? calculateServicePrice(vehicle, newKey, blackFilm?.id || null, config.pricing, config.vehicleClasses) : 0;
        return {
          ...s, serviceKey: newKey, label: svcDef.label,
          filmId: blackFilm?.id || null, filmName: 'Black', filmAbbrev: 'BLK',
          shadeFront: '5%', shadeRear: null, shade: '5%',
          price, duration: svcDef.duration_minutes || 15,
        };
      }
      // If switching to removal, clear film/shade
      if (isRemoval) {
        const price = vehicle ? calculateServicePrice(vehicle, newKey, null, config.pricing, config.vehicleClasses) : 0;
        return {
          ...s, serviceKey: newKey, label: svcDef.label,
          filmId: null, filmName: null, filmAbbrev: null,
          shadeFront: null, shadeRear: null, shade: null,
          price, duration: svcDef.duration_minutes || 30,
        };
      }
      // Normal tint service — keep film if set, reprice with new service key
      const price = s.filmId && vehicle
        ? calculateServicePrice(vehicle, newKey, s.filmId, config.pricing, config.vehicleClasses)
        : 0;
      return {
        ...s, serviceKey: newKey, label: svcDef.label,
        shadeFront: null, shadeRear: null, shade: null,
        price, duration: svcDef.duration_minutes || 60,
      };
    }));
  }

  function changeServiceFilm(index: number, filmId: number) {
    if (!config) return;
    const svc = services[index];
    const film = config.films.find(f => f.id === filmId);
    const price = vehicle
      ? calculateServicePrice(vehicle, svc.serviceKey, filmId, config.pricing, config.vehicleClasses)
      : 0;
    setServices(prev => prev.map((s, i) => i === index ? {
      ...s, filmId, filmName: film?.name || null, filmAbbrev: film?.abbreviation || null,
      shadeFront: null, shadeRear: null, shade: null, price,
    } : s));
  }

  function changeServiceShadeFront(index: number, shade: string) {
    setServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const shadeDisplay = requiresSplit ? `${shade}/${s.shadeRear || ''}` : shade;
      return { ...s, shadeFront: shade, shade: shadeDisplay };
    }));
  }

  function changeServiceShadeRear(index: number, shade: string) {
    setServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      return { ...s, shadeRear: shade, shade: `${s.shadeFront || ''}/${shade}` };
    }));
  }

  function changeServiceShadeSingle(index: number, shade: string) {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, shadeFront: shade, shadeRear: null, shade } : s));
  }

  // Confirm vehicle change
  function confirmVehicleChange() {
    setEditingVehicle(false);
    repriceServices();
  }

  // Add new service
  function confirmAddService() {
    if (!config || !newServiceKey) return;
    const svcDef = config.services.find(s => s.service_key === newServiceKey);
    const film = newFilmId ? config.films.find(f => f.id === newFilmId) : null;
    const isSunStrip = newServiceKey === 'SUN_STRIP';
    const isRemoval = svcDef?.service_type === 'removal';

    const shadeDisplay = newServiceNeedsSplit
      ? `${newShadeFront || ''}/${newShadeRear || ''}`
      : newShadeFront;

    setServices(prev => [...prev, {
      serviceKey: newServiceKey,
      label: svcDef?.label || newServiceKey,
      filmId: isSunStrip ? (config.films.find(f => f.name === 'Black')?.id || null) : (isRemoval ? null : newFilmId),
      filmName: isSunStrip ? 'Black' : (isRemoval ? null : film?.name || null),
      filmAbbrev: isSunStrip ? 'BLK' : (isRemoval ? null : film?.abbreviation || null),
      shadeFront: isSunStrip ? '5%' : newShadeFront,
      shadeRear: isSunStrip ? null : (newServiceNeedsSplit ? newShadeRear : null),
      shade: isSunStrip ? '5%' : (isRemoval ? null : shadeDisplay),
      price: newServicePrice,
      discountAmount: 0,
      duration: newServiceDuration,
    }]);
    setAddingService(false);
    setNewServiceKey('');
    setNewFilmId(null);
    setNewShadeFront(null);
    setNewShadeRear(null);
  }

  // Save
  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {
      vehicle_year: parseInt(vYear) || appointment.vehicle_year,
      vehicle_make: vMake || appointment.vehicle_make,
      vehicle_model: vModel || appointment.vehicle_model,
      class_keys: vehicle?.class_keys.join('|') || appointment.class_keys,
      services_json: services,
      subtotal,
      discount_amount: totalDiscount,
      balance_due: finalBalance,
      duration_minutes: totalDuration,
      status,
      notes: notes || null,
    };

    // Include reschedule fields if changed
    if (rescheduling) {
      if (newDate && newDate !== appointment.appointment_date) {
        updates.appointment_date = newDate;
      }
      const isHeadsUp = newApptType === 'headsup_30' || newApptType === 'headsup_60';
      updates.appointment_time = isHeadsUp ? null : (newTime || null);
      updates.appointment_type = newApptType;
    }

    await onSave(appointment.id, updates);
    setSaving(false);
  }

  return (
    <Modal
      title="Edit Appointment"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      }
    >
      {/* Vehicle Info — editable */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
          <SectionLabel style={{ marginBottom: 0 }}>Vehicle</SectionLabel>
          <button onClick={() => setEditingVehicle(!editingVehicle)} style={{
            background: editingVehicle ? COLORS.activeBg : 'transparent',
            color: editingVehicle ? COLORS.red : COLORS.textMuted,
            border: `1px solid ${editingVehicle ? COLORS.red : COLORS.borderInput}`,
            borderRadius: RADIUS.sm, padding: '3px 10px', cursor: 'pointer',
            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
          }}>
            {editingVehicle ? 'Editing...' : 'Edit'}
          </button>
        </div>

        {editingVehicle ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.sm, marginBottom: SPACING.md }}>
              <SelectInput value={vYear} onChange={e => { setVYear(e.target.value); setVMake(''); setVModel(''); }} style={{ minHeight: 40, fontSize: FONT.sizeSm }}>
                <option value="">Year</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </SelectInput>
              <SelectInput value={vMake} onChange={e => { setVMake(e.target.value); setVModel(''); }} disabled={!vYear} style={{ minHeight: 40, fontSize: FONT.sizeSm }}>
                <option value="">Make</option>
                {makes.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
              <SelectInput value={vModel} onChange={e => setVModel(e.target.value)} disabled={!vMake} style={{ minHeight: 40, fontSize: FONT.sizeSm }}>
                <option value="">Model</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            </div>
            {vehicle && (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
                Class: <span style={{ color: COLORS.textPrimary }}>{vehicle.class_keys.join(', ')}</span>
              </div>
            )}
            <Button variant="primary" size="sm" onClick={confirmVehicleChange} disabled={!vehicle}>
              Apply Vehicle Change
            </Button>
          </>
        ) : (
          <>
            <InfoRow label="Vehicle" value={`${vYear} ${vMake} ${vModel}`} />
            <InfoRow label="Class" value={vehicle?.class_keys.join(', ') || appointment.class_keys || 'N/A'} />
          </>
        )}

        {/* Customer info (read-only) */}
        <div style={{ marginTop: SPACING.md, paddingTop: SPACING.md, borderTop: `1px solid ${COLORS.border}` }}>
          <InfoRow label="Name" value={appointment.customer_name} />
          <InfoRow label="Phone" value={appointment.customer_phone || 'N/A'} />
          {appointment.discount_code && <InfoRow label="GC/Promo" value={appointment.discount_code} valueColor={COLORS.red} />}
        </div>
      </div>

      {/* Reschedule */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: rescheduling ? SPACING.md : 0 }}>
          <SectionLabel style={{ marginBottom: 0 }}>Reschedule</SectionLabel>
          <button onClick={() => setRescheduling(!rescheduling)} style={{
            background: rescheduling ? COLORS.activeBg : 'transparent',
            color: rescheduling ? COLORS.red : COLORS.textMuted,
            border: `1px solid ${rescheduling ? COLORS.red : COLORS.borderInput}`,
            borderRadius: RADIUS.sm, padding: '3px 10px', cursor: 'pointer',
            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
          }}>
            {rescheduling ? 'Cancel' : 'Reschedule'}
          </button>
        </div>

        {!rescheduling && (
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: SPACING.xs }}>
            {appointment.appointment_type === 'dropoff' ? 'Drop-off' : appointment.appointment_type === 'waiting' ? 'Waiting' : 'Heads-Up'}
            {' -- '}
            {appointment.appointment_date ? new Date(appointment.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}
            {appointment.appointment_time ? ` at ${new Date('2000-01-01T' + appointment.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
          </div>
        )}

        {rescheduling && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.sm, marginBottom: SPACING.md }}>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Type</div>
                <SelectInput value={newApptType} onChange={e => setNewApptType(e.target.value)} style={{ minHeight: 36, fontSize: FONT.sizeSm }}>
                  {rescheduleApptTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectInput>
              </div>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Date</div>
                <TextInput
                  type="date"
                  value={newDate}
                  onChange={e => { setNewDate(e.target.value); setNewTime(''); }}
                  style={{ minHeight: 36, fontSize: FONT.sizeSm }}
                />
              </div>
              <div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Time</div>
                {newApptType === 'headsup_30' || newApptType === 'headsup_60' ? (
                  <div style={{ padding: '8px 12px', fontSize: FONT.sizeSm, color: COLORS.textMuted, background: COLORS.inputBg, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.borderInput}` }}>
                    Heads-Up (no time)
                  </div>
                ) : (
                  <SelectInput value={newTime} onChange={e => setNewTime(e.target.value)} style={{ minHeight: 36, fontSize: FONT.sizeSm }}>
                    <option value="">Select Time</option>
                    {rescheduleTimeSlots.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </SelectInput>
                )}
              </div>
            </div>

            {/* Day schedule timeline */}
            {newDate && (
              <MiniTimeline
                appointments={dayAppts}
                loading={loadingDay}
                dateLabel={new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                summary={dayCounts}
                excludeId={appointment.id}
                height={360}
              />
            )}
          </>
        )}
      </div>

      {/* Services */}
      <SectionLabel>Services</SectionLabel>

      {services.map((svc, i) => {
        const isSunStrip = svc.serviceKey === 'SUN_STRIP';
        const isRemoval = config?.services.find(s => s.service_key === svc.serviceKey)?.service_type === 'removal';
        const isPrimary = config?.services.find(s => s.service_key === svc.serviceKey)?.is_primary;
        const needsSplit = isPrimary && requiresSplit;
        const filmShades = svc.filmId ? getShadesFor(svc.serviceKey, svc.filmId) : [];

        return (
          <div key={i} style={{
            padding: SPACING.md, marginBottom: SPACING.sm,
            border: `1px solid ${COLORS.border}`, borderRadius: 10,
          }}>
            {/* Header: service selector + price + remove */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: SPACING.sm }}>
              <SelectInput
                value={svc.serviceKey}
                onChange={e => changeServiceType(i, e.target.value)}
                style={{ minHeight: 36, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, flex: 1, maxWidth: 280 }}
              >
                <option value={svc.serviceKey}>{svc.label}</option>
                {config && (
                  <>
                    <optgroup label="Primary Services">
                      {config.services.filter(s => s.enabled && s.is_primary && s.service_key !== svc.serviceKey).map(s => (
                        <option key={s.service_key} value={s.service_key}>{s.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Secondary Services">
                      {config.services.filter(s => s.enabled && s.is_addon && s.service_key !== svc.serviceKey).map(s => (
                        <option key={s.service_key} value={s.service_key}>{s.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Removal">
                      {config.services.filter(s => s.enabled && s.service_type === 'removal' && s.service_key !== svc.serviceKey).map(s => (
                        <option key={s.service_key} value={s.service_key}>{s.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Ala Carte">
                      {config.services.filter(s => s.enabled && s.service_type === 'alacarte' && s.service_key !== svc.serviceKey).map(s => (
                        <option key={s.service_key} value={s.service_key}>{s.label}</option>
                      ))}
                    </optgroup>
                  </>
                )}
              </SelectInput>
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md, flexShrink: 0 }}>
                <span style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.success }}>
                  ${Number(svc.price || 0).toFixed(2)}
                </span>
                <button onClick={() => removeService(i)} style={{
                  background: COLORS.dangerBg, color: COLORS.danger,
                  border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, cursor: 'pointer',
                }}>
                  Remove
                </button>
              </div>
            </div>

            {/* Film selector (not for removals or sun strip) */}
            {!isSunStrip && !isRemoval && config && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Film</div>
                <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                  {availableFilms.map(film => (
                    <button key={film.id} onClick={() => changeServiceFilm(i, film.id)} style={{
                      padding: '6px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                      background: svc.filmId === film.id ? COLORS.activeBg : 'transparent',
                      color: svc.filmId === film.id ? COLORS.textPrimary : COLORS.textTertiary,
                      border: `1px solid ${svc.filmId === film.id ? COLORS.red : COLORS.borderInput}`,
                      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                    }}>
                      {film.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shade selector — split front/rear when applicable */}
            {!isSunStrip && !isRemoval && svc.filmId && filmShades.length > 0 && (
              <div>
                {needsSplit ? (
                  <>
                    <ShadeSelector
                      label="Front Doors"
                      shades={filmShades}
                      selected={svc.shadeFront}
                      onSelect={shade => changeServiceShadeFront(i, shade)}
                    />
                    <ShadeSelector
                      label="Rear"
                      shades={filmShades}
                      selected={svc.shadeRear}
                      onSelect={shade => changeServiceShadeRear(i, shade)}
                    />
                  </>
                ) : (
                  <ShadeSelector
                    label="Shade"
                    shades={filmShades}
                    selected={svc.shadeFront || svc.shade}
                    onSelect={shade => changeServiceShadeSingle(i, shade)}
                  />
                )}
              </div>
            )}

            {/* Sun strip fixed display */}
            {isSunStrip && (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Black - 5% (fixed)</div>
            )}
          </div>
        );
      })}

      {/* Add Service */}
      {!addingService ? (
        <button onClick={() => setAddingService(true)} style={{
          width: '100%', padding: SPACING.md, marginBottom: SPACING.lg,
          background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
          borderRadius: 10, color: COLORS.red, cursor: 'pointer',
          fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
        }}>
          + Add Service
        </button>
      ) : (
        <div style={{
          padding: SPACING.lg, marginBottom: SPACING.lg,
          border: `1px solid ${COLORS.red}40`, borderRadius: 10, background: `${COLORS.red}08`,
        }}>
          <SectionLabel>Add Service</SectionLabel>

          <FormField label="Service">
            <SelectInput value={newServiceKey} onChange={e => { setNewServiceKey(e.target.value); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null); }}>
              <option value="">Select service...</option>
              {config && (
                <>
                  <optgroup label="Primary Services">
                    {availableServiceDefs.filter(s => s.is_primary).map(s => (
                      <option key={s.service_key} value={s.service_key}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Secondary Services">
                    {availableServiceDefs.filter(s => s.is_addon).map(s => (
                      <option key={s.service_key} value={s.service_key}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Removal">
                    {availableServiceDefs.filter(s => s.service_type === 'removal').map(s => (
                      <option key={s.service_key} value={s.service_key}>{s.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Ala Carte">
                    {availableServiceDefs.filter(s => s.service_type === 'alacarte').map(s => (
                      <option key={s.service_key} value={s.service_key}>{s.label}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </SelectInput>
          </FormField>

          {/* Film (tint services only, not sun strip) */}
          {newServiceKey && !['SUN_STRIP'].includes(newServiceKey) && config?.services.find(s => s.service_key === newServiceKey)?.service_type !== 'removal' && (
            <FormField label="Film">
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                {availableFilms.map(film => {
                  return (
                    <button key={film.id} onClick={() => { setNewFilmId(newFilmId === film.id ? null : film.id); setNewShadeFront(null); setNewShadeRear(null); }}
                      style={{
                        padding: '8px 14px', borderRadius: RADIUS.md, cursor: 'pointer', textAlign: 'center',
                        background: newFilmId === film.id ? COLORS.activeBg : 'transparent',
                        color: newFilmId === film.id ? COLORS.textPrimary : COLORS.textTertiary,
                        border: `1px solid ${newFilmId === film.id ? COLORS.red : COLORS.borderInput}`,
                        fontSize: FONT.sizeXs,
                      }}>
                      <div style={{ fontWeight: FONT.weightBold }}>{film.display_name || film.name}</div>
                      {film.ir_rejection && <div style={{ fontSize: '0.55rem', marginTop: 2 }}>IR: {film.ir_rejection}</div>}
                    </button>
                  );
                })}
              </div>
            </FormField>
          )}

          {/* Shade — split when applicable */}
          {newFilmId && newServiceShades.length > 0 && (
            newServiceNeedsSplit ? (
              <>
                <ShadeSelector label="Front Doors" shades={newServiceShades} selected={newShadeFront} onSelect={setNewShadeFront} />
                <ShadeSelector label="Rear" shades={newServiceShades} selected={newShadeRear} onSelect={setNewShadeRear} />
              </>
            ) : (
              <ShadeSelector label="Shade" shades={newServiceShades} selected={newShadeFront} onSelect={setNewShadeFront} />
            )
          )}

          {/* Price preview */}
          {newServicePrice > 0 && (
            <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.success, marginBottom: SPACING.md }}>
              ${newServicePrice.toFixed(2)}
            </div>
          )}

          <div style={{ display: 'flex', gap: SPACING.sm }}>
            <Button variant="secondary" size="sm" onClick={() => { setAddingService(false); setNewServiceKey(''); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={confirmAddService}
              disabled={!newServiceKey || (config?.services.find(s => s.service_key === newServiceKey)?.service_type === 'tint' && (!newFilmId || !newShadeFront))}>
              Add Service
            </Button>
          </div>
        </div>
      )}

      {/* Pricing Summary */}
      <SectionLabel>Pricing</SectionLabel>
      <div style={{ padding: SPACING.lg, borderRadius: 10, border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg }}>
        <PricingRow label="Services Subtotal" value={`$${subtotal.toFixed(2)}`} />
        {totalDiscount > 0 && <PricingRow label="Discount" value={`-$${totalDiscount.toFixed(2)}`} color={COLORS.success} />}
        {depositPaid > 0 && <PricingRow label="Deposit Paid" value={`-$${depositPaid.toFixed(2)}`} color={COLORS.info} />}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          paddingTop: SPACING.sm, marginTop: SPACING.sm, borderTop: `1px solid ${COLORS.border}`,
          fontSize: '1.1rem', fontWeight: FONT.weightBold, color: COLORS.textPrimary,
        }}>
          <span>Balance Due:</span>
          <span>${calculatedBalance.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>Duration: {totalDuration} minutes</div>
        <div style={{ marginTop: SPACING.md }}>
          <FormField label="Override Balance" hint="Leave blank to use calculated balance">
            <TextInput type="number" value={priceOverride} onChange={e => setPriceOverride(e.target.value)} placeholder={`$${calculatedBalance.toFixed(2)}`} />
          </FormField>
        </div>
      </div>

      {/* Status */}
      <FormField label="Status">
        <SelectInput value={status} onChange={e => setStatus(e.target.value)}>
          <option value="booked">Not Checked In</option>
          <option value="in_progress">Checked In</option>
          <option value="completed">Completed</option>
          <option value="invoiced">Invoiced</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </SelectInput>
      </FormField>

      {/* Notes */}
      <FormField label="Notes">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes..."
          style={{
            width: '100%', minHeight: 80, padding: SPACING.md,
            background: COLORS.inputBg, color: COLORS.textPrimary,
            border: `1px solid ${COLORS.borderInput}`, borderRadius: 8,
            fontSize: FONT.sizeBase, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
          }}
        />
      </FormField>
    </Modal>
  );
}

// Shade selector with visual tint buttons
function ShadeSelector({ label, shades, selected, onSelect }: {
  label: string; shades: AutoFilmShade[]; selected: string | null; onSelect: (shade: string) => void;
}) {
  return (
    <div style={{ marginBottom: SPACING.sm }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {shades.map(shade => {
          const numeric = shade.shade_numeric || parseInt(shade.shade_value) || 50;
          const darkness = 1 - (numeric / 100);
          return (
            <button key={shade.id} onClick={() => onSelect(shade.shade_value)} style={{
              padding: '6px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
              background: selected === shade.shade_value ? COLORS.activeBg : COLORS.inputBg,
              color: selected === shade.shade_value ? COLORS.red : COLORS.textSecondary,
              border: `2px solid ${selected === shade.shade_value ? COLORS.red : COLORS.borderInput}`,
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
              minWidth: 44, textAlign: 'center',
            }}>
              {shade.shade_label || shade.shade_value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
      textTransform: 'uppercase', letterSpacing: '1px',
      color: COLORS.textMuted, marginBottom: SPACING.md, ...style,
    }}>
      {children}
    </div>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: FONT.sizeSm }}>
      <span style={{ color: COLORS.textMuted, minWidth: 60 }}>{label}:</span>
      <span style={{ color: valueColor || COLORS.textPrimary }}>{value}</span>
    </div>
  );
}

function PricingRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: FONT.sizeBase, color: color || COLORS.textSecondary }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
