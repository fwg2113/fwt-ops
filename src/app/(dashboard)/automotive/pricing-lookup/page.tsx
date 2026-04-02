'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageHeader, DashboardCard, Button, Modal, SelectInput, TextInput, FormField, MiniTimeline } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import type { BulkConfig, AutoVehicle, AutoVehiclePricingOverride, AutoFilmShade } from '@/app/components/booking/types';
import { calculateServicePrice, getAvailableFilms, getAddFee, getAllowedShades, needsSplitShades } from '@/app/components/booking/pricing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectedRow {
  serviceKey: string;
  label: string;
  filmId: number;
  filmName: string;
  price: number;
  shadeFront: string | null;
  shadeRear: string | null;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PricingLookupPage() {
  // --- Data loading ---
  const [config, setConfig] = useState<BulkConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auto/config')
      .then(r => r.json())
      .then(d => { setConfig(d as BulkConfig); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // --- YMM state ---
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMake, setSelectedMake] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // --- Selected services for action buttons ---
  const [selectedRows, setSelectedRows] = useState<SelectedRow[]>([]);

  // --- Modals ---
  const [showBookModal, setShowBookModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  // --- YMM cascade ---
  const years = useMemo(() => {
    if (!config) return [];
    const currentYear = new Date().getFullYear() + 1;
    const all = new Set<number>();
    config.vehicles.forEach(v => {
      for (let y = v.year_start; y <= Math.min(v.year_end, currentYear); y++) all.add(y);
    });
    return Array.from(all).sort((a, b) => b - a);
  }, [config]);

  const makes = useMemo(() => {
    if (!config || !selectedYear) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => {
      if (year >= v.year_start && year <= v.year_end) set.add(v.make);
    });
    return Array.from(set).sort();
  }, [config, selectedYear]);

  const models = useMemo(() => {
    if (!config || !selectedYear || !selectedMake) return [];
    const year = parseInt(selectedYear);
    const set = new Set<string>();
    config.vehicles.forEach(v => {
      if (year >= v.year_start && year <= v.year_end && v.make === selectedMake) set.add(v.model);
    });
    return Array.from(set).sort();
  }, [config, selectedYear, selectedMake]);

  const vehicle = useMemo<AutoVehicle | null>(() => {
    if (!config || !selectedYear || !selectedMake || !selectedModel) return null;
    const year = parseInt(selectedYear);
    return config.vehicles.find(v =>
      v.make === selectedMake && v.model === selectedModel &&
      year >= v.year_start && year <= v.year_end
    ) || null;
  }, [config, selectedYear, selectedMake, selectedModel]);

  // --- Available films (respects vehicle restrictions like Lucid Air) ---
  const films = useMemo(() => {
    if (!config) return [];
    if (!vehicle) return config.films;
    return getAvailableFilms(vehicle, config.films);
  }, [config, vehicle]);

  // --- Services for the matrix (tint services only, enabled) ---
  const tintServices = useMemo(() => {
    if (!config) return [];
    return config.services
      .filter(s => s.enabled && s.service_type === 'tint')
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  const removalServices = useMemo(() => {
    if (!config) return [];
    return config.services
      .filter(s => s.enabled && s.service_type === 'removal')
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [config]);

  // --- Pricing matrix computation ---
  const priceMatrix = useMemo(() => {
    if (!config || !vehicle) return null;
    const matrix: Record<string, Record<number, number>> = {};

    for (const svc of tintServices) {
      matrix[svc.service_key] = {};
      for (const film of films) {
        const price = calculateServicePrice(
          vehicle, svc.service_key, film.id,
          config.pricing, config.vehicleClasses,
          config.vehiclePricingOverrides as AutoVehiclePricingOverride[]
        );
        matrix[svc.service_key][film.id] = price;
      }
    }

    // Removals (no film)
    for (const svc of removalServices) {
      matrix[svc.service_key] = {};
      const price = calculateServicePrice(
        vehicle, svc.service_key, null,
        config.pricing, config.vehicleClasses,
        config.vehiclePricingOverrides as AutoVehiclePricingOverride[]
      );
      matrix[svc.service_key][0] = price; // 0 = no film
    }

    return matrix;
  }, [config, vehicle, tintServices, removalServices, films]);

  // --- ADD_FEE display ---
  const addFee = useMemo(() => {
    if (!config || !vehicle) return 0;
    return getAddFee(vehicle, config.vehicleClasses);
  }, [config, vehicle]);

  // --- Selection toggling ---
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

  // --- Reset on vehicle change ---
  useEffect(() => { setSelectedRows([]); }, [vehicle]);

  // --- Handlers ---
  const handleYearChange = (val: string) => {
    setSelectedYear(val);
    setSelectedMake('');
    setSelectedModel('');
  };
  const handleMakeChange = (val: string) => {
    setSelectedMake(val);
    setSelectedModel('');
  };

  // --- Render ---
  if (loading) {
    return (
      <div>
        <PageHeader title="Quick Tint" titleAccent="Quote" subtitle="Automotive" />
        <div style={{ padding: SPACING.xxl, color: COLORS.textMuted, textAlign: 'center' }}>Loading pricing data...</div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Quick Tint"
        titleAccent="Quote"
        subtitle="Automotive -- Instant vehicle pricing reference"
        actions={selectedRows.length > 0 ? (
          <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
            <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>
              {selectedRows.length} service{selectedRows.length !== 1 ? 's' : ''} -- ${totalSelected.toLocaleString()}
            </span>
            <Button variant="primary" onClick={() => setShowBookModal(true)}>
              Book Appointment
            </Button>
            <Button variant="secondary" onClick={() => setShowSendModal(true)}>
              Send to Customer
            </Button>
          </div>
        ) : undefined}
      />

      {/* YMM Selector */}
      <DashboardCard
        title="Select Vehicle"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        }
      >
        <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <FormField label="Year">
              <SelectInput value={selectedYear} onChange={e => handleYearChange(e.target.value)}>
                <option value="">Select Year</option>
                {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
              </SelectInput>
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <FormField label="Make">
              <SelectInput value={selectedMake} onChange={e => handleMakeChange(e.target.value)}>
                <option value="">{selectedYear ? 'Select Make' : '---'}</option>
                {makes.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            </FormField>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <FormField label="Model">
              <SelectInput value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                <option value="">{selectedMake ? 'Select Model' : '---'}</option>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            </FormField>
          </div>
          {vehicle && (
            <div style={{
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              background: COLORS.activeBg,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLORS.borderAccent}`,
              marginBottom: SPACING.lg,
            }}>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Class</div>
              <div style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
                {vehicle.class_keys.join(', ')}
              </div>
              {addFee > 0 && (
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow, marginTop: 2 }}>
                  +${addFee} ADD_FEE (Full Sides)
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardCard>

      {/* Pricing Matrix */}
      {vehicle && priceMatrix && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard
            title={`${selectedYear} ${selectedMake} ${selectedModel}`}
            noPadding
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
            actions={
              selectedRows.length > 0 ? (
                <button
                  onClick={() => setSelectedRows([])}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: COLORS.textMuted, fontSize: FONT.sizeXs,
                    textDecoration: 'underline',
                  }}
                >
                  Clear Selection
                </button>
              ) : (
                <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                  Click cells to select services
                </span>
              )
            }
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={{
                      ...thStyle,
                      position: 'sticky', left: 0, zIndex: 2,
                      background: COLORS.cardBg,
                      minWidth: 160,
                    }}>
                      Service
                    </th>
                    {films.map(film => (
                      <th key={film.id} style={{ ...thStyle, minWidth: 100, textAlign: 'center' }}>
                        <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                          {film.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tintServices.map(svc => (
                    <tr key={svc.service_key}>
                      <td style={{
                        ...tdStyle,
                        position: 'sticky', left: 0, zIndex: 1,
                        background: COLORS.cardBg,
                        fontWeight: FONT.weightMedium,
                        color: COLORS.textSecondary,
                      }}>
                        <div>{svc.label}</div>
                        {svc.service_key === 'FULL_SIDES' && addFee > 0 && (
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.yellow }}>
                            incl. +${addFee} add fee
                          </div>
                        )}
                      </td>
                      {films.map(film => {
                        const price = priceMatrix[svc.service_key]?.[film.id] ?? 0;
                        const sel = isSelected(svc.service_key, film.id);
                        return (
                          <td
                            key={film.id}
                            onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, film.id, film.name, price)}
                            style={{
                              ...tdStyle,
                              textAlign: 'center',
                              cursor: price > 0 ? 'pointer' : 'default',
                              background: sel
                                ? 'rgba(220, 38, 38, 0.15)'
                                : 'transparent',
                              borderColor: sel ? COLORS.red : COLORS.border,
                              transition: 'background 0.15s, border-color 0.15s',
                            }}
                            onMouseEnter={e => {
                              if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg;
                            }}
                            onMouseLeave={e => {
                              if (!sel) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            {price > 0 ? (
                              <span style={{
                                fontSize: FONT.sizeBase,
                                fontWeight: sel ? FONT.weightBold : FONT.weightMedium,
                                color: sel ? COLORS.red : COLORS.textPrimary,
                              }}>
                                ${price}
                              </span>
                            ) : (
                              <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Removal services row */}
                  {removalServices.length > 0 && (
                    <>
                      <tr>
                        <td
                          colSpan={films.length + 1}
                          style={{
                            padding: `${SPACING.sm}px ${SPACING.lg}px`,
                            fontSize: FONT.sizeXs,
                            fontWeight: FONT.weightSemibold,
                            color: COLORS.yellow,
                            textTransform: 'uppercase' as const,
                            letterSpacing: '1px',
                            borderBottom: `1px solid ${COLORS.border}`,
                            background: COLORS.activeBg,
                          }}
                        >
                          Removal Services
                        </td>
                      </tr>
                      {removalServices.map(svc => {
                        const price = priceMatrix[svc.service_key]?.[0] ?? 0;
                        const sel = isSelected(svc.service_key, 0);
                        return (
                          <tr key={svc.service_key}>
                            <td style={{
                              ...tdStyle,
                              position: 'sticky', left: 0, zIndex: 1,
                              background: COLORS.cardBg,
                              fontWeight: FONT.weightMedium,
                              color: COLORS.textSecondary,
                            }}>
                              {svc.label}
                            </td>
                            <td
                              colSpan={films.length}
                              onClick={() => price > 0 && toggleRow(svc.service_key, svc.label, 0, 'N/A', price)}
                              style={{
                                ...tdStyle,
                                cursor: price > 0 ? 'pointer' : 'default',
                                background: sel ? 'rgba(220, 38, 38, 0.15)' : 'transparent',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => {
                                if (price > 0 && !sel) e.currentTarget.style.background = COLORS.hoverBg;
                              }}
                              onMouseLeave={e => {
                                if (!sel) e.currentTarget.style.background = 'transparent';
                              }}
                            >
                              {price > 0 ? (
                                <span style={{
                                  fontSize: FONT.sizeBase,
                                  fontWeight: sel ? FONT.weightBold : FONT.weightMedium,
                                  color: sel ? COLORS.red : COLORS.textPrimary,
                                }}>
                                  ${price} (flat rate)
                                </span>
                              ) : (
                                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>--</span>
                              )}
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

      {/* Selected Services Summary */}
      {selectedRows.length > 0 && config && vehicle && (
        <div style={{ marginTop: SPACING.lg }}>
          <DashboardCard title="Selected Services">
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
              {selectedRows.map((row, i) => {
                // Get allowed shades for this service+film combo
                const shades = row.filmId > 0
                  ? getAllowedShades(row.serviceKey, row.filmId, config.filmShades, config.serviceShades, config.films)
                  : [];
                return (
                  <div key={i} style={{
                    padding: `${SPACING.md}px`,
                    background: COLORS.inputBg,
                    borderRadius: RADIUS.sm,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ color: COLORS.textPrimary, fontWeight: FONT.weightMedium }}>{row.label}</span>
                        {row.filmName !== 'N/A' && (
                          <span style={{ color: COLORS.textMuted, marginLeft: SPACING.sm, fontSize: FONT.sizeSm }}>
                            {row.filmName}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                        <span style={{ fontWeight: FONT.weightBold, color: COLORS.textPrimary }}>${row.price}</span>
                        <button
                          onClick={() => toggleRow(row.serviceKey, row.label, row.filmId, row.filmName, row.price)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: COLORS.textMuted, fontSize: FONT.sizeLg, lineHeight: 1,
                            padding: '2px 6px', borderRadius: RADIUS.sm,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = COLORS.red}
                          onMouseLeave={e => e.currentTarget.style.color = COLORS.textMuted}
                        >
                          x
                        </button>
                      </div>
                    </div>
                    {/* Shade pickers -- split front/rear when vehicle class requires it */}
                    {shades.length > 0 && (() => {
                      const isSplit = vehicle ? needsSplitShades(vehicle, config.classRules, row.serviceKey) : false;
                      return isSplit ? (
                        <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.sm }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>Front Shade</div>
                            <SelectInput
                              value={row.shadeFront || ''}
                              onChange={e => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', e.target.value || null)}
                              style={{ minHeight: 32, fontSize: FONT.sizeXs }}
                            >
                              <option value="">Select shade</option>
                              {shades.map(s => (
                                <option key={s.id} value={s.shade_value}>{s.shade_value}</option>
                              ))}
                            </SelectInput>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>Rear Shade</div>
                            <SelectInput
                              value={row.shadeRear || ''}
                              onChange={e => updateRowShade(row.serviceKey, row.filmId, 'shadeRear', e.target.value || null)}
                              style={{ minHeight: 32, fontSize: FONT.sizeXs }}
                            >
                              <option value="">Select shade</option>
                              {shades.map(s => (
                                <option key={s.id} value={s.shade_value}>{s.shade_value}</option>
                              ))}
                            </SelectInput>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: SPACING.sm, marginTop: SPACING.sm }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 2 }}>Shade</div>
                            <SelectInput
                              value={row.shadeFront || ''}
                              onChange={e => updateRowShade(row.serviceKey, row.filmId, 'shadeFront', e.target.value || null)}
                              style={{ minHeight: 32, fontSize: FONT.sizeXs }}
                            >
                              <option value="">Select shade</option>
                              {shades.map(s => (
                                <option key={s.id} value={s.shade_value}>{s.shade_value}</option>
                              ))}
                            </SelectInput>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: `${SPACING.md}px ${SPACING.md}px 0`,
                borderTop: `1px solid ${COLORS.border}`,
                marginTop: SPACING.xs,
              }}>
                <span style={{ fontWeight: FONT.weightSemibold, color: COLORS.textSecondary }}>Total</span>
                <span style={{ fontWeight: FONT.weightBold, color: COLORS.red, fontSize: FONT.sizeLg }}>
                  ${totalSelected.toLocaleString()}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: SPACING.md, marginTop: SPACING.lg }}>
              <Button variant="primary" onClick={() => setShowBookModal(true)} style={{ flex: 1 }}>
                Book Appointment
              </Button>
              <Button variant="secondary" onClick={() => setShowSendModal(true)} style={{ flex: 1 }}>
                Send to Customer
              </Button>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* No vehicle selected prompt */}
      {!vehicle && !loading && (
        <div style={{
          marginTop: SPACING.xxl,
          textAlign: 'center',
          padding: `${SPACING.xxxl * 2}px`,
          color: COLORS.textMuted,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px', opacity: 0.4 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg }}>Select a vehicle above to see pricing</div>
          <div style={{ fontSize: FONT.sizeSm, marginTop: SPACING.sm }}>
            Year, Make, and Model required
          </div>
        </div>
      )}

      {/* Book Appointment Modal (Path 1) */}
      {showBookModal && config && vehicle && (
        <BookAppointmentModal
          config={config}
          vehicle={vehicle}
          year={selectedYear}
          make={selectedMake}
          model={selectedModel}
          selectedServices={selectedRows}
          total={totalSelected}
          onClose={() => setShowBookModal(false)}
        />
      )}

      {/* Send to Customer Modal (Path 2) */}
      {showSendModal && config && vehicle && (
        <SendToCustomerModal
          config={config}
          vehicle={vehicle}
          year={selectedYear}
          make={selectedMake}
          model={selectedModel}
          selectedServices={selectedRows}
          total={totalSelected}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table cell styles
// ---------------------------------------------------------------------------

const thStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm,
  fontWeight: FONT.weightSemibold,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  fontSize: FONT.sizeSm,
  borderBottom: `1px solid ${COLORS.border}`,
};

// ---------------------------------------------------------------------------
// Path 1: Book Appointment Modal
// ---------------------------------------------------------------------------

function BookAppointmentModal({ config, vehicle, year, make, model, selectedServices, total, onClose }: {
  config: BulkConfig;
  vehicle: AutoVehicle;
  year: string;
  make: string;
  model: string;
  selectedServices: SelectedRow[];
  total: number;
  onClose: () => void;
}) {
  const [appointmentType, setAppointmentType] = useState('dropoff');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [customerFirst, setCustomerFirst] = useState('');
  const [customerLast, setCustomerLast] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
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
    setGcLoading(true);
    setGcError('');
    setGcValid(null);
    try {
      const res = await fetch('/api/auto/validate-gc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: gcCode }),
      });
      const data = await res.json();
      if (data.valid) {
        setGcValid(data);
      } else {
        setGcError(data.error || 'Invalid code');
      }
    } catch { setGcError('Validation failed'); }
    setGcLoading(false);
  }

  // Compute discount and adjusted total
  const discountAmount = gcValid
    ? gcValid.discountType === 'dollar'
      ? Math.min(gcValid.amount || 0, total)
      : Math.round(total * ((gcValid.amount || 0) / 100))
    : 0;
  const adjustedTotal = Math.max(0, total - discountAmount);

  // Day schedule view
  const [dayAppointments, setDayAppointments] = useState<{
    customer_name: string;
    appointment_time: string | null;
    appointment_type: string;
    vehicle_year: number | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    status: string;
    duration_minutes: number | null;
  }[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);
  const [daySummary, setDaySummary] = useState<{
    total: number; dropoffs: number; waiting: number; headsups: number;
  } | null>(null);

  // Fetch appointments when date changes
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

  // Available appointment types from shop config
  const appointmentTypes = useMemo(() => {
    const types: { value: string; label: string }[] = [];
    if (config.shopConfig.enable_dropoff) types.push({ value: 'dropoff', label: 'Drop-off' });
    if (config.shopConfig.enable_waiting) types.push({ value: 'waiting', label: 'Waiting' });
    if (config.shopConfig.enable_headsup_30) types.push({ value: 'headsup_30', label: 'Heads-Up (30 min)' });
    if (config.shopConfig.enable_headsup_60) types.push({ value: 'headsup_60', label: 'Heads-Up (60 min)' });
    return types;
  }, [config]);

  // Generate time slots (shop-side can pick any time)
  const timeSlots = useMemo(() => {
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

  // Get the minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  async function handleSubmit() {
    if (!selectedDate || !selectedTime || !customerFirst) return;
    setSubmitting(true);

    try {
      const isHeadsUp = appointmentType === 'headsup_30' || appointmentType === 'headsup_60';
      const res = await fetch('/api/auto/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: customerFirst,
          lastName: customerLast,
          phone: customerPhone,
          email: customerEmail,
          vehicleYear: year,
          vehicleMake: make,
          vehicleModel: model,
          classKeys: vehicle.class_keys.join('|'),
          serviceType: 'tint',
          appointmentType,
          servicesJson: selectedServices.map(s => ({
            serviceKey: s.serviceKey,
            label: s.label,
            filmId: s.filmId || null,
            filmName: s.filmName,
            filmAbbrev: null,
            shadeFront: s.shadeFront,
            shadeRear: s.shadeRear,
            shade: s.shadeFront,
            price: s.price,
            discountAmount: 0,
            duration: 60,
            module: 'auto_tint',
          })),
          subtotal: total,
          discountCode: gcValid?.code || null,
          discountType: gcValid?.discountType || null,
          discountPercent: gcValid?.discountType === 'percent' ? gcValid.amount : 0,
          discountAmount: discountAmount,
          depositPaid: 0,
          balanceDue: adjustedTotal,
          appointmentDate: selectedDate,
          appointmentTime: isHeadsUp ? null : selectedTime,
          durationMinutes: selectedServices.length * 60,
          windowStatus: 'never',
          hasAftermarketTint: null,
          additionalInterests: '',
          notes: notes || `Booked from Quick Tint Quote`,
          calendarTitle: '',
          emojiMarker: '',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
      }
    } catch { /* silent */ }
    setSubmitting(false);
  }

  if (success) {
    return (
      <Modal title="Appointment Booked" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: SPACING.xxl }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold }}>
            Appointment created
          </div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: SPACING.sm }}>
            {year} {make} {model} -- {selectedDate} at {selectedTime}
          </div>
          <div style={{ marginTop: SPACING.lg }}>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Book Appointment"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedDate || !selectedTime || !customerFirst || submitting}
          >
            {submitting ? 'Creating...' : 'Create Appointment'}
          </Button>
        </div>
      }
    >
      {/* Vehicle summary */}
      <div style={{
        padding: SPACING.md,
        background: COLORS.inputBg,
        borderRadius: RADIUS.sm,
        marginBottom: SPACING.lg,
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
          {year} {make} {model}
        </div>
        <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginTop: 4 }}>
          {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''}
          {discountAmount > 0 ? (
            <> -- <span style={{ textDecoration: 'line-through' }}>${total.toLocaleString()}</span>{' '}
            <span style={{ color: COLORS.success, fontWeight: FONT.weightBold }}>${adjustedTotal.toLocaleString()}</span>
            <span style={{ color: COLORS.success }}> (-${discountAmount})</span></>
          ) : (
            <> -- ${total.toLocaleString()}</>
          )}
        </div>
      </div>

      {/* GC / Promo Code */}
      <div style={{ marginBottom: SPACING.lg }}>
        <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <FormField label="Gift Certificate / Promo Code">
              <TextInput
                value={gcCode}
                onChange={e => { setGcCode(e.target.value); setGcValid(null); setGcError(''); }}
                placeholder="Enter code (optional)"
              />
            </FormField>
          </div>
          <div style={{ marginBottom: SPACING.lg }}>
            <Button variant="secondary" onClick={validateGC} disabled={!gcCode.trim() || gcLoading}>
              {gcLoading ? 'Checking...' : 'Apply'}
            </Button>
          </div>
        </div>
        {gcValid && (
          <div style={{
            padding: SPACING.sm, background: COLORS.successBg, borderRadius: RADIUS.sm,
            fontSize: FONT.sizeSm, color: COLORS.success, marginTop: -SPACING.sm,
          }}>
            {gcValid.discountType === 'dollar' ? `$${gcValid.amount} gift certificate applied` : `${gcValid.amount}% promo applied`}
            {gcValid.promoNote && ` -- ${gcValid.promoNote}`}
          </div>
        )}
        {gcError && (
          <div style={{
            padding: SPACING.sm, background: COLORS.dangerBg, borderRadius: RADIUS.sm,
            fontSize: FONT.sizeSm, color: COLORS.danger, marginTop: -SPACING.sm,
          }}>
            {gcError}
          </div>
        )}
      </div>

      {/* Customer info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
        <FormField label="First Name *">
          <TextInput value={customerFirst} onChange={e => setCustomerFirst(e.target.value)} placeholder="First name" />
        </FormField>
        <FormField label="Last Name">
          <TextInput value={customerLast} onChange={e => setCustomerLast(e.target.value)} placeholder="Last name" />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.lg }}>
        <FormField label="Phone">
          <TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(301) 555-1234" />
        </FormField>
        <FormField label="Email">
          <TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" />
        </FormField>
      </div>

      {/* Appointment details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
        <FormField label="Type">
          <SelectInput value={appointmentType} onChange={e => setAppointmentType(e.target.value)}>
            {appointmentTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectInput>
        </FormField>
        <FormField label="Date *">
          <TextInput
            type="date"
            value={selectedDate}
            min={today}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </FormField>
        <FormField label="Time *">
          <SelectInput value={selectedTime} onChange={e => setSelectedTime(e.target.value)}>
            <option value="">Select Time</option>
            {timeSlots.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </SelectInput>
        </FormField>
      </div>

      {/* Day schedule timeline */}
      {selectedDate && (
        <div style={{ marginBottom: SPACING.lg }}>
          <MiniTimeline
            appointments={dayAppointments}
            loading={loadingDay}
            dateLabel={`Schedule for ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`}
            summary={daySummary}
            height={360}
          />
        </div>
      )}

      <FormField label="Notes">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Internal notes..."
          style={{
            width: '100%',
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            background: COLORS.inputBg,
            border: `1px solid ${COLORS.borderInput}`,
            borderRadius: RADIUS.sm,
            color: COLORS.textPrimary,
            fontSize: FONT.sizeSm,
            resize: 'vertical',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </FormField>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Path 2: Send to Customer Modal
// ---------------------------------------------------------------------------

function SendToCustomerModal({ config, vehicle, year, make, model, selectedServices, total, onClose }: {
  config: BulkConfig;
  vehicle: AutoVehicle;
  year: string;
  make: string;
  model: string;
  selectedServices: SelectedRow[];
  total: number;
  onClose: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Deposit override: default from shop config
  const shopRequiresDeposit = config.shopConfig.require_deposit;
  const shopDepositAmount = config.shopConfig.deposit_amount || 50;
  const [chargeDeposit, setChargeDeposit] = useState(shopRequiresDeposit);
  const [depositAmount, setDepositAmount] = useState(shopDepositAmount);

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auto/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
          customer_email: customerEmail || null,
          vehicle_year: parseInt(year),
          vehicle_make: make,
          vehicle_model: model,
          vehicle_id: vehicle.id,
          class_keys: vehicle.class_keys.join('|'),
          services: selectedServices.map(s => ({
            service_key: s.serviceKey,
            label: s.label,
            film_id: s.filmId || null,
            film_name: s.filmName,
            price: s.price,
            shade_front: s.shadeFront,
            shade_rear: s.shadeRear,
          })),
          total_price: total,
          charge_deposit: chargeDeposit,
          deposit_amount: chargeDeposit ? depositAmount : 0,
          send_method: 'copy',
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
    <Modal
      title="Send to Customer"
      onClose={onClose}
      footer={
        !generatedLink ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={submitting}
            >
              {submitting ? 'Generating...' : 'Generate Booking Link'}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACING.sm }}>
            <Button variant="secondary" onClick={onClose}>Done</Button>
          </div>
        )
      }
    >
      {!generatedLink ? (
        <>
          {/* Vehicle + services summary */}
          <div style={{
            padding: SPACING.md,
            background: COLORS.inputBg,
            borderRadius: RADIUS.sm,
            marginBottom: SPACING.lg,
            border: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
              {year} {make} {model}
            </div>
            {selectedServices.map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: FONT.sizeSm, color: COLORS.textMuted,
                marginTop: 4,
              }}>
                <span>
                  {s.label}
                  {s.filmName !== 'N/A' ? ` (${s.filmName})` : ''}
                  {s.shadeFront ? ` - ${s.shadeFront}` : ''}
                </span>
                <span>${s.price}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              marginTop: SPACING.sm, paddingTop: SPACING.sm,
              borderTop: `1px solid ${COLORS.border}`,
              fontWeight: FONT.weightSemibold, color: COLORS.textPrimary,
            }}>
              <span>Total</span>
              <span>${total.toLocaleString()}</span>
            </div>
          </div>

          {/* Deposit settings */}
          <div style={{
            padding: SPACING.md,
            background: COLORS.activeBg,
            borderRadius: RADIUS.sm,
            marginBottom: SPACING.lg,
            border: `1px solid ${COLORS.borderAccent}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
              <div>
                <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                  Require Deposit
                </div>
                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                  Default: {shopRequiresDeposit ? `$${shopDepositAmount}` : 'No deposit'}
                </div>
              </div>
              <button
                onClick={() => setChargeDeposit(!chargeDeposit)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: chargeDeposit ? COLORS.red : COLORS.border,
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: chargeDeposit ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
            {chargeDeposit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm }}>
                <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>$</span>
                <TextInput
                  type="number"
                  value={String(depositAmount)}
                  onChange={e => setDepositAmount(Number(e.target.value) || 0)}
                  style={{ maxWidth: 100, minHeight: 32, fontSize: FONT.sizeSm }}
                />
              </div>
            )}
          </div>

          {/* Customer info (optional) */}
          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
            Customer info (optional -- for lead tracking)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACING.md, marginBottom: SPACING.md }}>
            <FormField label="Name">
              <TextInput value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" />
            </FormField>
            <FormField label="Phone">
              <TextInput value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(301) 555-1234" />
            </FormField>
          </div>
          <FormField label="Email">
            <TextInput value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="email@example.com" />
          </FormField>
        </>
      ) : (
        /* Link generated */
        <div style={{ textAlign: 'center', padding: SPACING.lg }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, margin: '0 auto 16px' }}>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <div style={{ fontSize: FONT.sizeLg, color: COLORS.textPrimary, fontWeight: FONT.weightSemibold, marginBottom: SPACING.sm }}>
            Booking Link Generated
          </div>
          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginBottom: SPACING.lg }}>
            Customer will see their {year} {make} {model} with all services pre-selected.
            {chargeDeposit ? ` $${depositAmount} deposit required to book.` : ' No deposit required.'}
          </div>

          {/* Link display */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: SPACING.sm,
            padding: SPACING.md, background: COLORS.inputBg,
            borderRadius: RADIUS.sm, border: `1px solid ${COLORS.border}`,
          }}>
            <input
              readOnly
              value={generatedLink}
              style={{
                flex: 1, background: 'none', border: 'none',
                color: COLORS.textPrimary, fontSize: FONT.sizeSm,
                outline: 'none', fontFamily: 'monospace',
              }}
              onClick={e => (e.target as HTMLInputElement).select()}
            />
            <Button variant={copied ? 'primary' : 'secondary'} onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {customerName && (
            <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.md }}>
              Lead tracked for {customerName}{customerPhone ? ` (${customerPhone})` : ''}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
