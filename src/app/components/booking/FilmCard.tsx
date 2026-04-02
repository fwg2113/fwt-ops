'use client';

import React from 'react';
import type { AutoFilm, AutoFilmShade } from './types';

interface Props {
  film: AutoFilm;
  isSelected: boolean;
  onClick: () => void;
  saveBadge?: string | null;
  isMostPopular?: boolean;
  displaySpecs?: string[];
  filmShades?: AutoFilmShade[];
  layout?: 'classic' | 'horizontal' | 'minimal';
  previewMode?: boolean;
  theme?: { primary: string; secondary: string; accent: string; background: string };
}

// Spec display configuration
interface SpecDef {
  shortLabel: string;
  getShadeValue: (s: AutoFilmShade) => number | null;
  getFilmFallback?: (f: AutoFilm) => string | null;
  formatDisplay: (v: number | null, fallback?: string | null) => { value: string; suffix: string };
}

const SPEC_CONFIG: Record<string, SpecDef> = {
  irer: {
    shortLabel: 'IR',
    getShadeValue: s => s.irer,
    getFilmFallback: f => {
      if (!f.ir_rejection || f.ir_rejection.includes('TSER')) return null;
      return f.ir_rejection;
    },
    formatDisplay: (v, fb) => {
      const num = v ? String(Math.round(v)) : (fb ? fb.replace(/[^0-9]/g, '') || '--' : '--');
      return { value: num, suffix: num !== '--' ? '%' : '' };
    },
  },
  tser: {
    shortLabel: 'TSER',
    getShadeValue: s => s.tser,
    formatDisplay: v => ({
      value: v ? String(Math.round(v)) : '--',
      suffix: v ? '%' : '',
    }),
  },
  uv_rejection: {
    shortLabel: 'UV',
    getShadeValue: s => {
      if (!s.uv_rejection) return null;
      const match = s.uv_rejection.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : null;
    },
    formatDisplay: v => ({
      value: v ? (v >= 99 ? '99' : String(Math.round(v))) : '--',
      suffix: v ? (v >= 99 ? '+%' : '%') : '',
    }),
  },
  glare_reduction: {
    shortLabel: 'Glare',
    getShadeValue: s => s.glare_reduction,
    formatDisplay: v => ({
      value: v ? String(Math.round(v)) : '--',
      suffix: v ? '%' : '',
    }),
  },
  sirr: {
    shortLabel: 'SIRR',
    getShadeValue: s => s.sirr,
    formatDisplay: v => ({
      value: v ? String(Math.round(v)) : '--',
      suffix: v ? '%' : '',
    }),
  },
  vlr: {
    shortLabel: 'VLR',
    getShadeValue: s => s.vlr,
    formatDisplay: v => ({
      value: v ? String(Math.round(v)) : '--',
      suffix: v ? '%' : '',
    }),
  },
};

function getBestSpecDisplay(
  spec: SpecDef,
  shades: AutoFilmShade[],
  film: AutoFilm
): { value: string; suffix: string } {
  if (!shades || shades.length === 0) {
    const fb = spec.getFilmFallback?.(film);
    return spec.formatDisplay(null, fb);
  }
  const values = shades.map(s => spec.getShadeValue(s)).filter((v): v is number => v !== null);
  if (values.length === 0) {
    const fb = spec.getFilmFallback?.(film);
    return spec.formatDisplay(null, fb);
  }
  return spec.formatDisplay(Math.max(...values));
}

// Resolve display values from props + config
function useCardData(props: Props) {
  const {
    film, displaySpecs, filmShades, layout,
  } = props;
  const shades = filmShades || [];
  const specs = film.featured_specs || displaySpecs || ['irer', 'tser', 'uv_rejection'];
  const tierLabel = film.tier_label || '';
  const filmName = film.display_name || film.name;
  const cardLayout = layout || 'classic';

  // Custom metrics go first, then standard specs fill remaining slots (up to 3 total)
  const customMetrics = (film.custom_metrics || []).map((cm, i) => ({
    key: `custom_${i}`,
    label: cm.label,
    value: cm.value,
    suffix: '',
  }));

  const remainingSlots = 3 - customMetrics.length;
  const standardMetrics = remainingSlots > 0
    ? specs.slice(0, remainingSlots).map(specKey => {
        const specDef = SPEC_CONFIG[specKey];
        if (!specDef) return null;
        const display = getBestSpecDisplay(specDef, shades, film);
        return { key: specKey, label: specDef.shortLabel, ...display };
      }).filter(Boolean) as Array<{ key: string; label: string; value: string; suffix: string }>
    : [];

  const metrics = [...customMetrics, ...standardMetrics].slice(0, 3);

  // Card styles: per-film overrides > global theme > hardcoded defaults
  const t = props.theme;
  const styles = {
    bg: film.card_styles?.bg || t?.background || '#ffffff',
    nameColor: film.card_styles?.nameColor || t?.secondary || '#1a1a1a',
    tierColor: film.card_styles?.tierColor || '#888888',
    metricValueColor: film.card_styles?.metricValueColor || t?.primary || '#d91f26',
    metricLabelColor: film.card_styles?.metricLabelColor || '#999999',
  };

  return { tierLabel, filmName, cardLayout, metrics, styles };
}

