'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardCard, Button, DataTable, Modal, FormField, TextInput } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';

interface Vehicle {
  id: number; make: string; model: string; year_start: number; year_end: number;
  class_keys: string[]; duration_override_minutes: number | null; active: boolean;
}

interface VehicleClass {
  id: number; class_key: string; name: string; description: string;
  is_add_fee: boolean; add_fee_amount: string; sort_order: number;
}

interface ServiceDef {
  service_key: string; label: string; duration_minutes: number;
  is_primary: boolean; is_addon: boolean; service_type: string; enabled: boolean;
}

interface DurationOverride {
  service_key: string; duration_minutes: number;
}

export default function VehiclesTab() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Reference data
  const [vehicleClasses, setVehicleClasses] = useState<VehicleClass[]>([]);
  const [services, setServices] = useState<ServiceDef[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formMake, setFormMake] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formYearStart, setFormYearStart] = useState('');
  const [formYearEnd, setFormYearEnd] = useState('');
  const [formClassKeys, setFormClassKeys] = useState<Set<string>>(new Set());
  const [formDurations, setFormDurations] = useState<Record<string, string>>({});
  const [formCustomClasses, setFormCustomClasses] = useState<Array<{
    class_key: string; label: string; description: string; image_url: string;
    category: 'primary' | 'secondary'; duration_minutes: string; enabled: boolean;
  }>>([]);
  // Pricing: key = "serviceKey|filmId", value = override price string
  const [formPricingOverrides, setFormPricingOverrides] = useState<Record<string, string>>({});
  const [defaultPricing, setDefaultPricing] = useState<Array<{ class_key: string; service_key: string; film_id: number | null; price: number }>>([]);
  const [films, setFilms] = useState<Array<{ id: number; name: string }>>([]);
  const [allServiceDefs, setAllServiceDefs] = useState<ServiceDef[]>([]);
  const [saving, setSaving] = useState(false);

  // Load reference data
  useEffect(() => {
    fetch('/api/auto/settings')
      .then(r => r.json())
      .then(d => {
        setVehicleClasses(d.vehicleClasses || []);
        setServices((d.services || []).filter((s: ServiceDef) => s.enabled));
      })
      .catch(() => {});
  }, []);

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto/settings/vehicles?search=${encodeURIComponent(search)}&page=${page}`);
      const data = await res.json();
      setVehicles(data.vehicles || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // Get tint services (the ones that would have durations on vehicles)
  const tintServices = services.filter(s => s.service_type === 'tint');

  function toggleClassKey(key: string) {
    setFormClassKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function openAdd() {
    setEditingVehicle(null);
    setFormMake(''); setFormModel('');
    setFormYearStart(String(new Date().getFullYear()));
    setFormYearEnd(String(new Date().getFullYear()));
    setFormClassKeys(new Set());
    setFormDurations({});
    setFormCustomClasses([]);
    setModalOpen(true);
  }

  async function openEdit(v: Vehicle) {
    setEditingVehicle(v);
    setFormMake(v.make); setFormModel(v.model);
    setFormYearStart(String(v.year_start)); setFormYearEnd(String(v.year_end));
    setFormClassKeys(new Set(v.class_keys));
    setFormDurations({});

    // Load existing duration overrides + custom classes
    try {
      const res = await fetch(`/api/auto/settings/vehicles?id=${v.id}`);
      const data = await res.json();
      if (data.durationOverrides) {
        const durations: Record<string, string> = {};
        (data.durationOverrides as DurationOverride[]).forEach(o => {
          durations[o.service_key] = String(o.duration_minutes);
        });
        setFormDurations(durations);
      }
      if (data.customClasses) {
        setFormCustomClasses(
          (data.customClasses as Array<Record<string, unknown>>).map(cc => ({
            class_key: String(cc.class_key || ''),
            label: String(cc.label || ''),
            description: String(cc.description || ''),
            image_url: String(cc.image_url || ''),
            category: (cc.category as 'primary' | 'secondary') || 'primary',
            duration_minutes: String(cc.duration_minutes || '60'),
            enabled: cc.enabled !== false,
          }))
        );
      } else {
        setFormCustomClasses([]);
      }

      // Load pricing
      setDefaultPricing(data.defaultPricing || []);
      setFilms(data.films || []);
      setAllServiceDefs(data.services || []);

      if (data.pricingOverrides) {
        const overrides: Record<string, string> = {};
        (data.pricingOverrides as Array<{ service_key: string; film_id: number | null; price: number }>).forEach(po => {
          overrides[`${po.service_key}|${po.film_id || 'null'}`] = String(po.price);
        });
        setFormPricingOverrides(overrides);
      } else {
        setFormPricingOverrides({});
      }
    } catch { /* silent */ }

    setModalOpen(true);
  }

  async function handleSave() {
    if (!formMake || !formModel || !formYearStart || !formYearEnd) return;
    setSaving(true);

    const body = {
      id: editingVehicle?.id,
      make: formMake.trim(),
      model: formModel.trim(),
      year_start: parseInt(formYearStart),
      year_end: parseInt(formYearEnd),
      class_keys: Array.from(formClassKeys),
      durationOverrides: Object.fromEntries(
        Object.entries(formDurations).filter(([, v]) => v !== '' && v !== undefined)
      ),
      customClasses: formCustomClasses.filter(cc => cc.class_key && cc.label).map(cc => ({
        class_key: cc.class_key,
        label: cc.label,
        description: cc.description || null,
        image_url: cc.image_url || null,
        category: cc.category,
        duration_minutes: parseInt(cc.duration_minutes) || 60,
        enabled: cc.enabled,
      })),
      pricingOverrides: Object.entries(formPricingOverrides)
        .filter(([, price]) => price !== '' && price !== undefined)
        .map(([key, price]) => {
          const [serviceKey, filmIdStr] = key.split('|');
          return {
            service_key: serviceKey,
            film_id: filmIdStr === 'null' ? null : parseInt(filmIdStr),
            price: parseFloat(price),
          };
        }),
    };

    try {
      await fetch('/api/auto/settings/vehicles', {
        method: editingVehicle ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setModalOpen(false);
      fetchVehicles();
    } catch { /* silent */ }
    finally { setSaving(false); }
  }

  // Separate class keys into base classes and add-fee modifiers
  const baseClasses = vehicleClasses.filter(vc => !vc.is_add_fee);
  const addFeeClasses = vehicleClasses.filter(vc => vc.is_add_fee);

  const columns = [
    {
      key: 'make', label: 'Make', width: 120,
      render: (v: Vehicle) => <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>{v.make}</span>,
    },
    {
      key: 'model', label: 'Model',
      render: (v: Vehicle) => <span style={{ color: COLORS.textPrimary }}>{v.model}</span>,
    },
    {
      key: 'years', label: 'Years', width: 100,
      render: (v: Vehicle) => <span style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm }}>{v.year_start}-{v.year_end}</span>,
    },
    {
      key: 'class_keys', label: 'Class Keys',
      render: (v: Vehicle) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {v.class_keys.map(ck => {
            const vc = vehicleClasses.find(c => c.class_key === ck);
            return (
              <span key={ck} style={{
                fontSize: FONT.sizeXs, padding: '1px 6px', borderRadius: 3,
                background: vc?.is_add_fee ? '#f59e0b18' : 'rgba(255,255,255,0.06)',
                color: vc?.is_add_fee ? '#f59e0b' : COLORS.textSecondary,
              }}>
                {vc?.name || ck}
              </span>
            );
          })}
        </div>
      ),
    },
    {
      key: 'actions', label: '', width: 60, align: 'right' as const,
      render: (v: Vehicle) => (
        <button onClick={e => { e.stopPropagation(); openEdit(v); }} style={{
          background: 'rgba(255,255,255,0.06)', color: COLORS.textMuted,
          border: 'none', borderRadius: RADIUS.sm, padding: '4px 10px',
          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
        }}>
          Edit
        </button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>
      {/* Search + Add */}
      <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'center' }}>
        <TextInput value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search make or model..." style={{ flex: 1, maxWidth: 350, minHeight: 40 }} />
        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>{total.toLocaleString()} vehicles</span>
        <Button variant="primary" size="sm" onClick={openAdd}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 1v12M1 7h12"/></svg>
          Add Vehicle
        </Button>
      </div>

      {/* Table */}
      <DashboardCard noPadding>
        {loading ? (
          <div style={{ padding: SPACING.xxxl, textAlign: 'center', color: COLORS.textMuted }}>Loading...</div>
        ) : (
          <DataTable columns={columns} data={vehicles} rowKey={v => v.id} onRowClick={openEdit}
            emptyMessage="No vehicles found." compact />
        )}
      </DashboardCard>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: SPACING.sm }}>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</Button>
          <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, display: 'flex', alignItems: 'center' }}>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <Modal title={editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'} onClose={() => setModalOpen(false)} width={560}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !formMake || !formModel || formClassKeys.size === 0}>
                {saving ? 'Saving...' : editingVehicle ? 'Save Changes' : 'Add Vehicle'}
              </Button>
            </>
          }
        >
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md }}>
            <FormField label="Make" required>
              <TextInput value={formMake} onChange={e => setFormMake(e.target.value)} placeholder="e.g., Ford" />
            </FormField>
            <FormField label="Model" required>
              <TextInput value={formModel} onChange={e => setFormModel(e.target.value)} placeholder="e.g., Bronco" />
            </FormField>
            <FormField label="Year Start" required>
              <TextInput type="number" value={formYearStart} onChange={e => setFormYearStart(e.target.value)} />
            </FormField>
            <FormField label="Year End" required>
              <TextInput type="number" value={formYearEnd} onChange={e => setFormYearEnd(e.target.value)} />
            </FormField>
          </div>

          {/* Class Keys — selectable buttons */}
          <SectionDivider label="Vehicle Class" />

          <div style={{ marginBottom: SPACING.md }}>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', fontWeight: FONT.weightSemibold }}>
              Base Class
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {baseClasses.map(vc => {
                const selected = formClassKeys.has(vc.class_key);
                return (
                  <button key={vc.class_key} onClick={() => toggleClassKey(vc.class_key)} style={{
                    padding: '6px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                    background: selected ? COLORS.activeBg : COLORS.inputBg,
                    color: selected ? COLORS.red : COLORS.textMuted,
                    border: `1px solid ${selected ? COLORS.red : COLORS.borderInput}`,
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  }}>
                    <div>{vc.name}</div>
                    <div style={{ fontSize: '0.55rem', color: COLORS.textMuted, marginTop: 1 }}>{vc.class_key}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: SPACING.md }}>
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm, textTransform: 'uppercase', fontWeight: FONT.weightSemibold }}>
              Add-Fee Modifiers
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {addFeeClasses.map(vc => {
                const selected = formClassKeys.has(vc.class_key);
                return (
                  <button key={vc.class_key} onClick={() => toggleClassKey(vc.class_key)} style={{
                    padding: '6px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
                    background: selected ? '#f59e0b18' : COLORS.inputBg,
                    color: selected ? '#f59e0b' : COLORS.textMuted,
                    border: `1px solid ${selected ? '#f59e0b' : COLORS.borderInput}`,
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  }}>
                    <div>{vc.name}</div>
                    <div style={{ fontSize: '0.55rem', color: COLORS.textMuted, marginTop: 1 }}>+${vc.add_fee_amount}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected class keys display */}
          {formClassKeys.size > 0 && (
            <div style={{
              padding: SPACING.sm, background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.border}`, marginBottom: SPACING.lg,
              fontSize: FONT.sizeSm, color: COLORS.textSecondary, fontFamily: 'monospace',
            }}>
              {Array.from(formClassKeys).join(', ')}
            </div>
          )}

          {/* Per-Service Duration Overrides — only when class keys selected */}
          {formClassKeys.size > 0 && (
          <>
          <SectionDivider label="Service Duration Overrides" />
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
            Leave blank to use the global default duration for each service.
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {tintServices.map(svc => (
              <div key={svc.service_key} style={{
                display: 'flex', alignItems: 'center', gap: SPACING.md,
                padding: `${SPACING.xs}px 0`,
              }}>
                <span style={{
                  flex: 1, fontSize: FONT.sizeSm, color: COLORS.textSecondary,
                }}>
                  {svc.label}
                </span>
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, minWidth: 60, textAlign: 'right' }}>
                  Default: {svc.duration_minutes}m
                </span>
                <input
                  type="number"
                  value={formDurations[svc.service_key] || ''}
                  onChange={e => setFormDurations(prev => ({ ...prev, [svc.service_key]: e.target.value }))}
                  placeholder={String(svc.duration_minutes)}
                  style={{
                    width: 70, background: COLORS.inputBg, color: COLORS.textPrimary,
                    border: `1px solid ${formDurations[svc.service_key] ? COLORS.red : COLORS.borderInput}`,
                    borderRadius: RADIUS.sm, padding: '4px 8px',
                    fontSize: FONT.sizeSm, textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>min</span>
              </div>
            ))}
          </div>
          </>
          )}

          {/* Per-Vehicle Pricing Overrides — only shows when class keys are selected */}
          {editingVehicle && formClassKeys.size > 0 && defaultPricing.length > 0 && (
            <>
              <SectionDivider label="Pricing Overrides" />
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
                Only showing services with pricing for the selected class keys. Override any price for this specific vehicle.
              </div>

              {(() => {
                // ONLY use the selected base class keys (not custom class keys — those have pricing in their own cards)
                const customKeys = new Set(formCustomClasses.map(cc => cc.class_key));
                // Filter out any custom class keys that might be in formClassKeys
                const selectedBaseKeys = Array.from(formClassKeys).filter(k => !customKeys.has(k));

                // Helper: find price using ONLY selected base class keys (no wildcards for primary)
                function getBaseClassPrice(serviceKey: string, filmId: number | null): number | null {
                  for (const ck of selectedBaseKeys) {
                    const match = defaultPricing.find(p =>
                      p.class_key === ck && p.service_key === serviceKey &&
                      (filmId === null ? p.film_id === null : p.film_id === filmId)
                    );
                    if (match) return match.price;
                  }
                  return null;
                }

                // Helper: find price from wildcard only (for addon/secondary services)
                function getWildcardPrice(serviceKey: string, filmId: number | null): number | null {
                  const match = defaultPricing.find(p =>
                    p.class_key === '*' && p.service_key === serviceKey &&
                    (filmId === null ? p.film_id === null : p.film_id === filmId)
                  );
                  return match ? match.price : null;
                }

                // Primary services: only show if selected base class keys have explicit pricing
                const primarySvcs = allServiceDefs.filter(s => s.is_primary && s.service_type === 'tint');
                const addonSvcs = allServiceDefs.filter(s => s.is_addon && s.service_type === 'tint');
                const removalSvcs = allServiceDefs.filter(s => s.service_type === 'removal');

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>
                    {/* Primary services — only if selected base class keys have pricing */}
                    {primarySvcs.map(svc => {
                      const hasClassPricing = films.some(f => getBaseClassPrice(svc.service_key, f.id) !== null);
                      if (!hasClassPricing) return null;

                      return (
                        <PricingServiceRow key={svc.service_key} label={svc.label} badge="Primary"
                          films={films} getPrice={(filmId) => getBaseClassPrice(svc.service_key, filmId)}
                          overrides={formPricingOverrides} serviceKey={svc.service_key}
                          onOverrideChange={setFormPricingOverrides} />
                      );
                    })}

                    {/* Addon/secondary services — use wildcard pricing */}
                    {addonSvcs.map(svc => {
                      const hasWildcard = films.some(f => getWildcardPrice(svc.service_key, f.id) !== null);
                      if (!hasWildcard) return null;

                      return (
                        <PricingServiceRow key={svc.service_key} label={svc.label} badge="Add-On"
                          films={films} getPrice={(filmId) => getWildcardPrice(svc.service_key, filmId)}
                          overrides={formPricingOverrides} serviceKey={svc.service_key}
                          onOverrideChange={setFormPricingOverrides} />
                      );
                    })}

                    {/* Removal services */}
                    {removalSvcs.map(svc => {
                      const price = getWildcardPrice(svc.service_key, null) ?? getBaseClassPrice(svc.service_key, null);
                      if (price === null && !formPricingOverrides[`${svc.service_key}|null`]) return null;

                      const key = `${svc.service_key}|null`;
                      const override = formPricingOverrides[key];
                      const hasOverride = override !== undefined && override !== '';

                      return (
                        <div key={svc.service_key} style={{
                          display: 'flex', alignItems: 'center', gap: SPACING.md, padding: `${SPACING.xs}px 0`,
                        }}>
                          <span style={{ flex: 1, fontSize: FONT.sizeSm, color: COLORS.textSecondary }}>{svc.label}</span>
                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, minWidth: 60, textAlign: 'right' }}>
                            {price !== null ? `$${price}` : '—'}
                          </span>
                          <input type="number" value={override || ''}
                            onChange={e => setFormPricingOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                            placeholder={price !== null ? String(price) : '—'}
                            style={{
                              width: 80, background: COLORS.inputBg, color: COLORS.textPrimary,
                              border: `1px solid ${hasOverride ? COLORS.red : COLORS.borderInput}`,
                              borderRadius: RADIUS.sm, padding: '4px 8px', fontSize: FONT.sizeSm, textAlign: 'center',
                            }} />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}

          {/* Custom Classes */}
          <SectionDivider label="Custom Service Classes" />
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.md }}>
            Custom classes replace standard primary or secondary services for this vehicle.
            Use these for vehicles with unique options (e.g., Tesla half/full back window, oversized panoramic roof).
          </div>

          {formCustomClasses.map((cc, i) => (
            <div key={i} style={{
              padding: SPACING.md, marginBottom: SPACING.sm,
              border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg,
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                  Custom Class {i + 1}
                </span>
                <button onClick={() => setFormCustomClasses(prev => prev.filter((_, idx) => idx !== i))} style={{
                  background: COLORS.dangerBg, color: COLORS.danger,
                  border: 'none', borderRadius: RADIUS.sm, padding: '3px 8px',
                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                }}>
                  Remove
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm }}>
                <FormField label="Key">
                  <TextInput value={cc.class_key} placeholder="e.g., TM3_HALF"
                    onChange={e => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, class_key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') } : c))}
                    style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} />
                </FormField>
                <FormField label="Category">
                  <div style={{ display: 'flex', gap: SPACING.sm }}>
                    {(['primary', 'secondary'] as const).map(cat => (
                      <button key={cat} onClick={() => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, category: cat } : c))}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: RADIUS.md, cursor: 'pointer',
                          background: cc.category === cat ? COLORS.activeBg : COLORS.inputBg,
                          color: cc.category === cat ? COLORS.red : COLORS.textMuted,
                          border: `1px solid ${cc.category === cat ? COLORS.red : COLORS.borderInput}`,
                          fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textTransform: 'capitalize',
                        }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </FormField>
              </div>

              <FormField label="Label (customer-facing)">
                <TextInput value={cc.label} placeholder="e.g., Full Sides & Rear with Half Back Window"
                  onChange={e => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, label: e.target.value } : c))} />
              </FormField>

              <FormField label="Description">
                <TextInput value={cc.description} placeholder="Optional description shown to customer"
                  onChange={e => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, description: e.target.value } : c))} />
              </FormField>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.sm }}>
                <FormField label="Duration (minutes)">
                  <TextInput type="number" value={cc.duration_minutes}
                    onChange={e => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, duration_minutes: e.target.value } : c))} />
                </FormField>
                <FormField label="Image URL">
                  <TextInput value={cc.image_url} placeholder="Optional"
                    onChange={e => setFormCustomClasses(prev => prev.map((c, idx) => idx === i ? { ...c, image_url: e.target.value } : c))} />
                </FormField>
              </div>

              {/* Per-film pricing for this custom class */}
              {cc.class_key && films.length > 0 && (
                <div style={{ marginTop: SPACING.md, paddingTop: SPACING.md, borderTop: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                    Pricing Per Film
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${films.length}, 1fr)`, gap: SPACING.sm }}>
                    {films.map(film => {
                      const pricingKey = `${cc.class_key}|FULL_SIDES|${film.id}`;
                      // Check auto_pricing for existing price
                      const existingRow = defaultPricing.find(p =>
                        p.class_key === cc.class_key && p.service_key === 'FULL_SIDES' && p.film_id === film.id
                      );
                      const overrideKey = `${cc.class_key}|${film.id}`;
                      const currentOverride = formPricingOverrides[overrideKey];
                      const displayDefault = existingRow ? `$${existingRow.price}` : '—';

                      return (
                        <div key={film.id} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>
                            {film.name}
                          </div>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>
                            {displayDefault}
                          </div>
                          <input
                            type="number"
                            value={currentOverride || ''}
                            onChange={e => setFormPricingOverrides(prev => ({ ...prev, [overrideKey]: e.target.value }))}
                            placeholder={existingRow ? String(existingRow.price) : '0'}
                            style={{
                              width: '100%', background: COLORS.inputBg, color: COLORS.textPrimary,
                              border: `1px solid ${currentOverride ? COLORS.red : COLORS.borderInput}`,
                              borderRadius: RADIUS.sm, padding: '4px 6px',
                              fontSize: FONT.sizeSm, textAlign: 'center',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          <button onClick={() => setFormCustomClasses(prev => [...prev, {
            class_key: '', label: '', description: '', image_url: '',
            category: 'primary', duration_minutes: '60', enabled: true,
          }])} style={{
            width: '100%', padding: SPACING.md,
            background: 'transparent', border: `1px dashed ${COLORS.borderInput}`,
            borderRadius: RADIUS.lg, color: COLORS.red, cursor: 'pointer',
            fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
          }}>
            + Add Custom Class
          </button>
        </Modal>
      )}
    </div>
  );
}

function PricingServiceRow({ label, badge, films, getPrice, overrides, serviceKey, onOverrideChange }: {
  label: string;
  badge: string;
  films: Array<{ id: number; name: string }>;
  getPrice: (filmId: number) => number | null;
  overrides: Record<string, string>;
  serviceKey: string;
  onOverrideChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  return (
    <div style={{ padding: SPACING.md, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm }}>
        <span style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
          {label}
        </span>
        <span style={{
          fontSize: FONT.sizeXs, fontWeight: FONT.weightBold, color: COLORS.textMuted,
          background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 3,
          textTransform: 'uppercase',
        }}>
          {badge}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${films.length}, 1fr)`, gap: SPACING.sm }}>
        {films.map(film => {
          const key = `${serviceKey}|${film.id}`;
          const defaultPrice = getPrice(film.id);
          const override = overrides[key];
          const hasOverride = override !== undefined && override !== '';

          return (
            <div key={film.id} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>{film.name}</div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>
                {defaultPrice !== null ? `$${defaultPrice}` : '—'}
              </div>
              <input type="number" value={override || ''}
                onChange={e => onOverrideChange(prev => ({ ...prev, [key]: e.target.value }))}
                placeholder={defaultPrice !== null ? String(defaultPrice) : '—'}
                style={{
                  width: '100%', background: COLORS.inputBg, color: COLORS.textPrimary,
                  border: `1px solid ${hasOverride ? COLORS.red : COLORS.borderInput}`,
                  borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeSm, textAlign: 'center',
                }} />
            </div>
          );
        })}
      </div>
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
