'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, SelectInput } from '@/app/components/dashboard';
import { COLORS, FONT, SPACING, RADIUS } from '@/app/components/dashboard/theme';
import type { BulkConfig, AutoVehicle } from '@/app/components/booking/types';
import {
  calculateServicePrice, getAllowedShades, needsSplitShades, getAvailableFilms, buildShadeDisplay,
} from '@/app/components/booking/pricing';

// ============================================================================
// SERVICE LINE EDITOR
// Structured service/film/shade editor for the counter checkout page
// Uses the same pricing utilities as the booking flow and EditAppointmentModal
// ============================================================================

export interface ServiceLine {
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
  module?: string;
  [key: string]: unknown;
}

interface Props {
  initialLines: ServiceLine[];
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  classKeys: string | null;
  module?: string;
  onSave: (lines: ServiceLine[], subtotal: number) => Promise<void>;
  onCancel: () => void;
}

export default function ServiceLineEditor({ initialLines, vehicleYear, vehicleMake, vehicleModel, classKeys, module = 'auto_tint', onSave, onCancel }: Props) {
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [services, setServices] = useState<ServiceLine[]>(initialLines);
  const [saving, setSaving] = useState(false);

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

  // Resolve vehicle
  const vehicle = useMemo((): AutoVehicle | null => {
    if (!config) return null;
    if (vehicleYear && vehicleMake && vehicleModel) {
      const found = config.vehicles.find(v =>
        v.make === vehicleMake && v.model === vehicleModel && vehicleYear >= v.year_start && vehicleYear <= v.year_end
      );
      if (found) return found;
    }
    if (classKeys) {
      return {
        id: 0, make: vehicleMake || '', model: vehicleModel || '',
        year_start: vehicleYear || 2020, year_end: vehicleYear || 2030,
        class_keys: classKeys.split('|'),
        window_count: null, door_count: null, has_front_quarters: false, has_rear_quarters: false,
        vehicle_category: null, duration_override_minutes: null, active: true,
      } as AutoVehicle;
    }
    return null;
  }, [config, vehicleYear, vehicleMake, vehicleModel, classKeys]);

  // Per-service split check (not global)
  function shouldSplit(serviceKey: string): boolean {
    if (!config || !vehicle) return false;
    return needsSplitShades(vehicle, config.classRules, serviceKey);
  }

  const availableFilms = useMemo(() => {
    if (!config || !vehicle) return config?.films || [];
    return getAvailableFilms(vehicle, config.films);
  }, [config, vehicle]);

  const subtotal = services.reduce((sum, s) => sum + (s.price || 0), 0);

  // Service editing functions
  function removeService(index: number) {
    setServices(prev => prev.filter((_, i) => i !== index));
  }

  function changeServiceType(index: number, newKey: string) {
    if (!config) return;
    const svcDef = config.services.find(s => s.service_key === newKey);
    if (!svcDef) return;
    const isRemoval = svcDef.service_type === 'removal';
    const isSunStrip = newKey === 'SUN_STRIP';

    setServices(prev => prev.map((s, i) => {
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
    const svc = services[index];
    const film = config.films.find(f => f.id === filmId);
    const price = vehicle ? calculateServicePrice(vehicle, svc.serviceKey, filmId, config.pricing, config.vehicleClasses) : 0;
    setServices(prev => prev.map((s, i) => i === index ? { ...s, filmId, filmName: film?.name || null, filmAbbrev: film?.abbreviation || null, shadeFront: null, shadeRear: null, shade: null, price } : s));
  }

  function changeShade(index: number, front: string | null, rear: string | null) {
    setServices(prev => prev.map((s, i) => {
      if (i !== index) return s;
      const sf = front ?? s.shadeFront;
      const sr = rear ?? s.shadeRear;
      const isSplit = shouldSplit(s.serviceKey);
      const shade = buildShadeDisplay(sf, sr, isSplit);
      return { ...s, shadeFront: sf, shadeRear: isSplit ? sr : null, shade };
    }));
  }

  function getShadesFor(serviceKey: string, filmId: number) {
    if (!config) return [];
    return getAllowedShades(serviceKey, filmId, config.filmShades, config.serviceShades, config.films);
  }

  // New service helpers
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

  const newServiceNeedsSplit = useMemo(() => {
    if (!newServiceKey) return false;
    return shouldSplit(newServiceKey);
  }, [config, vehicle, newServiceKey]);

  // Filter services to only show ones that have valid pricing for this vehicle
  const availableServiceDefs = useMemo(() => {
    if (!config) return [];
    const existingKeys = new Set(services.map(s => s.serviceKey));
    return config.services.filter(s => {
      if (!s.enabled || existingKeys.has(s.service_key)) return false;
      if (!vehicle) return true; // No vehicle yet, show all
      // Removal services: check if pricing exists with filmId null
      if (s.service_type === 'removal') {
        return calculateServicePrice(vehicle, s.service_key, null, config.pricing, config.vehicleClasses) > 0;
      }
      // Tint services: check if at least one film has a non-zero price
      return config.films.some(f => calculateServicePrice(vehicle, s.service_key, f.id, config.pricing, config.vehicleClasses) > 0);
    }).sort((a, b) => a.sort_order - b.sort_order);
  }, [config, services, vehicle]);

  function confirmAddService() {
    if (!config || !newServiceKey) return;
    const svcDef = config.services.find(s => s.service_key === newServiceKey);
    const film = newFilmId ? config.films.find(f => f.id === newFilmId) : null;
    const isSunStrip = newServiceKey === 'SUN_STRIP';
    const isRemoval = svcDef?.service_type === 'removal';
    const shadeDisplay = buildShadeDisplay(newShadeFront, newShadeRear, newServiceNeedsSplit);

    setServices(prev => [...prev, {
      module,
      serviceKey: newServiceKey, label: svcDef?.label || newServiceKey,
      filmId: isSunStrip ? (config.films.find(f => f.name === 'Black')?.id || null) : (isRemoval ? null : newFilmId),
      filmName: isSunStrip ? 'Black' : (isRemoval ? null : film?.name || null),
      filmAbbrev: isSunStrip ? 'BLK' : (isRemoval ? null : film?.abbreviation || null),
      shadeFront: isSunStrip ? '5%' : newShadeFront, shadeRear: isSunStrip ? null : (newServiceNeedsSplit ? newShadeRear : null),
      shade: isSunStrip ? '5%' : (isRemoval ? null : shadeDisplay), price: newServicePrice, discountAmount: 0,
      duration: svcDef?.duration_minutes || 30,
    }]);
    setAddingService(false);
    setNewServiceKey(''); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null);
  }

  async function handleSave() {
    setSaving(true);
    await onSave(services, subtotal);
    setSaving(false);
  }

  // Grouped service options for dropdowns
  function renderServiceOptions(excludeKey?: string) {
    if (!config) return null;
    const svcs = config.services.filter(s => {
      if (!s.enabled || s.service_key === excludeKey) return false;
      if (!vehicle) return true;
      if (s.service_type === 'removal') return calculateServicePrice(vehicle, s.service_key, null, config.pricing, config.vehicleClasses) > 0;
      return config.films.some(f => calculateServicePrice(vehicle, s.service_key, f.id, config.pricing, config.vehicleClasses) > 0);
    });
    const primary = svcs.filter(s => s.is_primary);
    const addon = svcs.filter(s => s.is_addon);
    const removal = svcs.filter(s => s.service_type === 'removal');
    const alacarte = svcs.filter(s => s.service_type === 'alacarte');
    return (
      <>
        {primary.length > 0 && <optgroup label="Primary Services">{primary.map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>}
        {addon.length > 0 && <optgroup label="Secondary Services">{addon.map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>}
        {removal.length > 0 && <optgroup label="Removal">{removal.map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>}
        {alacarte.length > 0 && <optgroup label="Ala Carte">{alacarte.map(s => <option key={s.service_key} value={s.service_key}>{s.label}</option>)}</optgroup>}
      </>
    );
  }

  if (!config) {
    return <div style={{ padding: SPACING.lg, color: COLORS.textMuted, fontSize: FONT.sizeSm }}>Loading services...</div>;
  }

  return (
    <div>
      {/* Existing service lines */}
      {services.map((svc, i) => {
        const isSunStrip = svc.serviceKey === 'SUN_STRIP';
        const isRemoval = config.services.find(s => s.service_key === svc.serviceKey)?.service_type === 'removal';
        const needsSplit = shouldSplit(svc.serviceKey);
        const filmShades = svc.filmId ? getShadesFor(svc.serviceKey, svc.filmId) : [];

        return (
          <div key={i} style={{ padding: SPACING.md, marginBottom: SPACING.sm, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md }}>
            {/* Service selector + price + remove */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: SPACING.sm }}>
              <SelectInput value={svc.serviceKey} onChange={e => changeServiceType(i, e.target.value)} style={{ minHeight: 32, fontSize: FONT.sizeXs, flex: 1 }}>
                <option value={svc.serviceKey}>{svc.label}</option>
                {renderServiceOptions(svc.serviceKey)}
              </SelectInput>
              <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.success, whiteSpace: 'nowrap' }}>${Number(svc.price || 0).toFixed(0)}</span>
              <button onClick={() => removeService(i)} style={{ background: COLORS.dangerBg, color: COLORS.danger, border: 'none', borderRadius: RADIUS.sm, padding: '3px 8px', fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Film selector */}
            {!isSunStrip && !isRemoval && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {availableFilms.map(film => (
                    <button key={film.id} onClick={() => changeServiceFilm(i, film.id)} style={{
                      padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
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

            {/* Shade selector */}
            {!isSunStrip && !isRemoval && svc.filmId && filmShades.length > 0 && (
              <div>
                {needsSplit ? (
                  <>
                    <ShadeRow label="Front" shades={filmShades} selected={svc.shadeFront} onSelect={s => changeShade(i, s, null)} />
                    <ShadeRow label="Rear" shades={filmShades} selected={svc.shadeRear} onSelect={s => changeShade(i, null, s)} />
                  </>
                ) : (
                  <ShadeRow label="Shade" shades={filmShades} selected={svc.shadeFront} onSelect={s => changeShade(i, s, null)} />
                )}
              </div>
            )}

            {/* Sun strip info */}
            {isSunStrip && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Black 5%</div>}
          </div>
        );
      })}

      {/* Add service */}
      {!addingService ? (
        <button onClick={() => setAddingService(true)} style={{
          width: '100%', padding: SPACING.sm, borderRadius: RADIUS.sm, border: `1px dashed ${COLORS.borderInput}`,
          background: 'transparent', color: COLORS.textMuted, fontSize: FONT.sizeXs, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: SPACING.md,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 1v10M1 6h10"/></svg>
          Add Service
        </button>
      ) : (
        <div style={{ padding: SPACING.md, marginBottom: SPACING.md, border: `1px solid ${COLORS.borderAccent}`, borderRadius: RADIUS.md, background: `${COLORS.red}05` }}>
          <SelectInput value={newServiceKey} onChange={e => { setNewServiceKey(e.target.value); setNewFilmId(null); setNewShadeFront(null); setNewShadeRear(null); }} style={{ marginBottom: 8, minHeight: 32, fontSize: FONT.sizeXs }}>
            <option value="">Select service...</option>
            {renderServiceOptions()}
          </SelectInput>

          {newServiceKey && (() => {
            const svcDef = config.services.find(s => s.service_key === newServiceKey);
            const isRemoval = svcDef?.service_type === 'removal';
            const isSunStrip = newServiceKey === 'SUN_STRIP';
            return (
              <>
                {!isSunStrip && !isRemoval && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {availableFilms.map(film => (
                        <button key={film.id} onClick={() => { setNewFilmId(film.id); setNewShadeFront(null); setNewShadeRear(null); }} style={{
                          padding: '4px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                          background: newFilmId === film.id ? COLORS.activeBg : 'transparent',
                          color: newFilmId === film.id ? COLORS.textPrimary : COLORS.textTertiary,
                          border: `1px solid ${newFilmId === film.id ? COLORS.red : COLORS.borderInput}`,
                          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                        }}>
                          {film.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!isSunStrip && !isRemoval && newFilmId && newServiceShades.length > 0 && (
                  newServiceNeedsSplit ? (
                    <>
                      <ShadeRow label="Front" shades={newServiceShades} selected={newShadeFront} onSelect={setNewShadeFront} />
                      <ShadeRow label="Rear" shades={newServiceShades} selected={newShadeRear} onSelect={setNewShadeRear} />
                    </>
                  ) : (
                    <ShadeRow label="Shade" shades={newServiceShades} selected={newShadeFront} onSelect={setNewShadeFront} />
                  )
                )}
                {newServicePrice > 0 && (
                  <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.success, marginTop: 4 }}>${newServicePrice.toFixed(0)}</div>
                )}
                <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.sm }}>
                  <Button variant="primary" size="sm" onClick={confirmAddService} disabled={!newServiceKey || (!isRemoval && !isSunStrip && !newFilmId)}>Add</Button>
                  <Button variant="secondary" size="sm" onClick={() => { setAddingService(false); setNewServiceKey(''); }}>Cancel</Button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Summary + save */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: SPACING.md, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
          Subtotal: <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>${subtotal.toFixed(0)}</span>
        </div>
        <div style={{ display: 'flex', gap: SPACING.sm }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  );
}

// Shade row with visual buttons
function ShadeRow({ label, shades, selected, onSelect }: {
  label: string; shades: { id: number; shade_value: string; shade_numeric: number | null; sort_order: number }[];
  selected: string | null; onSelect: (shade: string) => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {shades.map(shade => (
          <button key={shade.id} onClick={() => onSelect(shade.shade_value)} style={{
            padding: '3px 8px', borderRadius: RADIUS.sm, cursor: 'pointer',
            background: selected === shade.shade_value ? COLORS.activeBg : COLORS.inputBg,
            color: selected === shade.shade_value ? COLORS.red : COLORS.textSecondary,
            border: `1px solid ${selected === shade.shade_value ? COLORS.red : COLORS.borderInput}`,
            fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
          }}>
            {shade.shade_value}
          </button>
        ))}
      </div>
    </div>
  );
}
