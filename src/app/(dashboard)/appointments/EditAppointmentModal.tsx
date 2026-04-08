'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button, FormField, TextInput, SelectInput, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, FONT, SPACING, RADIUS } from '@/app/components/dashboard/theme';
import type { Appointment } from './AppointmentCard';
import type { BulkConfig, AutoVehicle, AutoFilmShade } from '@/app/components/booking/types';
import {
  calculateServicePrice, getAllowedShades, needsSplitShades, getAvailableFilms, buildShadeDisplay,
} from '@/app/components/booking/pricing';

// ============================================================================
// TYPES
// ============================================================================

interface TintServiceLine {
  serviceKey: string;
  label: string;
  filmId: number | null;
  filmName: string | null;
  filmAbbrev: string | null;
  shadeFront: string | null;
  shadeRear: string | null;
  shade: string | null;
  price: number;
  originalPrice?: number;
  priceNote?: string | null;
  discountAmount: number;
  duration: number;
}

interface GenericLineItem {
  id: string | null; // null = new item, string = existing document_line_item
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  module: string;
  customFields: Record<string, unknown>;
}

interface Props {
  appointment: Appointment;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  onClose: () => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EditAppointmentModal({ appointment, onSave, onClose }: Props) {
  const isTintModule = appointment.module === 'auto_tint' || !appointment.module;

  // Shared state
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

  // Tint-specific state
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [tintServices, setTintServices] = useState<TintServiceLine[]>([]);

  // Generic line item state (for non-tint modules)
  const [genericItems, setGenericItems] = useState<GenericLineItem[]>([]);
  const [loadingDoc, setLoadingDoc] = useState(false);

  // Editable vehicle
  const [editingVehicle, setEditingVehicle] = useState(false);
  const [vYear, setVYear] = useState(String(appointment.vehicle_year || ''));
  const [vMake, setVMake] = useState(appointment.vehicle_make || '');
  const [vModel, setVModel] = useState(appointment.vehicle_model || '');

  // Tint add service state
  const [addingService, setAddingService] = useState(false);
  const [newServiceKey, setNewServiceKey] = useState('');
  const [newFilmId, setNewFilmId] = useState<number | null>(null);
  const [newShadeFront, setNewShadeFront] = useState<string | null>(null);
  const [newShadeRear, setNewShadeRear] = useState<string | null>(null);

  // Generic add item state
  const [addingGenericItem, setAddingGenericItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');

  // Load config (needed for tint AND for reschedule appointment types)
  useEffect(() => {
    fetch('/api/auto/config').then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  // Initialize services from appointment
  useEffect(() => {
    if (isTintModule) {
      if (Array.isArray(appointment.services_json)) {
        setTintServices(appointment.services_json as TintServiceLine[]);
      }
    }
  }, [appointment, isTintModule]);

  // For non-tint modules: load document line items if document_id exists
  useEffect(() => {
    if (isTintModule) return;

    if (appointment.document_id) {
      setLoadingDoc(true);
      fetch(`/api/documents/${appointment.document_id}`)
        .then(r => r.json())
        .then(data => {
          const doc = data;
          const items = (doc?.document_line_items || []) as Array<{
            id: string; description: string; quantity: number;
            unit_price: number; line_total: number; module: string;
            custom_fields: Record<string, unknown>;
          }>;
          // Only show line items for this appointment's module
          const moduleItems = items.filter(li => li.module === appointment.module);
          setGenericItems(moduleItems.map(li => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unit_price,
            lineTotal: li.line_total,
            module: li.module,
            customFields: li.custom_fields || {},
          })));
        })
        .catch(() => {})
        .finally(() => setLoadingDoc(false));
    } else if (Array.isArray(appointment.services_json)) {
      // Fallback: build generic items from services_json
      setGenericItems(
        (appointment.services_json as Array<Record<string, unknown>>).map((svc, i) => ({
          id: null,
          description: (svc.label as string) || '',
          quantity: (svc.quantity as number) || 1,
          unitPrice: (svc.unitPrice as number) || (svc.price as number) || 0,
          lineTotal: (svc.lineTotal as number) || (svc.price as number) || 0,
          module: (svc.module as string) || appointment.module || '',
          customFields: {},
        }))
      );
    }
  }, [appointment, isTintModule]);

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

  // ============================================================================
  // TINT-SPECIFIC LOGIC (only used when isTintModule)
  // ============================================================================

  const vehicle = useMemo((): AutoVehicle | null => {
    if (!config) return null;
    if (vYear && vMake && vModel) {
      const year = parseInt(vYear);
      const found = config.vehicles.find(v =>
        v.make === vMake && v.model === vModel && year >= v.year_start && year <= v.year_end
      );
      if (found) return found;
    }
    if (appointment.class_keys) {
      return {
        id: 0, make: appointment.vehicle_make || '', model: appointment.vehicle_model || '',
        year_start: appointment.vehicle_year || 2020, year_end: appointment.vehicle_year || 2030,
        class_keys: appointment.class_keys.split('|'), window_count: null, door_count: null,
        has_front_quarters: false, has_rear_quarters: false, vehicle_category: null,
        duration_override_minutes: null, active: true,
      } as AutoVehicle;
    }
    return null;
  }, [config, vYear, vMake, vModel, appointment]);

  function shouldSplit(serviceKey: string): boolean {
    if (!config || !vehicle) return false;
    return needsSplitShades(vehicle, config.classRules, serviceKey);
  }

  const availableFilms = useMemo(() => {
    if (!config || !vehicle) return config?.films || [];
    return getAvailableFilms(vehicle, config.films);
  }, [config, vehicle]);

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

  const repriceServices = useCallback(() => {
    if (!vehicle || !config) return;
    setTintServices(prev => prev.map(svc => {
      if (svc.filmId) {
        const price = calculateServicePrice(vehicle, svc.serviceKey, svc.filmId, config.pricing, config.vehicleClasses);
        return { ...svc, price };
      }
      const price = calculateServicePrice(vehicle, svc.serviceKey, null, config.pricing, config.vehicleClasses);
      return { ...svc, price };
    }));
  }, [vehicle, config]);

  const availableServiceDefs = useMemo(() => {
    if (!config) return [];
    const existingKeys = new Set(tintServices.map(s => s.serviceKey));
    return config.services.filter(s => s.enabled && !existingKeys.has(s.service_key)).sort((a, b) => a.sort_order - b.sort_order);
  }, [config, tintServices]);

  const newServiceShades = useMemo(() => {
    if (!config || !newFilmId || !newServiceKey) return [];
    return getAllowedShades(newServiceKey, newFilmId, config.filmShades, config.serviceShades);
  }, [config, newFilmId, newServiceKey]);

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

  const newServiceNeedsSplit = useMemo(() => {
    if (!newServiceKey) return false;
    return shouldSplit(newServiceKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, vehicle, newServiceKey]);

  function getShadesFor(serviceKey: string, filmId: number) {
    if (!config) return [];
    return getAllowedShades(serviceKey, filmId, config.filmShades, config.serviceShades, config.films);
  }

  function removeTintService(index: number) { setTintServices(prev => prev.filter((_, i) => i !== index)); }

  function changeServiceType(index: number, newKey: string) {
    if (!config) return;
    const svcDef = config.services.find(s => s.service_key === newKey);
    if (!svcDef) return;
    const isRemoval = svcDef.service_type === 'removal';
    const isSunStrip = newKey === 'SUN_STRIP';

    setTintServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      if (isSunStrip) {
        const blackFilm = config.films.find(f => f.name === 'Black');
        const price = vehicle ? calculateServicePrice(vehicle, newKey, blackFilm?.id || null, config.pricing, config.vehicleClasses) : 0;
        return { ...s, serviceKey: newKey, label: svcDef.label, filmId: blackFilm?.id || null, filmName: 'Black', filmAbbrev: 'BLK', shadeFront: '5%', shadeRear: null, shade: '5%', price, duration: svcDef.duration_minutes || 15 };
      }
      if (isRemoval) {
        const price = vehicle ? calculateServicePrice(vehicle, newKey, null, config.pricing, config.vehicleClasses) : 0;
        return { ...s, serviceKey: newKey, label: svcDef.label, filmId: null, filmName: null, filmAbbrev: null, shadeFront: null, shadeRear: null, shade: null, price, duration: svcDef.duration_minutes || 30 };
      }
      const price = s.filmId && vehicle ? calculateServicePrice(vehicle, newKey, s.filmId, config.pricing, config.vehicleClasses) : 0;
      return { ...s, serviceKey: newKey, label: svcDef.label, shadeFront: null, shadeRear: null, shade: null, price, duration: svcDef.duration_minutes || 60 };
    }));
  }

