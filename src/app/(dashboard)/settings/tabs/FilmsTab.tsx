'use client';

import { useState, useMemo } from 'react';
import { DashboardCard, Button, StatusBadge, ColorPicker } from '@/app/components/dashboard';
import { COLORS, SPACING, FONT, RADIUS } from '@/app/components/dashboard/theme';
import FilmCard from '@/app/components/booking/FilmCard';
import type { AutoFilm, AutoFilmShade } from '@/app/components/booking/types';

interface FilmBrand { id: number; name: string; logo_url: string | null; active: boolean; sort_order: number; }
interface Film { id: number; brand_id: number; name: string; tier: number; tier_label: string | null; abbreviation: string; ir_rejection: string | null; offered: boolean; sort_order: number; display_name: string | null; card_image_url: string | null; featured_specs: string[] | null; custom_metrics: Array<{ label: string; value: string }> | null; card_styles: { bg?: string; nameColor?: string; tierColor?: string; metricValueColor?: string; metricLabelColor?: string } | null; badge: { enabled: boolean; text: string; position: 'top' | 'bottom'; bgColor: string; textColor: string } | null; film_type: string | null; signal_safe: boolean; color_appearance: string | null; thickness_mil: number | null; warranty: string | null; notes: string | null; }
interface FilmShade { id: number; film_id: number; shade_value: string; shade_label: string | null; shade_numeric: number | null; offered: boolean; sort_order: number; }
interface VehicleClass { id: number; class_key: string; name: string; is_add_fee: boolean; }
interface PricingRow { id: number; class_key: string; service_key: string; film_id: number | null; price: number; duration_minutes: number | null; }
interface Service { service_key: string; label: string; service_type: string; is_primary: boolean; is_addon: boolean; }

interface Props {
  data: Record<string, unknown>;
  onSave: (table: string, id: number | null, data: Record<string, unknown>) => Promise<boolean>;
  onRefresh: () => void;
}