// Inline styles that replicate the booking page CSS (.fwt-pill .film-pill)
// Used in previewMode so the card looks identical outside the booking page context
const PREVIEW_PILL_STYLE: React.CSSProperties = {
  background: '#ffffff',
  border: '2px solid #d0d0d0',
  borderRadius: 20,
  padding: 10,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 'auto',
  gap: 0,
  textAlign: 'center',
  font: 'inherit',
};

// Badge pill style — positioned outside the card, centered
const BADGE_BASE_STYLE: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  padding: '4px 14px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  textTransform: 'uppercase',
  letterSpacing: '0.3px',
  lineHeight: 1.2,
};

export default function FilmCard(props: Props) {
  const { film, isSelected, onClick, saveBadge, previewMode, theme } = props;
  const { tierLabel, filmName, cardLayout, metrics, styles } = useCardData(props);

  const defaultBg = theme?.background || '#ffffff';
  const bgOverride = !film.card_image_url && styles.bg !== defaultBg ? styles.bg : undefined;
  const ringColor = theme?.primary || '#d61f26';
  const badge = film.badge?.enabled ? film.badge : null;
  const topBadge = badge?.position === 'top' ? badge : null;
  const bottomBadge = badge?.position === 'bottom' ? badge : null;

  const renderBadge = (b: NonNullable<typeof badge>, isPreview: boolean) => {
    const badgeStyle: React.CSSProperties = {
      ...BADGE_BASE_STYLE,
      background: b.bgColor || '#d91f26',
      color: b.textColor || '#ffffff',
    };
    if (isPreview) {
      return (
        <div style={{ textAlign: 'center', margin: '6px 0' }}>
          <span style={badgeStyle}>{b.text || 'MOST POPULAR'}</span>
        </div>
      );
    }
    return null; // Live mode uses CSS classes
  };

  return (
    <div
      className={previewMode ? undefined : 'pill-wrap'}
      style={previewMode ? { display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' } : undefined}
    >
      {/* Top badge */}
      {previewMode && topBadge && renderBadge(topBadge, true)}
      {!previewMode && saveBadge && (
        <span className="pill-flag">{saveBadge}</span>
      )}
      {!previewMode && topBadge && (
        <span
          className="pill-flag"
          style={{ background: topBadge.bgColor || '#d91f26', color: topBadge.textColor || '#ffffff', borderRadius: 999 }}
        >
          {topBadge.text || 'MOST POPULAR'}
        </span>
      )}
      <button
        type="button"
        className={previewMode ? undefined : `fwt-pill film-pill${isSelected ? ' is-selected' : ''}`}
        onClick={onClick}
        style={previewMode
          ? {
              ...PREVIEW_PILL_STYLE,
              background: bgOverride || styles.bg,
              borderColor: isSelected ? ringColor : '#d0d0d0',
              borderWidth: isSelected ? 3 : 2,
            }
          : bgOverride ? { background: bgOverride } : undefined
        }
      >
        {film.card_image_url ? (
          <img
            src={film.card_image_url}
            alt={filmName}
            style={previewMode ? { width: '100%', height: 'auto', display: 'block' } : undefined}
            className={previewMode ? undefined : 'film-svg'}
            loading="lazy"
          />
        ) : (
          <div style={{
            padding: '10px 6px 8px', width: '100%', textAlign: 'center',
            display: 'flex', flexDirection: 'column',
            aspectRatio: '1000 / 504',
          }}>
            {cardLayout === 'horizontal' ? (
              <HorizontalLayout tierLabel={tierLabel} filmName={filmName} metrics={metrics} styles={styles} />
            ) : cardLayout === 'minimal' ? (
              <MinimalLayout tierLabel={tierLabel} filmName={filmName} metrics={metrics} styles={styles} />
            ) : (
              <ClassicLayout tierLabel={tierLabel} filmName={filmName} metrics={metrics} styles={styles} />
            )}
          </div>
        )}
      </button>
      {/* Bottom badge */}
      {previewMode && bottomBadge && renderBadge(bottomBadge, true)}
      {!previewMode && bottomBadge && (
        <span
          className="pill-flag bottom-center"
          style={{ background: bottomBadge.bgColor || '#d91f26', color: bottomBadge.textColor || '#ffffff', borderRadius: 999 }}
        >
          {bottomBadge.text || 'MOST POPULAR'}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Layout: Classic — tier top, name center, divider, 3 metrics bottom
// ============================================================================
function ClassicLayout({ tierLabel, filmName, metrics, styles }: LayoutProps) {
  return (
    <>
      <div style={{
        fontSize: '0.55rem', fontWeight: 700, color: styles.tierColor,
        textTransform: 'uppercase', letterSpacing: '1px',
      }}>
        {tierLabel}
      </div>
      <div style={{
        fontSize: '1.3rem', fontWeight: 800, color: styles.nameColor,
        lineHeight: 1.15, margin: '6px 0', flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {filmName}
      </div>
      <div style={{ height: 1, background: '#e0e0e0', margin: '4px 0 6px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-around', gap: 2 }}>
        {metrics.map(m => (
          <Metric key={m.key} label={m.label} value={m.value} suffix={m.suffix}
            valueColor={styles.metricValueColor} labelColor={styles.metricLabelColor} />
        ))}
      </div>
    </>
  );
}

// ============================================================================
// Layout: Horizontal — name large left, metrics stacked right
// ============================================================================
function HorizontalLayout({ tierLabel, filmName, metrics, styles }: LayoutProps) {
  const nameLen = filmName.length;
  const nameFontSize = nameLen > 16 ? '0.75rem' : nameLen > 12 ? '0.9rem' : '1.05rem';

  return (
    <>
      {/* Tier label — top center */}
      <div style={{
        fontSize: '0.5rem', fontWeight: 700, color: styles.tierColor,
        textTransform: 'uppercase', letterSpacing: '0.8px', textAlign: 'center',
      }}>
        {tierLabel}
      </div>

      {/* Name left + Metrics right */}
      <div style={{
        display: 'flex', flex: 1, alignItems: 'center', gap: 6,
        padding: '0 4px', overflow: 'hidden',
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{
            fontSize: nameFontSize, fontWeight: 800, color: styles.nameColor,
            lineHeight: 1.2, textAlign: 'left',
          }}>
            {filmName}
          </div>
        </div>
        <div style={{
          flex: '0 0 auto',
          display: 'grid', gridTemplateColumns: 'auto auto', gap: '3px 5px',
          alignItems: 'baseline',
          borderLeft: '1px solid #e0e0e0', paddingLeft: 6,
        }}>
          {metrics.map(m => (
            <React.Fragment key={m.key}>
              <span style={{ fontSize: '0.45rem', fontWeight: 600, color: styles.metricLabelColor, textTransform: 'uppercase', textAlign: 'right' }}>
                {m.label}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: styles.metricValueColor, lineHeight: 1 }}>
                {m.value}
                <span style={{ fontSize: '0.45rem', fontWeight: 600, color: styles.metricValueColor }}>{m.suffix}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

// ============================================================================
// Layout: Minimal — large name centered, single headline metric below
// ============================================================================
function MinimalLayout({ tierLabel, filmName, metrics, styles }: LayoutProps) {
  const primary = metrics[0];
  return (
    <>
      <div style={{
        fontSize: '0.5rem', fontWeight: 700, color: styles.tierColor,
        textTransform: 'uppercase', letterSpacing: '1px',
      }}>
        {tierLabel}
      </div>
      <div style={{
        fontSize: '1.5rem', fontWeight: 800, color: styles.nameColor,
        lineHeight: 1.1, flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {filmName}
      </div>
      {primary && (
        <div style={{ marginTop: 4 }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: styles.metricValueColor }}>
            {primary.value}
            <span style={{ fontSize: '0.6rem', fontWeight: 600, color: styles.metricValueColor }}>{primary.suffix}</span>
          </span>
          <span style={{ fontSize: '0.55rem', fontWeight: 600, color: styles.metricLabelColor, marginLeft: 4, textTransform: 'uppercase' }}>
            {primary.label}
          </span>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Shared types and Metric component
// ============================================================================
interface CardStyles {
  bg: string;
  nameColor: string;
  tierColor: string;
  metricValueColor: string;
  metricLabelColor: string;
}

interface LayoutProps {
  tierLabel: string;
  filmName: string;
  metrics: Array<{ key: string; label: string; value: string; suffix: string }>;
  styles: CardStyles;
}

function Metric({ label, value, suffix, valueColor = '#d91f26', labelColor = '#999' }: {
  label: string; value: string; suffix?: string; valueColor?: string; labelColor?: string;
}) {
  const isTextValue = isNaN(Number(value)) && value !== '--';
  return (
    <div style={{ textAlign: 'center', minWidth: 0, flex: 1 }}>
      <div style={{
        fontSize: isTextValue ? '0.79rem' : '1.06rem',
        fontWeight: 800,
        color: valueColor,
        lineHeight: 1.1,
      }}>
        {value}
        {suffix && <span style={{ fontSize: '0.59rem', fontWeight: 600, color: valueColor }}>{suffix}</span>}
      </div>
      <div style={{
        fontSize: '0.59rem', fontWeight: 600, color: labelColor,
        textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: 1,
      }}>
        {label}
      </div>
    </div>
  );
}
