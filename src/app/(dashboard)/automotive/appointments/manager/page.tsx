'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, Button, DashboardCard, FormField, TextInput, SelectInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type {
  BulkConfig, AutoVehicle, AutoFilm, AutoFilmShade,
  ServiceType, AppointmentType, GCValidation, SelectedService,
} from '@/app/components/booking/types';
import {
  TESLA_MODEL3_CONFIG,
  PRIMARY_SERVICES, ADDON_SERVICES, REMOVAL_SERVICES, ALACARTE_SERVICES,
  ADDITIONAL_INTERESTS,
} from '@/app/components/booking/types';
import {
  calculateServicePrice, calculateAlaCartePrice, calculateDiscount,
  lookupPrice, buildPriceSummary, getAllowedShades,
  needsSplitShades, isTeslaModel3, getAvailableFilms, isLucidAir,
} from '@/app/components/booking/pricing';

// ============================================================================
// Internal Appointment Manager
// Same booking flow as public page, dashboard dark theme, no deposit
// ============================================================================

export default function AppointmentManagerPage() {
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // GC
  const [gcCode, setGcCode] = useState('');
  const [gcValidation, setGcValidation] = useState<GCValidation | null>(null);
  const [gcError, setGcError] = useState('');
  const [gcLoading, setGcLoading] = useState(false);

  // Vehicle
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Service
  const [serviceType, setServiceType] = useState<ServiceType>('tint');
  const [primaryServiceKey, setPrimaryServiceKey] = useState<string | null>(null);
  const [selectedFilmId, setSelectedFilmId] = useState<number | null>(null);
  const [shadeFront, setShadeFront] = useState<string | null>(null);
  const [shadeRear, setShadeRear] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [addonConfigs, setAddonConfigs] = useState<Record<string, { filmId: number | null; shade: string | null }>>({});
  const [selectedRemovals, setSelectedRemovals] = useState<Set<string>>(new Set());

  // Schedule
  const [appointmentType, setAppointmentType] = useState<AppointmentType>('dropoff');
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointmentTime, setAppointmentTime] = useState('');

  // Customer
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Override
  const [priceOverride, setPriceOverride] = useState('');
  const [notes, setNotes] = useState('');

  // Load config
  useEffect(() => {
    fetch('/api/auto/config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  // Derived vehicle data
  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const allYears = new Set<number>();
    config.vehicles.forEach(v => {
      for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) allYears.add(y);
    });
    return Array.from(allYears).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !selectedYear) return [];
    const year = parseInt(selectedYear);
    const m = new Set<string>();
    config.vehicles.forEach(v => { if (year >= v.year_start && year <= v.year_end) m.add(v.make); });
    return Array.from(m).sort();
  }, [config, selectedYear]);

  const models = useMemo(() => {
    if (!config || !selectedYear || !selectedMake) return [];
    const year = parseInt(selectedYear);
    const m = new Set<string>();
    config.vehicles.forEach(v => {
      if (year >= v.year_start && year <= v.year_end && v.make === selectedMake) m.add(v.model);
    });
    return Array.from(m).sort();
  }, [config, selectedYear, selectedMake]);

  const vehicle = useMemo(() => {
    if (!config || !selectedYear || !selectedMake || !selectedModel) return null;
    const year = parseInt(selectedYear);
    return config.vehicles.find(v =>
      v.make === selectedMake && v.model === selectedModel && year >= v.year_start && year <= v.year_end
    ) || null;
  }, [config, selectedYear, selectedMake, selectedModel]);

  const availableFilms = useMemo(() => {
    if (!config || !vehicle) return config?.films || [];
    return getAvailableFilms(vehicle, config.films);
  }, [config, vehicle]);

  const requiresSplit = useMemo(() => {
    if (!config || !vehicle) return false;
    return needsSplitShades(vehicle, config.classRules);
  }, [config, vehicle]);

  // Build selected services
  const selectedServices = useMemo((): SelectedService[] => {
    if (!config || !vehicle) return [];
    const svcs: SelectedService[] = [];

    if (serviceType === 'tint' && primaryServiceKey && selectedFilmId) {
      const film = config.films.find(f => f.id === selectedFilmId);
      const price = calculateServicePrice(vehicle, primaryServiceKey, selectedFilmId, config.pricing, config.vehicleClasses);
      const discount = calculateDiscount(primaryServiceKey, price, film?.name || null, true, config.discounts, gcValidation);
      const { duration } = lookupPrice(vehicle, primaryServiceKey, selectedFilmId, config.pricing);
      const svc = config.services.find(s => s.service_key === primaryServiceKey);
      svcs.push({
        serviceKey: primaryServiceKey, label: svc?.label || primaryServiceKey,
        filmId: selectedFilmId, filmName: film?.name || null, filmAbbrev: film?.abbreviation || null,
        shadeFront, shadeRear: requiresSplit ? shadeRear : shadeFront,
        shade: requiresSplit ? `${shadeFront || ''}/${shadeRear || ''}` : shadeFront,
        price, discountAmount: discount, duration: duration || svc?.duration_minutes || 60,
      });

      for (const addonKey of selectedAddons) {
        const ac = addonConfigs[addonKey];
        if (!ac?.filmId) continue;
        const aFilm = config.films.find(f => f.id === ac.filmId);
        const aPrice = calculateServicePrice(vehicle, addonKey, ac.filmId, config.pricing, config.vehicleClasses);
        const aDiscount = calculateDiscount(addonKey, aPrice, aFilm?.name || null, true, config.discounts, gcValidation);
        const { duration: aDur } = lookupPrice(vehicle, addonKey, ac.filmId, config.pricing);
        const aSvc = config.services.find(s => s.service_key === addonKey);
        svcs.push({
          serviceKey: addonKey, label: aSvc?.label || addonKey,
          filmId: ac.filmId, filmName: aFilm?.name || null, filmAbbrev: aFilm?.abbreviation || null,
          shadeFront: ac.shade, shadeRear: null, shade: ac.shade,
          price: aPrice, discountAmount: aDiscount, duration: aDur || aSvc?.duration_minutes || 30,
        });
      }
    } else if (serviceType === 'removal') {
      for (const key of selectedRemovals) {
        const price = calculateServicePrice(vehicle, key, null, config.pricing, config.vehicleClasses);
        const svc = config.services.find(s => s.service_key === key);
        svcs.push({
          serviceKey: key, label: svc?.label || key,
          filmId: null, filmName: null, filmAbbrev: null,
          shadeFront: null, shadeRear: null, shade: null,
          price, discountAmount: 0, duration: svc?.duration_minutes || 30,
        });
      }
    }
    return svcs;
  }, [config, vehicle, serviceType, primaryServiceKey, selectedFilmId, shadeFront, shadeRear, requiresSplit, selectedAddons, addonConfigs, selectedRemovals, gcValidation]);

  const priceSummary = useMemo(() => {
    return buildPriceSummary(selectedServices, gcValidation, 0, false);
  }, [selectedServices, gcValidation]);

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.duration, 0);
  const finalPrice = priceOverride ? parseFloat(priceOverride) : priceSummary.subtotal - priceSummary.defaultDiscountTotal - priceSummary.promoDiscount - priceSummary.gcCredit;

  // GC Validation
  async function handleValidateGC() {
    if (!gcCode.trim()) return;
    setGcLoading(true); setGcError('');
    try {
      const res = await fetch('/api/auto/validate-gc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gcCode.trim() }),
      });
      const data = await res.json();
      if (data.valid) { setGcValidation(data); }
      else { setGcError(data.error || 'Invalid code'); setGcValidation(null); }
    } catch { setGcError('Validation failed'); }
    finally { setGcLoading(false); }
  }

  // Customer phone lookup
  async function handlePhoneLookup() {
    if (phone.replace(/\D/g, '').length < 10) return;
    try {
      // Quick lookup against existing customers via the config endpoint isn't ideal
      // For now just a placeholder — will wire to a dedicated customer search API
    } catch { /* silent */ }
  }

  // Submit
  async function handleSubmit() {
    if (!vehicle || selectedServices.length === 0 || !firstName || !phone || !appointmentDate) {
      setError('Please fill in all required fields.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/auto/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, phone, email,
          vehicleYear: selectedYear, vehicleMake: selectedMake, vehicleModel: selectedModel,
          classKeys: vehicle.class_keys.join('|'),
          serviceType, appointmentType,
          servicesJson: selectedServices,
          subtotal: priceSummary.subtotal,
          discountCode: gcValidation?.code || null,
          discountType: gcValidation?.discountType || null,
          discountPercent: gcValidation?.discountType === 'percent' ? gcValidation.amount : 0,
          discountAmount: priceSummary.promoDiscount + priceSummary.gcCredit + priceSummary.defaultDiscountTotal,
          depositPaid: 0,
          balanceDue: finalPrice,
          appointmentDate, appointmentTime: appointmentTime || null,
          durationMinutes: totalDuration,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.success) setSaved(true);
      else setError(data.error || 'Failed to create appointment');
    } catch { setError('Submission failed'); }
    finally { setSaving(false); }
  }

  // Get shades for a film + service combo
  function getShadesFor(serviceKey: string, filmId: number) {
    if (!config) return [];
    return getAllowedShades(serviceKey, filmId, config.filmShades, config.serviceShades, config.films);
  }

  // Toggle addon
  function toggleAddon(key: string) {
    const next = new Set(selectedAddons);
    const configs = { ...addonConfigs };
    if (next.has(key)) { next.delete(key); delete configs[key]; }
    else {
      next.add(key);
      if (key === 'SUN_STRIP' && config) {
        const black = config.films.find(f => f.name === 'Black');
        if (black) configs[key] = { filmId: black.id, shade: '5%' };
      } else { configs[key] = { filmId: null, shade: null }; }
    }
    setSelectedAddons(next); setAddonConfigs(configs);
  }

  if (!config) {
    return (
      <div>
        <PageHeader title="Appointment" titleAccent="Manager" subtitle="Automotive - Internal Booking" />
        <div style={{ color: COLORS.textMuted, padding: SPACING.xxxl, textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  if (saved) {
    return (
      <div>
        <PageHeader title="Appointment" titleAccent="Manager" subtitle="Automotive - Internal Booking" />
        <DashboardCard>
          <div style={{ textAlign: 'center', padding: SPACING.xxxl }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: SPACING.lg }}>
              <circle cx="24" cy="24" r="24" fill={COLORS.successBg}/>
              <path d="M15 24l6 6 12-12" stroke={COLORS.success} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ fontSize: FONT.sizeXl, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: 8 }}>
              Appointment Created
            </div>
            <div style={{ color: COLORS.textMuted, marginBottom: SPACING.xl }}>
              {selectedYear} {selectedMake} {selectedModel} — {firstName} {lastName}
            </div>
            <div style={{ display: 'flex', gap: SPACING.md, justifyContent: 'center' }}>
              <Button variant="primary" onClick={() => window.location.reload()}>Create Another</Button>
              <Button variant="secondary" onClick={() => window.location.href = '/automotive/appointments'}>View Appointments</Button>
            </div>
          </div>
        </DashboardCard>
      </div>
    );
  }

  const primaryServices = config.services.filter(s => s.is_primary && s.service_type === 'tint');
  const addonServices = config.services.filter(s => s.is_addon && s.service_type === 'tint');
  const removalServices = config.services.filter(s => s.service_type === 'removal');
  const dropoffSlots = config.dropoffSlots;
  const isHeadsUp = appointmentType === 'flex_wait';

  return (
    <div>
      <PageHeader
        title="Appointment"
        titleAccent="Manager"
        subtitle="Automotive - Internal Booking"
        actions={
          <Button variant="secondary" size="sm" onClick={() => window.location.href = '/automotive/appointments'}>
            Back to Appointments
          </Button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: SPACING.xl, alignItems: 'start' }}>
        {/* Left Column — Booking Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>

          {/* GC / Promo Code */}
          <DashboardCard title="Gift Certificate / Promo Code" icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.red} strokeWidth="1.5">
              <rect x="1" y="4" width="14" height="10" rx="2"/><path d="M8 4v10M1 8h14M5 4c0-2 1-3 3-3s3 1 3 3"/>
            </svg>
          }>
            <div style={{ display: 'flex', gap: SPACING.md }}>
              <TextInput
                value={gcCode} onChange={e => setGcCode(e.target.value)}
                placeholder="Enter code..." style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && handleValidateGC()}
              />
              <Button variant="secondary" size="sm" onClick={handleValidateGC} disabled={gcLoading}>
                {gcLoading ? 'Checking...' : 'Validate'}
              </Button>
            </div>
            {gcValidation && (
              <div style={{ marginTop: SPACING.md, color: COLORS.success, fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold }}>
                Validated: {gcValidation.discountType === 'dollar' ? `$${gcValidation.amount} credit` : `${gcValidation.amount}% off`}
              </div>
            )}
            {gcError && <div style={{ marginTop: SPACING.md, color: COLORS.danger, fontSize: FONT.sizeSm }}>{gcError}</div>}
          </DashboardCard>

          {/* Vehicle Selection */}
          <DashboardCard title="Vehicle" icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.red} strokeWidth="1.5">
              <path d="M2 10V8l2-4h8l2 4v2M2 10h12M2 10v2h2v-2M12 10v2h2v-2"/>
            </svg>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.md }}>
              <FormField label="Year">
                <SelectInput value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setSelectedMake(''); setSelectedModel(''); setPrimaryServiceKey(null); setSelectedFilmId(null); }}>
                  <option value="">Select...</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="Make">
                <SelectInput value={selectedMake} onChange={e => { setSelectedMake(e.target.value); setSelectedModel(''); setPrimaryServiceKey(null); setSelectedFilmId(null); }} disabled={!selectedYear}>
                  <option value="">Select...</option>
                  {makes.map(m => <option key={m} value={m}>{m}</option>)}
                </SelectInput>
              </FormField>
              <FormField label="Model">
                <SelectInput value={selectedModel} onChange={e => { setSelectedModel(e.target.value); setPrimaryServiceKey(null); setSelectedFilmId(null); }} disabled={!selectedMake}>
                  <option value="">Select...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </SelectInput>
              </FormField>
            </div>
            {vehicle && (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
                Class: {vehicle.class_keys.join(', ')}
                {vehicle.duration_override_minutes && ` | Duration override: ${vehicle.duration_override_minutes}m`}
              </div>
            )}
          </DashboardCard>

          {/* Service Selection */}
          {vehicle && (
            <DashboardCard title="Services" icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.red} strokeWidth="1.5">
                <path d="M2 2h12v12H2zM2 6h12M6 6v8"/>
              </svg>
            }>
              {/* Service Type */}
              <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.xl }}>
                {(['tint', 'removal'] as ServiceType[]).map(st => (
                  <button key={st} onClick={() => { setServiceType(st); setPrimaryServiceKey(null); setSelectedFilmId(null); setSelectedAddons(new Set()); setSelectedRemovals(new Set()); }}
                    style={{
                      padding: '8px 20px', borderRadius: RADIUS.lg, cursor: 'pointer',
                      background: serviceType === st ? COLORS.activeBg : 'transparent',
                      color: serviceType === st ? COLORS.red : COLORS.textTertiary,
                      border: `1px solid ${serviceType === st ? COLORS.red : COLORS.borderInput}`,
                      fontWeight: FONT.weightSemibold, fontSize: FONT.sizeSm,
                    }}>
                    {st === 'tint' ? 'Window Tint' : 'Removal'}
                  </button>
                ))}
              </div>

              {serviceType === 'tint' && (
                <>
                  {/* Primary Service */}
                  <FormField label="Primary Service">
                    <div style={{ display: 'flex', gap: SPACING.sm }}>
                      {primaryServices.map(svc => (
                        <button key={svc.service_key} onClick={() => { setPrimaryServiceKey(primaryServiceKey === svc.service_key ? null : svc.service_key); setSelectedFilmId(null); setShadeFront(null); setShadeRear(null); }}
                          style={{
                            flex: 1, padding: '12px 16px', borderRadius: RADIUS.lg, cursor: 'pointer',
                            background: primaryServiceKey === svc.service_key ? COLORS.activeBg : 'transparent',
                            color: primaryServiceKey === svc.service_key ? COLORS.red : COLORS.textSecondary,
                            border: `1px solid ${primaryServiceKey === svc.service_key ? COLORS.red : COLORS.borderInput}`,
                            fontWeight: FONT.weightSemibold, fontSize: FONT.sizeBase, textAlign: 'center',
                          }}>
                          {svc.label}
                        </button>
                      ))}
                    </div>
                  </FormField>

                  {/* Film Selection */}
                  {primaryServiceKey && (
                    <FormField label="Film">
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${availableFilms.length}, 1fr)`, gap: SPACING.sm }}>
                        {availableFilms.map(film => {
                          return (
                            <button key={film.id} onClick={() => { setSelectedFilmId(selectedFilmId === film.id ? null : film.id); setShadeFront(null); setShadeRear(null); }}
                              style={{
                                padding: '12px 8px', borderRadius: RADIUS.lg, cursor: 'pointer', textAlign: 'center',
                                background: selectedFilmId === film.id ? COLORS.activeBg : 'transparent',
                                color: selectedFilmId === film.id ? COLORS.textPrimary : COLORS.textTertiary,
                                border: `1px solid ${selectedFilmId === film.id ? COLORS.red : COLORS.borderInput}`,
                              }}>
                              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>{film.tier_label || `Tier ${film.tier}`}</div>
                              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, marginTop: 2 }}>{film.display_name || film.name}</div>
                              {film.ir_rejection && <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: 2 }}>IR: {film.ir_rejection}</div>}
                            </button>
                          );
                        })}
                      </div>
                    </FormField>
                  )}

                  {/* Shade Selection */}
                  {selectedFilmId && (
                    <>
                      {requiresSplit ? (
                        <>
                          <FormField label="Front Shade">
                            <ShadeRow shades={getShadesFor(primaryServiceKey!, selectedFilmId)} selected={shadeFront} onSelect={setShadeFront} />
                          </FormField>
                          <FormField label="Rear Shade">
                            <ShadeRow shades={getShadesFor(primaryServiceKey!, selectedFilmId)} selected={shadeRear} onSelect={setShadeRear} />
                          </FormField>
                        </>
                      ) : (
                        <FormField label="Shade">
                          <ShadeRow shades={getShadesFor(primaryServiceKey!, selectedFilmId)} selected={shadeFront} onSelect={setShadeFront} />
                        </FormField>
                      )}
                    </>
                  )}

                  {/* Add-ons */}
                  <FormField label="Add-On Services">
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${addonServices.length}, 1fr)`, gap: SPACING.sm }}>
                      {addonServices.map(svc => (
                        <button key={svc.service_key} onClick={() => toggleAddon(svc.service_key)}
                          style={{
                            padding: '10px 8px', borderRadius: RADIUS.lg, cursor: 'pointer', textAlign: 'center',
                            background: selectedAddons.has(svc.service_key) ? COLORS.activeBg : 'transparent',
                            color: selectedAddons.has(svc.service_key) ? COLORS.red : COLORS.textTertiary,
                            border: `1px solid ${selectedAddons.has(svc.service_key) ? COLORS.red : COLORS.borderInput}`,
                            fontSize: FONT.sizeSm, fontWeight: FONT.weightMedium,
                          }}>
                          {svc.label}
                        </button>
                      ))}
                    </div>
                  </FormField>

                  {/* Add-on film/shade config */}
                  {Array.from(selectedAddons).filter(k => k !== 'SUN_STRIP').map(addonKey => {
                    const ac = addonConfigs[addonKey] || { filmId: null, shade: null };
                    const svc = addonServices.find(s => s.service_key === addonKey);
                    return (
                      <div key={addonKey} style={{ padding: SPACING.md, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg, marginTop: SPACING.sm }}>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>{svc?.label}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${availableFilms.length}, 1fr)`, gap: SPACING.sm, marginBottom: SPACING.sm }}>
                          {availableFilms.map(film => (
                            <button key={film.id} onClick={() => setAddonConfigs(prev => ({ ...prev, [addonKey]: { filmId: ac.filmId === film.id ? null : film.id, shade: null } }))}
                              style={{
                                padding: '8px', borderRadius: RADIUS.md, cursor: 'pointer', textAlign: 'center',
                                background: ac.filmId === film.id ? COLORS.activeBg : 'transparent',
                                color: ac.filmId === film.id ? COLORS.textPrimary : COLORS.textMuted,
                                border: `1px solid ${ac.filmId === film.id ? COLORS.red : COLORS.borderInput}`,
                                fontSize: FONT.sizeXs,
                              }}>
                              {film.name}
                            </button>
                          ))}
                        </div>
                        {ac.filmId && (
                          <ShadeRow shades={getShadesFor(addonKey, ac.filmId)} selected={ac.shade}
                            onSelect={shade => setAddonConfigs(prev => ({ ...prev, [addonKey]: { ...prev[addonKey], shade } }))} />
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {serviceType === 'removal' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: SPACING.sm }}>
                  {removalServices.map(svc => {
                    const price = vehicle ? calculateServicePrice(vehicle, svc.service_key, null, config.pricing, config.vehicleClasses) : 0;
                    return (
                      <button key={svc.service_key} onClick={() => {
                        const next = new Set(selectedRemovals);
                        if (next.has(svc.service_key)) next.delete(svc.service_key); else next.add(svc.service_key);
                        setSelectedRemovals(next);
                      }} style={{
                        padding: '12px 8px', borderRadius: RADIUS.lg, cursor: 'pointer', textAlign: 'center',
                        background: selectedRemovals.has(svc.service_key) ? COLORS.activeBg : 'transparent',
                        color: selectedRemovals.has(svc.service_key) ? COLORS.red : COLORS.textTertiary,
                        border: `1px solid ${selectedRemovals.has(svc.service_key) ? COLORS.red : COLORS.borderInput}`,
                        fontSize: FONT.sizeSm,
                      }}>
                        <div>{svc.label}</div>
                        <div style={{ fontSize: FONT.sizeXs, marginTop: 4 }}>${price}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </DashboardCard>
          )}

          {/* Customer Info */}
          <DashboardCard title="Customer" icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.red} strokeWidth="1.5">
              <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5"/>
            </svg>
          }>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
              <FormField label="First Name" required>
                <TextInput value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First name" />
              </FormField>
              <FormField label="Last Name">
                <TextInput value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last name" />
              </FormField>
              <FormField label="Phone" required>
                <TextInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" onBlur={handlePhoneLookup} />
              </FormField>
              <FormField label="Email">
                <TextInput type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
              </FormField>
            </div>
          </DashboardCard>

          {/* Schedule */}
          <DashboardCard title="Schedule" icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={COLORS.red} strokeWidth="1.5">
              <rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6h12M5 1v4M11 1v4"/>
            </svg>
          }>
            <div style={{ display: 'flex', gap: SPACING.sm, marginBottom: SPACING.lg }}>
              {(['dropoff', 'waiting', 'flex_wait'] as AppointmentType[]).map(type => {
                const labels: Record<string, string> = { dropoff: 'Drop-Off', waiting: 'Waiting', flex_wait: 'Flex-Wait' };
                return (
                  <button key={type} onClick={() => { setAppointmentType(type); setAppointmentTime(''); }}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: RADIUS.lg, cursor: 'pointer', textAlign: 'center',
                      background: appointmentType === type ? COLORS.activeBg : 'transparent',
                      color: appointmentType === type ? COLORS.red : COLORS.textTertiary,
                      border: `1px solid ${appointmentType === type ? COLORS.red : COLORS.borderInput}`,
                      fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                    }}>
                    {labels[type]}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isHeadsUp ? '1fr' : '1fr 1fr', gap: SPACING.md }}>
              <FormField label="Date" required>
                <TextInput type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} />
              </FormField>
              {!isHeadsUp && (
                <FormField label="Time">
                  <SelectInput value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)}>
                    <option value="">Select time...</option>
                    {appointmentType === 'dropoff'
                      ? dropoffSlots.map(s => <option key={s.id} value={s.time_slot}>{s.label}</option>)
                      : config.waitingSlots.map(s => <option key={s.id} value={s.time_slot}>{s.label} ({s.day_of_week})</option>)
                    }
                    <option value="custom">Custom Time...</option>
                  </SelectInput>
                </FormField>
              )}
            </div>
            {isHeadsUp && (
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.success, marginTop: SPACING.sm }}>
                No fixed time. Customer will receive a text with available slots.
              </div>
            )}
          </DashboardCard>

          {/* Notes */}
          <DashboardCard title="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes..."
              style={{
                width: '100%', minHeight: 80, padding: SPACING.md, background: COLORS.inputBg,
                color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                borderRadius: RADIUS.md, fontSize: FONT.sizeBase, fontFamily: 'inherit', resize: 'vertical', outline: 'none',
              }} />
          </DashboardCard>
        </div>

        {/* Right Column — Price Summary (sticky) */}
        <div style={{ position: 'sticky', top: 24 }}>
          <DashboardCard title="Summary">
            {selectedServices.length === 0 ? (
              <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, textAlign: 'center', padding: SPACING.xl }}>
                Select a vehicle and services to see pricing.
              </div>
            ) : (
              <>
                {selectedServices.map((svc, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: FONT.sizeSm }}>
                    <div style={{ color: COLORS.textSecondary }}>
                      {svc.label}
                      {svc.filmAbbrev && <span style={{ color: COLORS.textMuted }}> - {svc.filmAbbrev}</span>}
                      {svc.shade && <span style={{ color: COLORS.textMuted }}> {svc.shade}</span>}
                    </div>
                    <div style={{ color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>${svc.price}</div>
                  </div>
                ))}

                {priceSummary.defaultDiscountTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: FONT.sizeSm, color: COLORS.success }}>
                    <span>Discount</span><span>-${priceSummary.defaultDiscountTotal}</span>
                  </div>
                )}
                {priceSummary.promoDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: FONT.sizeSm, color: COLORS.success }}>
                    <span>Promo ({gcValidation?.amount}%)</span><span>-${priceSummary.promoDiscount}</span>
                  </div>
                )}
                {priceSummary.gcCredit > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: FONT.sizeSm, color: COLORS.success }}>
                    <span>Gift Certificate</span><span>-${priceSummary.gcCredit}</span>
                  </div>
                )}

                <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACING.md, marginTop: SPACING.md }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>
                    <span>Total</span><span>${finalPrice}</span>
                  </div>
                  {totalDuration > 0 && (
                    <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
                      Est. {totalDuration} minutes
                    </div>
                  )}
                </div>

                <FormField label="Price Override" hint="Leave blank to use calculated price">
                  <TextInput type="number" value={priceOverride} onChange={e => setPriceOverride(e.target.value)} placeholder={`$${finalPrice}`} />
                </FormField>
              </>
            )}

            {error && <div style={{ color: COLORS.danger, fontSize: FONT.sizeSm, marginBottom: SPACING.md }}>{error}</div>}

            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={saving || selectedServices.length === 0 || !firstName || !phone || !appointmentDate}
              style={{ width: '100%', marginTop: SPACING.md }}>
              {saving ? 'Creating...' : 'Add to Schedule'}
            </Button>

            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.sm, textAlign: 'center' }}>
              No deposit charged for internal bookings.
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

// Shade row component for dark theme
function ShadeRow({ shades, selected, onSelect }: {
  shades: { id: number; shade_value: string; shade_label: string | null; shade_numeric: number | null }[];
  selected: string | null;
  onSelect: (shade: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
      {shades.map(shade => {
        const numeric = shade.shade_numeric || parseInt(shade.shade_value) || 50;
        const darkness = 1 - (numeric / 100);
        return (
          <button key={shade.id} onClick={() => onSelect(shade.shade_value)}
            style={{
              padding: '8px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
              background: selected === shade.shade_value ? COLORS.activeBg : COLORS.inputBg,
              color: selected === shade.shade_value ? COLORS.red : COLORS.textSecondary,
              border: `2px solid ${selected === shade.shade_value ? COLORS.red : COLORS.borderInput}`,
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
              minWidth: 50, textAlign: 'center',
            }}>
            {shade.shade_label || shade.shade_value}
          </button>
        );
      })}
    </div>
  );
}