export default function FilmsTab({ data, onSave, onRefresh }: Props) {
  const brands = (data.filmBrands || []) as FilmBrand[];
  const films = (data.films || []) as Film[];
  const filmShades = (data.filmShades || []) as FilmShade[];
  const vehicleClasses = ((data.vehicleClasses || []) as VehicleClass[]).filter(vc => !vc.is_add_fee);
  const pricing = (data.pricing || []) as PricingRow[];
  const services = (data.services || []) as Service[];

  const shopConfig = (data.shopConfig as Record<string, unknown>) || {};

  const [expandedBrand, setExpandedBrand] = useState<number | null>(brands.find(b => b.active)?.id || null);
  const [expandedFilm, setExpandedFilm] = useState<number | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [pricingEdits, setPricingEdits] = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);
  const [savedPricing, setSavedPricing] = useState(false);

  // Per-film edit state: { filmId: { display_name, tier_label, featured_specs } }
  const [filmEdits, setFilmEdits] = useState<Record<number, { display_name?: string; tier_label?: string; abbreviation?: string; featured_specs?: string[] | null; custom_metrics?: Array<{ label: string; value: string }> | null; card_styles?: Record<string, string> | null; badge?: { enabled: boolean; text: string; position: 'top' | 'bottom'; bgColor: string; textColor: string } | null }>>({});
  const [filmSaving, setFilmSaving] = useState<number | null>(null);
  const [filmSaved, setFilmSaved] = useState<number | null>(null);

  function getFilmEdit(filmId: number, field: 'display_name' | 'tier_label' | 'abbreviation', fallback: string) {
    const edit = filmEdits[filmId];
    if (edit && field in edit) return edit[field] as string;
    return fallback;
  }

  function updateFilmEdit(filmId: number, patch: Record<string, unknown>) {
    setFilmEdits(prev => ({ ...prev, [filmId]: { ...prev[filmId], ...patch } }));
  }

  async function saveFilmEdits(filmId: number) {
    const edit = filmEdits[filmId];
    if (!edit) return;
    setFilmSaving(filmId);
    await onSave('auto_films', filmId, edit as Record<string, unknown>);
    setFilmSaving(null);
    setFilmSaved(filmId);
    setTimeout(() => setFilmSaved(null), 2000);
    setFilmEdits(prev => { const next = { ...prev }; delete next[filmId]; return next; });
    onRefresh();
  }

  const [matchStyleApplied, setMatchStyleApplied] = useState(false);

  async function applyMatchStyle(sourceFilmId: number) {
    // Get the source film's current state (edits merged with saved data)
    const sourceFilm = films.find(f => f.id === sourceFilmId);
    if (!sourceFilm) return;
    const sourceEdits = filmEdits[sourceFilmId] || {};

    const stylePayload: Record<string, unknown> = {
      card_styles: sourceEdits.card_styles !== undefined ? sourceEdits.card_styles : sourceFilm.card_styles,
      featured_specs: sourceEdits.featured_specs !== undefined ? sourceEdits.featured_specs : sourceFilm.featured_specs,
      custom_metrics: sourceEdits.custom_metrics !== undefined ? sourceEdits.custom_metrics : sourceFilm.custom_metrics,
      badge: sourceEdits.badge !== undefined ? sourceEdits.badge : sourceFilm.badge,
    };

    // Apply to all other offered films
    const otherOffered = films.filter(f => f.offered && f.id !== sourceFilmId);
    for (const target of otherOffered) {
      await onSave('auto_films', target.id, stylePayload);
    }

    setMatchStyleApplied(true);
    setTimeout(() => setMatchStyleApplied(false), 3000);
    onRefresh();
  }

  // Local state for instant preview updates
  const [localLayout, setLocalLayout] = useState<'classic' | 'horizontal' | 'minimal'>(
    (shopConfig.film_card_layout as 'classic' | 'horizontal' | 'minimal') || 'classic'
  );
  const [localSpecs, setLocalSpecs] = useState<string[]>(
    (shopConfig.film_card_specs as string[]) || ['irer', 'tser', 'uv_rejection']
  );

  // Preview film: first offered film
  const previewFilm = useMemo(() => films.find(f => f.offered) || null, [films]);
  const previewShades = useMemo(() => {
    if (!previewFilm) return [];
    return filmShades.filter(s => s.film_id === previewFilm.id && s.offered);
  }, [previewFilm, filmShades]);

  // Films for the expanded brand
  const brandFilms = useMemo(() => {
    if (!expandedBrand) return [];
    return films.filter(f => f.brand_id === expandedBrand).sort((a, b) => a.sort_order - b.sort_order);
  }, [expandedBrand, films]);

  // Offered films only (for pricing matrix)
  const offeredFilms = films.filter(f => f.offered);

  // Primary services that use class-based pricing
  const primaryServices = services.filter(s => s.is_primary && s.service_type === 'tint');

  // Toggle brand active
  async function toggleBrand(brand: FilmBrand) {
    await onSave('auto_film_brands', brand.id, { active: !brand.active });
    onRefresh();
  }

  async function toggleFilmOffered(film: Film) {
    await onSave('auto_films', film.id, { offered: !film.offered });
    onRefresh();
  }

  async function toggleShadeOffered(shade: FilmShade) {
    await onSave('auto_film_shades', shade.id, { offered: !shade.offered });
    onRefresh();
  }

  // Get current price from auto_pricing
  function getPrice(classKey: string, serviceKey: string, filmId: number | null): number | null {
    const row = pricing.find(p =>
      p.class_key === classKey && p.service_key === serviceKey &&
      (filmId === null ? p.film_id === null : p.film_id === filmId)
    );
    return row ? Number(row.price) : null;
  }

  function getPricingId(classKey: string, serviceKey: string, filmId: number | null): number | null {
    const row = pricing.find(p =>
      p.class_key === classKey && p.service_key === serviceKey &&
      (filmId === null ? p.film_id === null : p.film_id === filmId)
    );
    return row ? row.id : null;
  }

  // Save all pricing edits
  async function savePricingEdits() {
    setSavingPricing(true);
    const promises = Object.entries(pricingEdits)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => {
        const [classKey, serviceKey, filmIdStr] = key.split('|');
        const filmId = parseInt(filmIdStr);
        const pricingId = getPricingId(classKey, serviceKey, filmId);
        if (pricingId) {
          // Update existing row
          return onSave('auto_pricing', pricingId, { price: parseFloat(value) });
        } else {
          // Create new pricing row
          return fetch('/api/auto/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'auto_pricing',
              data: {
                class_key: classKey,
                service_key: serviceKey,
                film_id: filmId,
                price: parseFloat(value),
              },
            }),
          }).then(r => r.json()).then(r => r.success);
        }
      });

    await Promise.all(promises);
    setSavingPricing(false);
    setSavedPricing(true);
    setTimeout(() => setSavedPricing(false), 2000);
    setPricingEdits({});
    onRefresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.xl }}>

      {/* Card Display Settings */}
      <DashboardCard title="Booking Page Film Card Display" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
      }>
        <div style={{ display: 'flex', gap: SPACING.xl, flexWrap: 'wrap' }}>
          {/* Left: Controls */}
          <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: SPACING.lg }}>

            {/* Layout Selector */}
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
                Card Layout
              </div>
              <div style={{ display: 'flex', gap: SPACING.md }}>
                {([
                  { key: 'classic' as const, label: 'Classic', desc: 'Tier, name, metrics' },
                  { key: 'horizontal' as const, label: 'Horizontal', desc: 'Name left, metrics right' },
                  { key: 'minimal' as const, label: 'Minimal', desc: 'Name + single metric' },
                ] as const).map(opt => {
                  const isActive = localLayout === opt.key;
                  return (
                    <button key={opt.key} onClick={async () => {
                      setLocalLayout(opt.key);
                      await onSave('shop_config', null, { film_card_layout: opt.key });
                      onRefresh();
                    }} style={{
                      flex: 1, padding: '10px 8px', borderRadius: RADIUS.lg, cursor: 'pointer',
                      background: isActive ? COLORS.activeBg : COLORS.inputBg,
                      border: `2px solid ${isActive ? COLORS.red : COLORS.borderInput}`,
                      textAlign: 'center', transition: 'all 0.15s',
                    }}>
                      {/* Layout thumbnail SVG */}
                      <svg viewBox="0 0 80 40" style={{ width: 60, height: 30, margin: '0 auto 4px', display: 'block' }}>
                        {opt.key === 'classic' && <>
                          <rect x="25" y="2" width="30" height="3" rx="1" fill={isActive ? COLORS.red : '#666'} opacity="0.5" />
                          <rect x="15" y="10" width="50" height="6" rx="2" fill={isActive ? COLORS.red : '#888'} />
                          <line x1="10" y1="22" x2="70" y2="22" stroke={isActive ? COLORS.red : '#555'} strokeWidth="0.5" opacity="0.4" />
                          <rect x="8" y="26" width="18" height="10" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                          <rect x="31" y="26" width="18" height="10" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                          <rect x="54" y="26" width="18" height="10" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                        </>}
                        {opt.key === 'horizontal' && <>
                          <rect x="4" y="4" width="8" height="3" rx="1" fill={isActive ? COLORS.red : '#666'} opacity="0.5" />
                          <rect x="4" y="11" width="36" height="6" rx="2" fill={isActive ? COLORS.red : '#888'} />
                          <rect x="4" y="22" width="30" height="4" rx="1" fill={isActive ? COLORS.red : '#666'} opacity="0.4" />
                          <line x1="48" y1="4" x2="48" y2="36" stroke={isActive ? COLORS.red : '#555'} strokeWidth="0.5" opacity="0.4" />
                          <rect x="52" y="6" width="24" height="7" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                          <rect x="52" y="16" width="24" height="7" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                          <rect x="52" y="26" width="24" height="7" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                        </>}
                        {opt.key === 'minimal' && <>
                          <rect x="28" y="3" width="24" height="3" rx="1" fill={isActive ? COLORS.red : '#666'} opacity="0.5" />
                          <rect x="10" y="12" width="60" height="8" rx="2" fill={isActive ? COLORS.red : '#888'} />
                          <rect x="22" y="28" width="36" height="6" rx="2" fill={isActive ? COLORS.red : '#555'} opacity="0.6" />
                        </>}
                      </svg>
                      <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: isActive ? COLORS.red : COLORS.textMuted }}>
                        {opt.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hero Metric Toggles */}
            <div>
              <div style={{ fontSize: FONT.sizeSm, fontWeight: FONT.weightBold, color: COLORS.textPrimary, marginBottom: SPACING.sm }}>
                Hero Metrics
              </div>
              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
                Up to 3 specs displayed on each card. Changes update the preview instantly.
              </div>
              <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                {[
                  { key: 'irer', label: 'IR Rejection' },
                  { key: 'tser', label: 'TSER' },
                  { key: 'uv_rejection', label: 'UV Rejection' },
                  { key: 'glare_reduction', label: 'Glare Reduction' },
                  { key: 'sirr', label: 'Selective IR' },
                  { key: 'vlr', label: 'Light Reflectance' },
                ].map(spec => {
                  const isOn = localSpecs.includes(spec.key);
                  return (
                    <button key={spec.key} onClick={async () => {
                      const next = isOn
                        ? localSpecs.filter(s => s !== spec.key)
                        : [...localSpecs, spec.key];
                      setLocalSpecs(next);
                      await onSave('shop_config', null, { film_card_specs: next });
                      onRefresh();
                    }} style={{
                      padding: '6px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                      background: isOn ? COLORS.activeBg : COLORS.inputBg,
                      color: isOn ? COLORS.red : COLORS.textMuted,
                      border: `1px solid ${isOn ? `${COLORS.red}40` : COLORS.borderInput}`,
                      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                      transition: 'all 0.15s',
                    }}>
                      {spec.label}
                    </button>
                  );
                })}
                {localSpecs.length > 0 && (
                  <button onClick={async () => {
                    setLocalSpecs([]);
                    await onSave('shop_config', null, { film_card_specs: [] });
                    onRefresh();
                  }} style={{
                    padding: '6px 14px', borderRadius: RADIUS.lg, cursor: 'pointer',
                    background: 'transparent', color: COLORS.textMuted,
                    border: `1px dashed ${COLORS.borderInput}`,
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                  }}>
                    Disable All
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
              Live Preview
            </div>
            <div style={{
              background: 'transparent',
              width: 250,
            }}>
              {previewFilm ? (
                <FilmCard
                  film={previewFilm as unknown as AutoFilm}
                  isSelected={false}
                  onClick={() => {}}
                  displaySpecs={localSpecs}
                  filmShades={previewShades as unknown as AutoFilmShade[]}
                  layout={localLayout}
                  previewMode
                  theme={{ primary: String(shopConfig.theme_ext_primary || '#d61f26'), secondary: String(shopConfig.theme_ext_secondary || '#1a1a1a'), accent: String(shopConfig.theme_ext_accent || '#d61f26'), background: String(shopConfig.theme_ext_background || '#ffffff') }}
                />
              ) : (
                <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  No offered films to preview
                </div>
              )}
            </div>
          </div>
        </div>
      </DashboardCard>

      {/* Section 1: Brand Selection */}
      <DashboardCard title="Film Brands" icon={
        <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
          <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: SPACING.md }}>
          {brands.map(brand => (
            <div key={brand.id} style={{
              padding: SPACING.lg, borderRadius: RADIUS.lg, cursor: 'pointer',
              background: brand.active ? COLORS.activeBg : COLORS.inputBg,
              border: `2px solid ${expandedBrand === brand.id ? COLORS.red : brand.active ? `${COLORS.red}40` : COLORS.borderInput}`,
              textAlign: 'center', transition: 'all 0.15s',
            }}
              onClick={() => setExpandedBrand(expandedBrand === brand.id ? null : brand.id)}
            >
              <div style={{ fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: brand.active ? COLORS.textPrimary : COLORS.textMuted }}>
                {brand.name}
              </div>
              <div style={{ marginTop: SPACING.sm }}>
                <button
                  onClick={e => { e.stopPropagation(); toggleBrand(brand); }}
                  style={{
                    background: brand.active ? COLORS.activeBg : 'rgba(255,255,255,0.10)',
                    color: brand.active ? COLORS.red : COLORS.textTertiary,
                    border: 'none', borderRadius: RADIUS.sm, padding: '3px 10px',
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, cursor: 'pointer',
                  }}
                >
                  {brand.active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      {/* Section 2: Film Lines & Shades (for expanded brand) */}
      {expandedBrand && (
        <DashboardCard title={`${brands.find(b => b.id === expandedBrand)?.name || ''} Film Lines`}>
          {brandFilms.length === 0 ? (
            <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, textAlign: 'center', padding: SPACING.xl }}>
              No film lines configured for this brand.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.md }}>
              {brandFilms.map(film => {
                const shades = filmShades.filter(s => s.film_id === film.id)
                  .sort((a, b) => (a.shade_numeric || 0) - (b.shade_numeric || 0));
                const isExpanded = expandedFilm === film.id;

                return (
                  <div key={film.id} style={{
                    border: `1px solid ${isExpanded ? COLORS.red + '40' : COLORS.border}`,
                    borderRadius: RADIUS.lg, overflow: 'hidden',
                    opacity: film.offered ? 1 : 0.7,
                  }}>
                    {/* Film header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: SPACING.md,
                      padding: `${SPACING.md}px ${SPACING.lg}px`, cursor: 'pointer',
                      background: isExpanded ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}
                      onClick={() => setExpandedFilm(isExpanded ? null : film.id)}
                    >
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: FONT.sizeBase, fontWeight: FONT.weightSemibold, color: COLORS.textPrimary }}>
                          {film.name}
                        </span>
                        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted, marginLeft: SPACING.sm }}>
                          {film.tier_label || `Tier ${film.tier}`}
                        </span>
                      </div>
                      {film.ir_rejection && (
                        <span style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>IR: {film.ir_rejection}</span>
                      )}
                      <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, fontFamily: 'monospace' }}>{film.abbreviation}</span>
                      <StatusBadge label={`${shades.filter(s => s.offered).length}/${shades.length} shades`} variant="neutral" />
                      <button
                        onClick={e => { e.stopPropagation(); toggleFilmOffered(film); }}
                        style={{
                          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: film.offered ? COLORS.red : COLORS.border,
                          position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: 3,
                          left: film.offered ? 21 : 3,
                          transition: 'left 0.2s',
                        }} />
                      </button>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={COLORS.textMuted} strokeWidth="2"
                        style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="M3 5l4 4 4-4"/>
                      </svg>
                    </div>

                    {/* Expanded: film customization + shade toggles */}
                    {isExpanded && (
                      <div style={{
                        padding: `${SPACING.md}px ${SPACING.lg}px`,
                        borderTop: `1px solid ${COLORS.border}`,
                        background: 'rgba(255,255,255,0.02)',
                      }}>
                        {/* Per-Film Customization */}
                        <div style={{ marginBottom: SPACING.lg }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm }}>
                            <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase' }}>
                              Card Overrides
                            </div>
                            <Button
                              variant="primary" size="sm"
                              onClick={() => saveFilmEdits(film.id)}
                              disabled={!filmEdits[film.id] || filmSaving === film.id}
                              style={filmSaved === film.id ? { background: '#22c55e', borderColor: '#22c55e', borderWidth: 1, borderStyle: 'solid' } : !filmEdits[film.id] ? { opacity: 0.4 } : {}}
                            >
                              {filmSaving === film.id ? 'Saving...' : filmSaved === film.id ? 'Saved' : 'Save'}
                            </Button>
                          </div>
                          <div style={{ display: 'flex', gap: SPACING.md, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            {/* Display Name */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Display Name</span>
                              <input
                                type="text"
                                value={getFilmEdit(film.id, 'display_name', film.display_name || '')}
                                placeholder={film.name}
                                onChange={e => updateFilmEdit(film.id, { display_name: e.target.value.trim() || null })}
                                style={{
                                  width: 180, padding: '6px 10px', background: COLORS.inputBg,
                                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm,
                                }}
                              />
                            </div>
                            {/* Tier Label */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Tier Label</span>
                              <input
                                type="text"
                                value={getFilmEdit(film.id, 'tier_label', film.tier_label || '')}
                                placeholder="e.g. Good, Best, Premium"
                                onChange={e => updateFilmEdit(film.id, { tier_label: e.target.value.trim() || null })}
                                style={{
                                  width: 160, padding: '6px 10px', background: COLORS.inputBg,
                                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm,
                                }}
                              />
                            </div>
                            {/* Abbreviation */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Abbreviation</span>
                              <input
                                type="text"
                                value={getFilmEdit(film.id, 'abbreviation', film.abbreviation || '')}
                                placeholder="e.g. BLK, BC, i3"
                                onChange={e => updateFilmEdit(film.id, { abbreviation: e.target.value })}
                                style={{
                                  width: 80, padding: '6px 10px', background: COLORS.inputBg,
                                  color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                  borderRadius: RADIUS.sm, fontSize: FONT.sizeSm, fontFamily: 'monospace',
                                  textAlign: 'center',
                                }}
                              />
                            </div>
                          </div>
                          {/* Featured Specs Override */}
                          <div style={{ marginTop: SPACING.sm }}>
                            <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                              Featured Specs {(filmEdits[film.id]?.featured_specs !== undefined ? filmEdits[film.id]?.featured_specs : film.featured_specs) ? '(overriding global)' : '(using global defaults)'}
                            </span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {['irer', 'tser', 'uv_rejection', 'glare_reduction', 'sirr', 'vlr'].map(specKey => {
                                const specLabels: Record<string, string> = { irer: 'IR', tser: 'TSER', uv_rejection: 'UV', glare_reduction: 'Glare', sirr: 'SIRR', vlr: 'VLR' };
                                const currentSpecs = filmEdits[film.id]?.featured_specs !== undefined
                                  ? filmEdits[film.id]?.featured_specs
                                  : film.featured_specs;
                                const filmSpecs = currentSpecs || localSpecs;
                                const isOn = filmSpecs.includes(specKey);
                                return (
                                  <button key={specKey} onClick={() => {
                                    const current = currentSpecs || [...localSpecs];
                                    const next = isOn ? current.filter(s => s !== specKey) : [...current, specKey];
                                    updateFilmEdit(film.id, { featured_specs: next });
                                  }} style={{
                                    padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                    background: isOn ? COLORS.activeBg : 'transparent',
                                    color: isOn ? COLORS.red : COLORS.textMuted,
                                    border: `1px solid ${isOn ? `${COLORS.red}40` : COLORS.borderInput}`,
                                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                                  }}>
                                    {specLabels[specKey]}
                                  </button>
                                );
                              })}
                              {(filmEdits[film.id]?.featured_specs !== undefined ? filmEdits[film.id]?.featured_specs : film.featured_specs) && (
                                <button onClick={() => {
                                  updateFilmEdit(film.id, { featured_specs: null });
                                }} style={{
                                  padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                  background: 'transparent', color: COLORS.textMuted,
                                  border: `1px solid ${COLORS.borderInput}`,
                                  fontSize: FONT.sizeXs,
                                }}>
                                  Reset to Global
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Custom Hero Metrics */}
                        <div style={{ marginBottom: SPACING.lg }}>
                          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                            Custom Hero Metrics
                          </div>
                          <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: SPACING.sm }}>
                            Add custom metrics that display on this film's card. These show before standard specs (max 3 total).
                          </div>
                          {(() => {
                            const currentMetrics: Array<{ label: string; value: string }> =
                              filmEdits[film.id]?.custom_metrics !== undefined
                                ? (filmEdits[film.id]?.custom_metrics || [])
                                : (film.custom_metrics || []);

                            return (
                              <>
                                {currentMetrics.map((cm, idx) => (
                                  <div key={idx} style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center', marginBottom: 6 }}>
                                    <input
                                      type="text"
                                      value={cm.label}
                                      placeholder="Label (e.g. Warranty)"
                                      onChange={e => {
                                        const next = [...currentMetrics];
                                        next[idx] = { ...next[idx], label: e.target.value };
                                        updateFilmEdit(film.id, { custom_metrics: next.length ? next : null });
                                      }}
                                      style={{
                                        width: 140, padding: '5px 8px', background: COLORS.inputBg,
                                        color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                        borderRadius: RADIUS.sm, fontSize: FONT.sizeXs,
                                      }}
                                    />
                                    <input
                                      type="text"
                                      value={cm.value}
                                      placeholder="Value (e.g. Lifetime)"
                                      onChange={e => {
                                        const next = [...currentMetrics];
                                        next[idx] = { ...next[idx], value: e.target.value };
                                        updateFilmEdit(film.id, { custom_metrics: next.length ? next : null });
                                      }}
                                      style={{
                                        width: 140, padding: '5px 8px', background: COLORS.inputBg,
                                        color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                        borderRadius: RADIUS.sm, fontSize: FONT.sizeXs,
                                      }}
                                    />
                                    <button onClick={() => {
                                      const next = currentMetrics.filter((_, i) => i !== idx);
                                      updateFilmEdit(film.id, { custom_metrics: next.length ? next : null });
                                    }} style={{
                                      background: 'transparent', border: 'none', cursor: 'pointer',
                                      color: COLORS.danger || '#ef4444', padding: '2px 6px', fontSize: FONT.sizeSm,
                                    }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                                {currentMetrics.length < 3 && (
                                  <button onClick={() => {
                                    const next = [...currentMetrics, { label: '', value: '' }];
                                    updateFilmEdit(film.id, { custom_metrics: next });
                                  }} style={{
                                    padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                    background: 'transparent', color: COLORS.textMuted,
                                    border: `1px dashed ${COLORS.borderInput}`,
                                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                    Add Metric
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Badge */}
                        <div style={{ marginBottom: SPACING.lg }}>
                          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                            Badge
                          </div>
                          {(() => {
                            const currentBadge = filmEdits[film.id]?.badge !== undefined
                              ? filmEdits[film.id]?.badge
                              : film.badge;
                            const isEnabled = currentBadge?.enabled || false;
                            const badgeDefaults = { enabled: true, text: '', position: 'bottom' as const, bgColor: '#d91f26', textColor: '#ffffff' };

                            return (
                              <>
                                <label style={{ display: 'flex', alignItems: 'center', gap: SPACING.sm, cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => {
                                      if (isEnabled) {
                                        updateFilmEdit(film.id, { badge: null });
                                      } else {
                                        updateFilmEdit(film.id, { badge: { ...badgeDefaults, ...currentBadge, enabled: true } });
                                      }
                                    }}
                                    style={{ width: 16, height: 16, accentColor: COLORS.red, cursor: 'pointer' }}
                                  />
                                  <span style={{ fontSize: FONT.sizeSm, color: COLORS.textPrimary }}>
                                    Enable badge on this film card
                                  </span>
                                </label>

                                {isEnabled && (() => {
                                  const badge = { ...badgeDefaults, ...currentBadge };
                                  const updateBadge = (patch: Record<string, unknown>) => {
                                    updateFilmEdit(film.id, { badge: { ...badge, ...patch } as typeof badge });
                                  };
                                  return (
                                    <div style={{ marginTop: SPACING.sm, display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                                      {/* Text + Position */}
                                      <div style={{ display: 'flex', gap: SPACING.md, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Badge Text</span>
                                          <input
                                            type="text"
                                            value={badge.text}
                                            placeholder="MOST POPULAR"
                                            onChange={e => updateBadge({ text: e.target.value })}
                                            style={{
                                              width: 200, padding: '6px 10px', background: COLORS.inputBg,
                                              color: COLORS.textPrimary, border: `1px solid ${COLORS.borderInput}`,
                                              borderRadius: RADIUS.sm, fontSize: FONT.sizeSm,
                                            }}
                                          />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          <span style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>Position</span>
                                          <div style={{ display: 'flex', gap: 4 }}>
                                            {(['top', 'bottom'] as const).map(pos => (
                                              <button key={pos} onClick={() => updateBadge({ position: pos })} style={{
                                                padding: '6px 14px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                                background: badge.position === pos ? COLORS.activeBg : COLORS.inputBg,
                                                color: badge.position === pos ? COLORS.red : COLORS.textMuted,
                                                border: `1px solid ${badge.position === pos ? `${COLORS.red}40` : COLORS.borderInput}`,
                                                fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                                                textTransform: 'capitalize',
                                              }}>
                                                {pos}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      {/* Colors */}
                                      <div style={{ display: 'flex', gap: SPACING.lg, alignItems: 'flex-start' }}>
                                        <ColorPicker value={badge.bgColor} onChange={v => updateBadge({ bgColor: v })} label="Background" size="sm" />
                                        <ColorPicker value={badge.textColor} onChange={v => updateBadge({ textColor: v })} label="Text" size="sm" />
                                      </div>
                                    </div>
                                  );
                                })()}
                              </>
                            );
                          })()}
                        </div>

                        {/* Card Styling + Preview */}
                        <div style={{ marginBottom: SPACING.lg }}>
                          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                            Card Styling
                          </div>
                          <div style={{ display: 'flex', gap: SPACING.xl, flexWrap: 'wrap' }}>
                            {/* Color pickers */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                              {([
                                { key: 'bg', label: 'Background', defaultVal: '#ffffff' },
                                { key: 'nameColor', label: 'Film Name', defaultVal: '#1a1a1a' },
                                { key: 'tierColor', label: 'Tier Label', defaultVal: '#888888' },
                                { key: 'metricValueColor', label: 'Metric Values', defaultVal: '#d91f26' },
                                { key: 'metricLabelColor', label: 'Metric Labels', defaultVal: '#999999' },
                              ] as const).map(({ key, label, defaultVal }) => {
                                const currentStyles = filmEdits[film.id]?.card_styles !== undefined
                                  ? (filmEdits[film.id]?.card_styles || {})
                                  : (film.card_styles || {});
                                const currentVal = (currentStyles as Record<string, string>)[key] || defaultVal;
                                return (
                                  <ColorPicker key={key} value={currentVal} label={label} size="sm"
                                    onChange={v => {
                                      const prev = filmEdits[film.id]?.card_styles !== undefined
                                        ? (filmEdits[film.id]?.card_styles || {})
                                        : (film.card_styles || {});
                                      updateFilmEdit(film.id, { card_styles: { ...prev, [key]: v } });
                                    }}
                                  />
                                );
                              })}
                              <div style={{ display: 'flex', gap: SPACING.sm, marginTop: 2, flexWrap: 'wrap' }}>
                                <button onClick={() => {
                                  updateFilmEdit(film.id, { card_styles: null });
                                }} style={{
                                  padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                  background: 'transparent', color: COLORS.textMuted,
                                  border: `1px solid ${COLORS.borderInput}`,
                                  fontSize: FONT.sizeXs,
                                }}>
                                  Reset to Defaults
                                </button>
                                <button onClick={() => applyMatchStyle(film.id)} style={{
                                  padding: '3px 10px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                  background: matchStyleApplied ? '#22c55e18' : COLORS.activeBg,
                                  color: matchStyleApplied ? '#22c55e' : COLORS.red,
                                  border: `1px solid ${matchStyleApplied ? '#22c55e40' : `${COLORS.red}40`}`,
                                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                                }}>
                                  {matchStyleApplied ? 'Applied to All' : 'Match Style to All Offered Films'}
                                </button>
                              </div>
                              {matchStyleApplied && (
                                <div style={{
                                  fontSize: FONT.sizeXs, color: COLORS.textMuted, marginTop: SPACING.sm,
                                  padding: `${SPACING.sm}px ${SPACING.md}px`,
                                  background: 'rgba(255,255,255,0.03)', borderRadius: RADIUS.sm,
                                  borderLeft: `3px solid #22c55e`,
                                }}>
                                  Card styles, featured specs, custom metrics, and badge settings have been applied to all offered films. Be sure to update custom metric values for each film accordingly.
                                </div>
                              )}
                            </div>

                            {/* Live per-film preview */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted, marginBottom: 4 }}>Preview</div>
                              <div style={{
                                background: 'transparent', width: 250,
                              }}>
                                {(() => {
                                  // Build a preview film object with current edits applied
                                  const editState = filmEdits[film.id] || {};
                                  const previewFilmObj = {
                                    ...film,
                                    display_name: editState.display_name !== undefined ? editState.display_name : film.display_name,
                                    tier_label: editState.tier_label !== undefined ? editState.tier_label : film.tier_label,
                                    featured_specs: editState.featured_specs !== undefined ? editState.featured_specs : film.featured_specs,
                                    custom_metrics: editState.custom_metrics !== undefined ? editState.custom_metrics : film.custom_metrics,
                                    card_styles: editState.card_styles !== undefined ? editState.card_styles : film.card_styles,
                                    badge: editState.badge !== undefined ? editState.badge : film.badge,
                                    card_image_url: film.card_image_url, // don't override uploaded images in preview
                                  };
                                  const previewFilmShades = filmShades.filter(s => s.film_id === film.id && s.offered);
                                  return (
                                    <FilmCard
                                      film={previewFilmObj as unknown as AutoFilm}
                                      isSelected={false}
                                      onClick={() => {}}
                                      displaySpecs={localSpecs}
                                      filmShades={previewFilmShades as unknown as AutoFilmShade[]}
                                      layout={localLayout}
                                      previewMode
                                      theme={{ primary: String(shopConfig.theme_ext_primary || '#d61f26'), secondary: String(shopConfig.theme_ext_secondary || '#1a1a1a'), accent: String(shopConfig.theme_ext_accent || '#d61f26'), background: String(shopConfig.theme_ext_background || '#ffffff') }}
                                    />
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Image Upload */}
                        <div style={{ marginBottom: SPACING.lg }}>
                          <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                            Custom Card Image
                          </div>
                          {film.card_image_url ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: SPACING.md }}>
                              <div style={{ background: '#fff', borderRadius: RADIUS.md, padding: 6, width: 160 }}>
                                <img src={film.card_image_url} alt="Card preview" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 4 }} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACING.sm }}>
                                <button onClick={async () => {
                                  await fetch('/api/auto/upload-film-card', {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ filmId: film.id }),
                                  });
                                  onRefresh();
                                }} style={{
                                  padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                  background: COLORS.dangerBg || 'rgba(239,68,68,0.1)', color: COLORS.danger || '#ef4444',
                                  border: 'none', fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                                }}>
                                  Remove Image
                                </button>
                                <label style={{
                                  padding: '4px 12px', borderRadius: RADIUS.sm, cursor: 'pointer',
                                  background: COLORS.inputBg, color: COLORS.textMuted,
                                  border: `1px solid ${COLORS.borderInput}`,
                                  fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textAlign: 'center',
                                }}>
                                  Replace
                                  <input type="file" accept=".svg,.png,.jpg,.jpeg" style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const fd = new FormData();
                                      fd.append('file', file);
                                      fd.append('filmId', String(film.id));
                                      await fetch('/api/auto/upload-film-card', { method: 'POST', body: fd });
                                      onRefresh();
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          ) : (
                            <label style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
                              padding: `${SPACING.lg}px`, borderRadius: RADIUS.lg, cursor: 'pointer',
                              border: `2px dashed ${COLORS.borderInput}`, background: 'transparent',
                              transition: 'border-color 0.15s',
                            }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.textMuted} strokeWidth="2" style={{ width: 18, height: 18, flexShrink: 0 }}>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                              </svg>
                              <div>
                                <div style={{ fontSize: FONT.sizeSm, color: COLORS.textSecondary, fontWeight: FONT.weightSemibold }}>
                                  Upload custom card image
                                </div>
                                <div style={{ fontSize: FONT.sizeXs, color: COLORS.textMuted }}>
                                  Recommended: 1000 x 504px -- SVG, PNG, or JPG (max 2MB)
                                </div>
                              </div>
                              <input type="file" accept=".svg,.png,.jpg,.jpeg" style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const fd = new FormData();
                                  fd.append('file', file);
                                  fd.append('filmId', String(film.id));
                                  await fetch('/api/auto/upload-film-card', { method: 'POST', body: fd });
                                  onRefresh();
                                }}
                              />
                            </label>
                          )}
                        </div>

                        <div style={{ fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                          Available Shades
                        </div>
                        <div style={{ display: 'flex', gap: SPACING.sm, flexWrap: 'wrap' }}>
                          {shades.map(shade => (
                            <button key={shade.id} onClick={() => toggleShadeOffered(shade)} style={{
                              padding: '8px 18px', borderRadius: RADIUS.md, cursor: 'pointer',
                              background: shade.offered ? COLORS.activeBg : 'transparent',
                              color: shade.offered ? COLORS.red : COLORS.textTertiary,
                              border: `1px solid ${shade.offered ? `${COLORS.red}40` : 'rgba(255,255,255,0.10)'}`,
                              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
                              opacity: shade.offered ? 1 : 0.6,
                            }}>
                              {shade.shade_label || shade.shade_value}
                            </button>
                          ))}
                        </div>
                        {shades.length === 0 && (
                          <div style={{ fontSize: FONT.sizeSm, color: COLORS.textMuted }}>No shades configured.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DashboardCard>
      )}

      {/* Section 3: Global Pricing Matrix */}
      <DashboardCard
        title="Global Pricing Matrix"
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth="2" style={{ width: 18, height: 18 }}>
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
        }
        actions={
          <div style={{ display: 'flex', gap: SPACING.sm, alignItems: 'center' }}>
            <button onClick={() => setShowPricing(!showPricing)} style={{
              background: showPricing ? COLORS.activeBg : 'transparent',
              color: showPricing ? COLORS.red : COLORS.textMuted,
              border: `1px solid ${showPricing ? COLORS.red : COLORS.borderInput}`,
              borderRadius: RADIUS.md, padding: '6px 14px', cursor: 'pointer',
              fontSize: FONT.sizeSm, fontWeight: FONT.weightSemibold,
            }}>
              {showPricing ? 'Hide Pricing' : 'Show Pricing'}
            </button>
            {Object.keys(pricingEdits).length > 0 && (
              <Button variant="primary" size="sm" onClick={savePricingEdits} disabled={savingPricing}
                style={savedPricing ? { background: '#22c55e', borderColor: '#22c55e' } : {}}>
                {savingPricing ? 'Saving...' : savedPricing ? 'Saved' : `Save ${Object.keys(pricingEdits).length} Changes`}
              </Button>
            )}
          </div>
        }
      >
        {!showPricing ? (
          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, textAlign: 'center', padding: SPACING.lg }}>
            Click "Show Pricing" to view and edit the global pricing matrix for all service classes and films.
          </div>
        ) : offeredFilms.length === 0 ? (
          <div style={{ color: COLORS.textMuted, fontSize: FONT.sizeSm, textAlign: 'center', padding: SPACING.lg }}>
            No films are currently offered. Enable films above to set pricing.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.sizeSm, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '200px' }} />
                {offeredFilms.map(f => <col key={f.id} />)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{
                    padding: `${SPACING.sm}px ${SPACING.md}px`, textAlign: 'left',
                    fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold, textTransform: 'uppercase',
                    color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                    Class
                  </th>
                  {offeredFilms.map(film => (
                    <th key={film.id} style={{
                      padding: `${SPACING.sm}px ${SPACING.md}px`, textAlign: 'center',
                      fontSize: FONT.sizeXs, fontWeight: FONT.weightSemibold,
                      color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}`,
                    }}>
                      {film.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* All services rendered as sections within one table */}
                {(() => {
                  // Reorder: TWO_FRONT_DOORS first, then FULL_SIDES, then rest
                  const reordered = [...primaryServices].sort((a, b) => {
                    if (a.service_key === 'TWO_FRONT_DOORS') return -1;
                    if (b.service_key === 'TWO_FRONT_DOORS') return 1;
                    return 0;
                  });
                  const addonServices = services.filter(s => s.is_addon && s.service_type === 'tint');
                  const removalServices = services.filter(s => s.service_type === 'removal');
                  const alacarteServices = services.filter(s => s.service_type === 'alacarte');
                  const allSections = [
                    ...reordered.map(s => ({ ...s, _section: 'primary' })),
                    ...addonServices.map(s => ({ ...s, _section: 'addon' })),
                    ...alacarteServices.map(s => ({ ...s, _section: 'alacarte' })),
                    ...removalServices.map(s => ({ ...s, _section: 'removal' })),
                  ];
                  let lastSection = '';
                  return allSections;
                })().map((svc, svcIdx, allSvcs) => {
                  const section = (svc as { _section: string })._section;
                  const addonServices = services.filter(s => s.is_addon && s.service_type === 'tint');
                  const removalServices = services.filter(s => s.service_type === 'removal');
                  const alacarteServices = services.filter(s => s.service_type === 'alacarte');
                  const isFirstAddon = addonServices.length > 0 && svc.service_key === addonServices[0].service_key;
                  const isFirstRemoval = removalServices.length > 0 && svc.service_key === removalServices[0].service_key;
                  const isFirstAlacarte = alacarteServices.length > 0 && svc.service_key === alacarteServices[0].service_key;
                  const isRemoval = section === 'removal';
                  const isAlacarte = section === 'alacarte';
                  // Get rows for this service: class-specific + wildcard
                  const classRows = isRemoval
                    ? vehicleClasses.filter(vc => getPrice(vc.class_key, svc.service_key, null) !== null)
                    : vehicleClasses.filter(vc => offeredFilms.some(f => getPrice(vc.class_key, svc.service_key, f.id) !== null));
                  const hasWildcard = isRemoval
                    ? getPrice('*', svc.service_key, null) !== null
                    : offeredFilms.some(f => getPrice('*', svc.service_key, f.id) !== null);

                  if (classRows.length === 0 && !hasWildcard) return null;

                  return [
                    // Section header + spacer (only for services with class rows)
                    ...(classRows.length > 0 ? [
                      <tr key={`spacer-${svc.service_key}`}>
                        <td colSpan={offeredFilms.length + 1} style={{ padding: `${SPACING.md}px 0 0`, border: 'none' }} />
                      </tr>,
                      <tr key={`header-${svc.service_key}`}>
                        <td
                          colSpan={offeredFilms.length + 1}
                          style={{
                            padding: `${SPACING.sm}px ${SPACING.md}px`,
                            fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary,
                            borderBottom: `1px solid ${COLORS.border}`,
                          }}
                        >
                          {svc.label}
                        </td>
                      </tr>,
                    ] : [
                      // Section headers for add-ons, removals, a la carte
                      ...((isFirstAddon || isFirstRemoval || isFirstAlacarte) ? [
                        <tr key={`${section}-spacer`}>
                          <td colSpan={offeredFilms.length + 1} style={{ padding: `${SPACING.md}px 0 0`, border: 'none' }} />
                        </tr>,
                        <tr key={`${section}-header`}>
                          <td
                            colSpan={offeredFilms.length + 1}
                            style={{
                              padding: `${SPACING.sm}px ${SPACING.md}px`,
                              fontSize: FONT.sizeLg, fontWeight: FONT.weightBold, color: COLORS.textPrimary,
                              borderBottom: `1px solid ${COLORS.border}`,
                            }}
                          >
                            {isFirstAddon ? 'Add-Ons' : isFirstRemoval ? 'Removals' : 'A La Carte'}
                          </td>
                        </tr>,
                      ] : [
                        <tr key={`spacer-${svc.service_key}`}>
                          <td colSpan={offeredFilms.length + 1} style={{ padding: `${SPACING.sm}px 0 0`, border: 'none' }} />
                        </tr>,
                      ]),
                    ]),

                    // Class rows
                    ...classRows.map(vc => (
                      <tr key={`${svc.service_key}-${vc.class_key}`}>
                        <td style={{
                          padding: `${SPACING.sm}px ${SPACING.md}px`,
                          color: COLORS.textSecondary, borderBottom: `1px solid ${COLORS.border}`,
                          fontWeight: FONT.weightSemibold,
                        }}>
                          {vc.name}
                        </td>
                        {isRemoval ? (
                          // Removals: single flat price aligned to first film column
                          <>
                            <td style={{
                              padding: `${SPACING.xs}px ${SPACING.sm}px`,
                              textAlign: 'center', borderBottom: `1px solid ${COLORS.border}`,
                            }}>
                              {(() => {
                                const editKey = `${vc.class_key}|${svc.service_key}|null`;
                                const currentPrice = getPrice(vc.class_key, svc.service_key, null);
                                const editValue = pricingEdits[editKey];
                                const isEdited = editValue !== undefined;
                                return (
                                  <input
                                    type="number"
                                    value={isEdited ? editValue : (currentPrice !== null ? String(currentPrice) : '')}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (currentPrice !== null && val === String(currentPrice)) {
                                        setPricingEdits(prev => { const next = { ...prev }; delete next[editKey]; return next; });
                                      } else {
                                        setPricingEdits(prev => ({ ...prev, [editKey]: val }));
                                      }
                                    }}
                                    placeholder={currentPrice !== null ? String(currentPrice) : '0'}
                                    style={{
                                      width: '100%', maxWidth: 80, background: COLORS.inputBg,
                                      color: COLORS.textPrimary, textAlign: 'center',
                                      border: `1px solid ${isEdited ? COLORS.red : COLORS.borderInput}`,
                                      borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeSm,
                                    }}
                                  />
                                );
                              })()}
                            </td>
                            {offeredFilms.slice(1).map(f => (
                              <td key={f.id} style={{ borderBottom: `1px solid ${COLORS.border}` }} />
                            ))}
                          </>
                        ) : offeredFilms.map(film => {
                          const editKey = `${vc.class_key}|${svc.service_key}|${film.id}`;
                          const currentPrice = getPrice(vc.class_key, svc.service_key, film.id);
                          const editValue = pricingEdits[editKey];
                          const isEdited = editValue !== undefined;
                          return (
                            <td key={film.id} style={{
                              padding: `${SPACING.xs}px ${SPACING.sm}px`,
                              textAlign: 'center', borderBottom: `1px solid ${COLORS.border}`,
                            }}>
                              <input
                                type="number"
                                value={isEdited ? editValue : (currentPrice !== null ? String(currentPrice) : '')}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (currentPrice !== null && val === String(currentPrice)) {
                                    setPricingEdits(prev => { const next = { ...prev }; delete next[editKey]; return next; });
                                  } else {
                                    setPricingEdits(prev => ({ ...prev, [editKey]: val }));
                                  }
                                }}
                                placeholder={currentPrice !== null ? String(currentPrice) : '0'}
                                style={{
                                  width: '100%', maxWidth: 80, background: COLORS.inputBg,
                                  color: COLORS.textPrimary, textAlign: 'center',
                                  border: `1px solid ${isEdited ? COLORS.red : COLORS.borderInput}`,
                                  borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeSm,
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    )),

                    // Wildcard row
                    ...(hasWildcard ? [(
                      <tr key={`${svc.service_key}-wildcard`}>
                        <td style={{
                          padding: `${SPACING.sm}px ${SPACING.md}px`,
                          color: COLORS.textSecondary, borderBottom: `1px solid ${COLORS.border}`,
                          fontWeight: FONT.weightSemibold,
                        }}>
                          {classRows.length === 0 ? svc.label : 'All Vehicles'}
                        </td>
                        {isRemoval ? (
                          <>
                            <td style={{
                              padding: `${SPACING.xs}px ${SPACING.sm}px`,
                              textAlign: 'center', borderBottom: `1px solid ${COLORS.border}`,
                            }}>
                              {(() => {
                                const editKey = `*|${svc.service_key}|null`;
                                const currentPrice = getPrice('*', svc.service_key, null);
                                const editValue = pricingEdits[editKey];
                                const isEdited = editValue !== undefined;
                                return (
                                  <input
                                    type="number"
                                    value={isEdited ? editValue : (currentPrice !== null ? String(currentPrice) : '')}
                                    onChange={e => {
                                      const val = e.target.value;
                                      if (currentPrice !== null && val === String(currentPrice)) {
                                        setPricingEdits(prev => { const next = { ...prev }; delete next[editKey]; return next; });
                                      } else {
                                        setPricingEdits(prev => ({ ...prev, [editKey]: val }));
                                      }
                                    }}
                                    placeholder={currentPrice !== null ? String(currentPrice) : '0'}
                                    style={{
                                      width: '100%', maxWidth: 80, background: COLORS.inputBg,
                                      color: COLORS.textPrimary, textAlign: 'center',
                                      border: `1px solid ${isEdited ? COLORS.red : COLORS.borderInput}`,
                                      borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeSm,
                                    }}
                                  />
                                );
                              })()}
                            </td>
                            {offeredFilms.slice(1).map(f => (
                              <td key={f.id} style={{ borderBottom: `1px solid ${COLORS.border}` }} />
                            ))}
                          </>
                        ) : offeredFilms.map(film => {
                          const editKey = `*|${svc.service_key}|${film.id}`;
                          const currentPrice = getPrice('*', svc.service_key, film.id);
                          const editValue = pricingEdits[editKey];
                          const isEdited = editValue !== undefined;
                          return (
                            <td key={film.id} style={{
                              padding: `${SPACING.xs}px ${SPACING.sm}px`,
                              textAlign: 'center', borderBottom: `1px solid ${COLORS.border}`,
                            }}>
                              <input
                                type="number"
                                value={isEdited ? editValue : (currentPrice !== null ? String(currentPrice) : '')}
                                onChange={e => {
                                  const val = e.target.value;
                                  if (currentPrice !== null && val === String(currentPrice)) {
                                    setPricingEdits(prev => { const next = { ...prev }; delete next[editKey]; return next; });
                                  } else {
                                    setPricingEdits(prev => ({ ...prev, [editKey]: val }));
                                  }
                                }}
                                placeholder={currentPrice !== null ? String(currentPrice) : '0'}
                                style={{
                                  width: '100%', maxWidth: 80, background: COLORS.inputBg,
                                  color: COLORS.textPrimary, textAlign: 'center',
                                  border: `1px solid ${isEdited ? COLORS.red : COLORS.borderInput}`,
                                  borderRadius: RADIUS.sm, padding: '4px 6px', fontSize: FONT.sizeSm,
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    )] : []),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