  function changeServiceFilm(index: number, filmId: number) {
    if (!config) return;
    const svc = tintServices[index];
    const film = config.films.find(f => f.id === filmId);
    const price = vehicle ? calculateServicePrice(vehicle, svc.serviceKey, filmId, config.pricing, config.vehicleClasses) : 0;
    setTintServices(prev => prev.map((s, i) => i === index ? { ...s, filmId, filmName: film?.name || null, filmAbbrev: film?.abbreviation || null, shadeFront: null, shadeRear: null, shade: null, price } : s));
  }

  function changeServiceShadeFront(index: number, shade: string) {
    setTintServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const isSplit = shouldSplit(s.serviceKey);
      return { ...s, shadeFront: shade, shade: buildShadeDisplay(shade, s.shadeRear, isSplit) };
    }));
  }

  function changeServiceShadeRear(index: number, shade: string) {
    setTintServices(prev => prev.map((s, i) => i !== index ? s : { ...s, shadeRear: shade, shade: buildShadeDisplay(s.shadeFront, shade, true) }));
  }

  function changeServiceShadeSingle(index: number, shade: string) {
    setTintServices(prev => prev.map((s, i) => i === index ? { ...s, shadeFront: shade, shadeRear: null, shade } : s));
  }

  function confirmVehicleChange() {
    setEditingVehicle(false);
    repriceServices();
  }

  function confirmAddTintService() {
    if (!config || !newServiceKey) return;
    const svcDef = config.services.find(s => s.service_key === newServiceKey);
    const film = newFilmId ? config.films.find(f => f.id === newFilmId) : null;
    const isSunStrip = newServiceKey === 'SUN_STRIP';
    const isRemoval = svcDef?.service_type === 'removal';
    const shadeDisplay = buildShadeDisplay(newShadeFront, newShadeRear, newServiceNeedsSplit);

    setTintServices(prev => [...prev, {
      serviceKey: newServiceKey, label: svcDef?.label || newServiceKey,
      filmId: isSunStrip ? (config.films.find(f => f.name === 'Black')?.id || null) : (isRemoval ? null : newFilmId),
      filmName: isSunStrip ? 'Black' : (isRemoval ? null : film?.name || null),
      filmAbbrev: isSunStrip ? 'BLK' : (isRemoval ? null : film?.abbreviation || null),
      shadeFront: isSunStrip ? '5%' : newShadeFront,
      shadeRear: isSunStrip ? null : (newServiceNeedsSplit ? newShadeRear : null),
      shade: isSunStrip ? '5%' : (isRemoval ? null : shadeDisplay),
      price: newServicePrice, discountAmount: 0, duration: newServiceDuration,
    }]);
    setAddingService(false); setNewServiceKey(''); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null);
  }

  // ============================================================================
  // GENERIC LINE ITEM LOGIC (non-tint modules)
  // ============================================================================

  function removeGenericItem(index: number) { setGenericItems(prev => prev.filter((_, i) => i !== index)); }

  function updateGenericItem(index: number, field: keyof GenericLineItem, value: string | number) {
    setGenericItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'unitPrice' || field === 'quantity') {
        updated.lineTotal = (Number(updated.unitPrice) || 0) * (Number(updated.quantity) || 1);
      }
      return updated;
    }));
  }

  function addGenericItem() {
    if (!newItemDesc.trim()) return;
    const price = parseFloat(newItemPrice) || 0;
    const qty = parseInt(newItemQty) || 1;
    setGenericItems(prev => [...prev, {
      id: null, description: newItemDesc.trim(), quantity: qty,
      unitPrice: price, lineTotal: price * qty,
      module: appointment.module || '', customFields: {},
    }]);
    setNewItemDesc(''); setNewItemPrice(''); setNewItemQty('1'); setAddingGenericItem(false);
  }

  // ============================================================================
  // PRICING
  // ============================================================================

  const subtotal = isTintModule
    ? tintServices.reduce((sum, s) => sum + (s.price || 0), 0)
    : genericItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  const totalDiscount = isTintModule
    ? tintServices.reduce((sum, s) => sum + (s.discountAmount || 0), 0)
    : 0;
  const depositPaid = Number(appointment.deposit_paid) || 0;
  const calculatedBalance = subtotal - totalDiscount - depositPaid;
  const finalBalance = priceOverride ? parseFloat(priceOverride) : calculatedBalance;
  const totalDuration = isTintModule
    ? tintServices.reduce((sum, s) => sum + (s.duration || 30), 0)
    : (appointment.duration_minutes || 60);

  // ============================================================================
  // SAVE
  // ============================================================================

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {
      vehicle_year: parseInt(vYear) || appointment.vehicle_year,
      vehicle_make: vMake || appointment.vehicle_make,
      vehicle_model: vModel || appointment.vehicle_model,
      class_keys: vehicle?.class_keys.join('|') || appointment.class_keys,
      subtotal,
      discount_amount: totalDiscount,
      balance_due: finalBalance,
      duration_minutes: totalDuration,
      status,
      notes: notes || null,
    };

    if (isTintModule) {
      updates.services_json = tintServices;
    } else {
      // Build services_json snapshot from generic items
      updates.services_json = genericItems.map(item => ({
        label: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        price: item.lineTotal,
        module: item.module,
        ...item.customFields,
      }));
    }

    if (rescheduling) {
      if (newDate && newDate !== appointment.appointment_date) {
        updates.appointment_date = newDate;
      }
      const isHeadsUp = newApptType === 'headsup_30' || newApptType === 'headsup_60';
      updates.appointment_time = isHeadsUp ? null : (newTime || null);
      updates.appointment_type = newApptType;
    }

    // Sync edits back to the document if one exists
    if (appointment.document_id && !isTintModule) {
      try {
        // Delete existing line items for this module and recreate
        const docRes = await fetch(`/api/documents/${appointment.document_id}`);
        const docData = await docRes.json();
        const existingItems = (docData?.document_line_items || []) as Array<{ id: string; module: string }>;
        const moduleItems = existingItems.filter(li => li.module === appointment.module);

        // Delete old module items
        for (const item of moduleItems) {
          await fetch(`/api/documents/${appointment.document_id}/line-items?itemId=${item.id}`, { method: 'DELETE' });
        }

        // Create new items
        if (genericItems.length > 0) {
          await fetch(`/api/documents/${appointment.document_id}/line-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(genericItems.map((item, idx) => ({
              module: item.module || appointment.module,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unitPrice,
              line_total: item.lineTotal,
              sort_order: idx,
              custom_fields: item.customFields,
            }))),
          });
        }
      } catch (err) {
        console.error('Document sync error:', err);
      }
    }

    // For tint module with document_id, sync services_json back to document too
    if (appointment.document_id && isTintModule) {
      try {
        const docRes = await fetch(`/api/documents/${appointment.document_id}`);
        const docData = await docRes.json();
        const existingItems = (docData?.document_line_items || []) as Array<{ id: string; module: string }>;
        const moduleItems = existingItems.filter(li => li.module === 'auto_tint');

        for (const item of moduleItems) {
          await fetch(`/api/documents/${appointment.document_id}/line-items?itemId=${item.id}`, { method: 'DELETE' });
        }

        if (tintServices.length > 0) {
          await fetch(`/api/documents/${appointment.document_id}/line-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tintServices.map((svc, idx) => ({
              module: 'auto_tint',
              description: svc.label || '',
              quantity: 1,
              unit_price: svc.price || 0,
              line_total: svc.price || 0,
              sort_order: idx,
              custom_fields: {
                serviceKey: svc.serviceKey,
                filmId: svc.filmId,
                filmName: svc.filmName,
                filmAbbrev: svc.filmAbbrev,
                shade: svc.shade,
                shadeFront: svc.shadeFront,
                shadeRear: svc.shadeRear,
                discountAmount: svc.discountAmount,
                duration: svc.duration,
                originalPrice: svc.originalPrice || null,
                priceNote: svc.priceNote || null,
              },
            }))),
          });
        }
      } catch (err) {
        console.error('Tint document sync error:', err);
      }
    }

    await onSave(appointment.id, updates);
    setSaving(false);
  }

  // ============================================================================
  // MODULE LABEL
  // ============================================================================

  const MODULE_LABELS: Record<string, string> = {
    auto_tint: 'Window Tint', flat_glass: 'Flat Glass', detailing: 'Detailing',
    ceramic_coating: 'Ceramic Coating', ppf: 'PPF', wraps: 'Vehicle Wraps',
    signage: 'Signage', apparel: 'Custom Apparel',
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Modal
      title={`Edit Appointment${!isTintModule ? ` -- ${MODULE_LABELS[appointment.module] || appointment.module}` : ''}`}
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
      {/* Vehicle Info */}
      <div style={{
        padding: SPACING.lg, marginBottom: SPACING.lg,
        background: 'rgba(255,255,255,0.03)', borderRadius: 10,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md }}>
          <SectionLabel style={{ marginBottom: 0 }}>Vehicle</SectionLabel>
          {isTintModule && (
            <button onClick={() => setEditingVehicle(!editingVehicle)} style={{
              background: editingVehicle ? COLORS.activeBg : 'transparent',
              color: editingVehicle ? COLORS.red : COLORS.textMuted,
              border: `1px solid ${editingVehicle ? COLORS.red : COLORS.borderInput}`,
              borderRadius: RADIUS.sm, padding: '3px 10px', cursor: 'pointer',
              fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
            }}>
              {editingVehicle ? 'Editing...' : 'Edit'}
            </button>
          )}
        </div>

        {editingVehicle && isTintModule ? (
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
            <InfoRow label="Vehicle" value={`${vYear} ${vMake} ${vModel}`.trim() || 'N/A'} />
            {isTintModule && <InfoRow label="Class" value={vehicle?.class_keys.join(', ') || appointment.class_keys || 'N/A'} />}
          </>
        )}

        {/* Customer info */}
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
                <TextInput type="date" value={newDate} onChange={e => { setNewDate(e.target.value); setNewTime(''); }} style={{ minHeight: 36, fontSize: FONT.sizeSm }} />
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

      {/* ================================================================ */}
      {/* SERVICES — module-specific rendering */}
      {/* ================================================================ */}

      <SectionLabel>Services{!isTintModule && ` -- ${MODULE_LABELS[appointment.module] || appointment.module}`}</SectionLabel>

      {isTintModule ? (
        /* ============================================================ */
        /* TINT MODULE: film/shade/pricing editor */
        /* ============================================================ */
        <>
          {tintServices.map((svc, i) => {
            const isSunStrip = svc.serviceKey === 'SUN_STRIP';
            const isRemoval = config?.services.find(s => s.service_key === svc.serviceKey)?.service_type === 'removal';
            const needsSplitShade = shouldSplit(svc.serviceKey);
            const filmShades = svc.filmId ? getShadesFor(svc.serviceKey, svc.filmId) : [];

            return (
              <div key={i} style={{ padding: SPACING.md, marginBottom: SPACING.sm, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <input
                        type="number"
                        value={svc.price}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            const updated = [...tintServices];
                            if (!updated[i].originalPrice) updated[i].originalPrice = updated[i].price;
                            updated[i].price = val;
                            setTintServices(updated);
                          }
                        }}
                        style={{
                          width: 80, padding: '2px 6px', textAlign: 'right',
                          background: COLORS.inputBg, borderRadius: RADIUS.sm,
                          border: `1px solid ${svc.originalPrice && svc.price !== svc.originalPrice ? COLORS.red : COLORS.borderInput}`,
                          color: svc.originalPrice && svc.price !== svc.originalPrice ? COLORS.red : COLORS.success,
                          fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, outline: 'none',
                        }}
                      />
                      {svc.originalPrice && svc.price !== svc.originalPrice && (
                        <span style={{ fontSize: '0.55rem', color: COLORS.textMuted, textDecoration: 'line-through' }}>${svc.originalPrice}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={svc.priceNote || ''}
                      onChange={e => {
                        const updated = [...tintServices];
                        updated[i].priceNote = e.target.value || null;
                        setTintServices(updated);
                      }}
                      placeholder="Note"
                      style={{
                        width: 90, padding: '2px 6px',
                        background: COLORS.inputBg, border: `1px solid ${COLORS.border}`,
                        borderRadius: RADIUS.sm, color: COLORS.textMuted,
                        fontSize: FONT.sizeXs, outline: 'none',
                        display: svc.originalPrice && svc.price !== svc.originalPrice ? 'block' : 'none',
                      }}
                    />
                    <button onClick={() => removeTintService(i)} style={{
                      background: COLORS.dangerBg, color: COLORS.danger,
                      border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
                      fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, cursor: 'pointer',
                    }}>
                      Remove
                    </button>
                  </div>
                </div>

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

                {!isSunStrip && !isRemoval && svc.filmId && filmShades.length > 0 && (
                  <div>
                    {needsSplitShade ? (
                      <>
                        <ShadeSelector label="Front Doors" shades={filmShades} selected={svc.shadeFront} onSelect={shade => changeServiceShadeFront(i, shade)} />
                        <ShadeSelector label="Rear" shades={filmShades} selected={svc.shadeRear} onSelect={shade => changeServiceShadeRear(i, shade)} />
                      </>
                    ) : (
                      <ShadeSelector label="Shade" shades={filmShades} selected={svc.shadeFront || svc.shade} onSelect={shade => changeServiceShadeSingle(i, shade)} />
                    )}
                  </div>
                )}

                {isSunStrip && <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>Black - 5% (fixed)</div>}
              </div>
            );
          })}

          {/* Add Tint Service */}
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
                      <optgroup label="Primary Services">{availableServiceDefs.filter(s => s.is_primary).map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>
                      <optgroup label="Secondary Services">{availableServiceDefs.filter(s => s.is_addon).map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>
                      <optgroup label="Removal">{availableServiceDefs.filter(s => s.service_type === 'removal').map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>
                      <optgroup label="Ala Carte">{availableServiceDefs.filter(s => s.service_type === 'alacarte').map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>
                    </>
                  )}
                </SelectInput>
              </FormField>

              {newServiceKey && !['SUN_STRIP'].includes(newServiceKey) && config?.services.find(s => s.service_key === newServiceKey)?.service_type !== 'removal' && (
                <FormField label="Film">
                  <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                    {availableFilms.map(film => (
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
                    ))}
                  </div>
                </FormField>
              )}

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

              {newServicePrice > 0 && (
                <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.success, marginBottom: SPACING.md }}>
                  ${newServicePrice.toFixed(2)}
                </div>
              )}

              <div style={{ display: 'flex', gap: SPACING.sm }}>
                <Button variant="secondary" size="sm" onClick={() => { setAddingService(false); setNewServiceKey(''); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null); }}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={confirmAddTintService}
                  disabled={!newServiceKey || (config?.services.find(s => s.service_key === newServiceKey)?.service_type === 'tint' && (!newFilmId || !newShadeFront))}>
                  Add Service
                </Button>
              </div>
            </div>
          )}

          {/* Add Custom Line Item */}
          <div style={{
            padding: SPACING.md, marginBottom: SPACING.md,
            border: `1px dashed ${COLORS.borderInput}`, borderRadius: 10,
          }}>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
              Custom Line Item
            </div>
            <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Description (e.g., Removal Glue, Extra Labor)"
                  id="custom-line-desc"
                  style={{
                    width: '100%', padding: '6px 10px', background: COLORS.inputBg,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                    color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none',
                  }}
                />
              </div>
              <div style={{ width: 80 }}>
                <input
                  type="number"
                  placeholder="$0"
                  id="custom-line-price"
                  style={{
                    width: '100%', padding: '6px 10px', background: COLORS.inputBg,
                    border: `1px solid ${COLORS.borderInput}`, borderRadius: RADIUS.sm,
                    color: COLORS.textPrimary, fontSize: FONT.sizeSm, outline: 'none', textAlign: 'right',
                  }}
                />
              </div>
              <button
                onClick={() => {
                  const descEl = document.getElementById('custom-line-desc') as HTMLInputElement;
                  const priceEl = document.getElementById('custom-line-price') as HTMLInputElement;
                  const desc = descEl?.value?.trim();
                  const price = parseFloat(priceEl?.value || '0');
                  if (!desc) return;
                  setTintServices(prev => [...prev, {
                    serviceKey: `CUSTOM_${Date.now()}`, label: desc, filmId: null,
                    filmName: null, filmAbbrev: null, shadeFront: null, shadeRear: null, shade: null,
                    price, originalPrice: 0, priceNote: 'Custom line item',
                    discountAmount: 0, duration: 0,
                  }]);
                  if (descEl) descEl.value = '';
                  if (priceEl) priceEl.value = '';
                }}
                style={{
                  padding: '6px 14px', background: COLORS.red, border: 'none',
                  borderRadius: RADIUS.sm, color: '#fff', fontSize: FONT.sizeXs,
                  fontWeight: FONT.weightBold, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                + Add
              </button>
            </div>
          </div>
        </>
      ) : (
        /* ============================================================ */
        /* GENERIC MODULE: description/qty/price editor */
        /* ============================================================ */
        <>
          {loadingDoc && (
            <div style={{ padding: SPACING.lg, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm }}>
              Loading services...
            </div>
          )}

          {!loadingDoc && genericItems.length === 0 && !addingGenericItem && (
            <div style={{ padding: SPACING.lg, textAlign: 'center', color: COLORS.textMuted, fontSize: FONT.sizeSm, border: `1px dashed ${COLORS.borderInput}`, borderRadius: 10, marginBottom: SPACING.md }}>
              No line items yet
            </div>
          )}

          {genericItems.map((item, i) => (
            <div key={i} style={{
              padding: SPACING.md, marginBottom: SPACING.sm,
              border: `1px solid ${COLORS.border}`, borderRadius: 10,
            }}>
              <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <TextInput
                    value={item.description}
                    onChange={e => updateGenericItem(i, 'description', e.target.value)}
                    placeholder="Description"
                    style={{ fontSize: FONT.sizeSm, marginBottom: SPACING.xs }}
                  />
                  <div style={{ display: 'flex', gap: SPACING.sm }}>
                    <div style={{ width: 60 }}>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: 2 }}>Qty</div>
                      <TextInput
                        type="number"
                        value={String(item.quantity)}
                        onChange={e => updateGenericItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        style={{ fontSize: FONT.sizeSm }}
                      />
                    </div>
                    <div style={{ width: 100 }}>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: 2 }}>Price</div>
                      <TextInput
                        type="number"
                        value={String(item.unitPrice)}
                        onChange={e => updateGenericItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                        style={{ fontSize: FONT.sizeSm }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                      <span style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightBold, color: COLORS.success }}>
                        ${item.lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={() => removeGenericItem(i)} style={{
                  background: COLORS.dangerBg, color: COLORS.danger,
                  border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, cursor: 'pointer', marginTop: 2,
                }}>
                  Remove
                </button>
              </div>
            </div>
          ))}

          {/* Add Generic Item */}
          {!addingGenericItem ? (
            <button onClick={() => setAddingGenericItem(true)} style={{
              width: '100%', padding: SPACING.md, marginBottom: SPACING.lg,
              background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
              borderRadius: 10, color: COLORS.red, cursor: 'pointer',
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            }}>
              + Add Line Item
            </button>
          ) : (
            <div style={{
              padding: SPACING.lg, marginBottom: SPACING.lg,
              border: `1px solid ${COLORS.red}40`, borderRadius: 10, background: `${COLORS.red}08`,
            }}>
              <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.sm }}>
                <TextInput value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Description" style={{ flex: 1, fontSize: FONT.sizeSm }} autoFocus />
                <TextInput type="number" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} placeholder="Qty" style={{ width: 60, fontSize: FONT.sizeSm }} />
                <TextInput type="number" value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="Price" style={{ width: 100, fontSize: FONT.sizeSm }}
                  onKeyDown={e => { if (e.key === 'Enter') addGenericItem(); }} />
              </div>
              <div style={{ display: 'flex', gap: SPACING.sm }}>
                <Button variant="secondary" size="sm" onClick={() => { setAddingGenericItem(false); setNewItemDesc(''); setNewItemPrice(''); setNewItemQty('1'); }}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={addGenericItem} disabled={!newItemDesc.trim()}>Add</Button>
              </div>
            </div>
          )}
        </>
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

      {/* Document link indicator */}
      {appointment.document_id && (
        <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.sm }}>
          Linked to document -- edits sync automatically
        </div>
      )}
    </Modal>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ShadeSelector({ label, shades, selected, onSelect }: {
  label: string; shades: { id: number; shade_value: string; shade_numeric: number | null; sort_order: number }[]; selected: string | null; onSelect: (shade: string) => void;
}) {
  return (
    <div style={{ marginBottom: SPACING.sm }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {shades.map(shade => (
          <button key={shade.id} onClick={() => onSelect(shade.shade_value)} style={{
            padding: '6px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
            background: selected === shade.shade_value ? COLORS.activeBg : COLORS.inputBg,
            color: selected === shade.shade_value ? COLORS.red : COLORS.textSecondary,
            border: `2px solid ${selected === shade.shade_value ? COLORS.red : COLORS.borderInput}`,
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            minWidth: 44, textAlign: 'center',
          }}>
            {shade.shade_value}
          </button>
        ))}
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
