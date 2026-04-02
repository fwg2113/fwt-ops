// ============================================================================
// DASHBOARD DESIGN TOKENS
// Computed from 5 theme inputs: primary, accent, background, surface, text
// All ~25 color values derive from these 5 — nothing else to configure
// ============================================================================

// --- Theme input type ---
export interface ThemeInput {
  primary: string;   // Active states, toggles, buttons (default: #dc2626 red)
  accent: string;    // Sidebar borders, highlights (default: #f59e0b yellow)
  background: string; // Page bg, sidebar bg (default: #111111)
  surface: string;   // Card bg (default: #1a1a1a)
  text: string;      // Primary text (default: #f1f5f9)
}

// --- Default theme (current FWT dashboard) ---
export const DEFAULT_THEME: ThemeInput = {
  primary: '#dc2626',
  accent: '#f59e0b',
  background: '#111111',
  surface: '#1a1a1a',
  text: '#f1f5f9',
};

// --- Color utilities ---
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
}

// --- Luminance: 0 = black, 1 = white ---
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// --- Adaptive offset: lightens dark colors, darkens light colors ---
// Adds cool/blue tint to darkened results for a polished gray
function adaptiveOffset(hex: string, amount: number): string {
  const lum = luminance(hex);
  if (lum > 0.5) {
    // Light surface — darken instead of lighten
    const { r, g, b } = hexToRgb(hex);
    const nr = Math.max(0, Math.round(r - r * amount));
    const ng = Math.max(0, Math.round(g - g * (amount * 1.02)));
    const nb = Math.max(0, Math.round(b - b * (amount * 0.95)));
    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
  }
  // Dark surface — lighten with cool blue tint (original behavior, slightly boosted)
  const { r, g, b } = hexToRgb(hex);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * (amount * 1.05)));
  const nb = Math.min(255, Math.round(b + (255 - b) * (amount * 1.15)));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

// --- Compute full color palette from 5 inputs ---
export function buildColors(t: ThemeInput) {
  const isLight = luminance(t.surface) > 0.5;

  return {
    // Backgrounds
    pageBg: t.background,
    cardBg: t.surface,
    inputBg: adaptiveOffset(t.surface, 0.06),
    hoverBg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    activeBg: rgba(t.primary, 0.08),

    // Borders
    border: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)',
    borderInput: adaptiveOffset(t.surface, 0.18),
    borderAccent: rgba(t.accent, 0.35),
    borderAccentSolid: t.accent,

    // Brand
    red: t.primary,
    redHover: darken(t.primary, 0.15),
    yellow: rgba(t.accent, 0.35),
    yellowSolid: t.accent,

    // Status (semantic — stay fixed)
    success: '#22c55e',
    successBg: 'rgba(34,197,94,0.1)',
    warning: '#f59e0b',
    warningBg: 'rgba(245,158,11,0.1)',
    danger: '#ef4444',
    dangerBg: 'rgba(239,68,68,0.1)',
    info: '#22d3ee',
    infoBg: 'rgba(34,211,238,0.1)',

    // Text — derive from primary text with cool-tinted desaturation
    textPrimary: t.text,
    textSecondary: darken(t.text, 0.06),
    textTertiary: adaptiveOffset(darken(t.text, 0.40), 0),
    textMuted: adaptiveOffset(darken(t.text, 0.56), 0),
    textPlaceholder: adaptiveOffset(darken(t.text, 0.70), 0),
  };
}

// --- Dynamic COLORS that read from CSS variables set by ThemeProvider ---
// Falls back to DEFAULT_THEME values when CSS vars aren't available (SSR, non-dashboard)
const d = buildColors(DEFAULT_THEME);

export const COLORS = {
  // Backgrounds
  pageBg: `var(--dash-page-bg, ${d.pageBg})`,
  cardBg: `var(--dash-card-bg, ${d.cardBg})`,
  inputBg: `var(--dash-input-bg, ${d.inputBg})`,
  hoverBg: `var(--dash-hover-bg, ${d.hoverBg})`,
  activeBg: `var(--dash-active-bg, ${d.activeBg})`,

  // Borders
  border: `var(--dash-border, ${d.border})`,
  borderInput: `var(--dash-border-input, ${d.borderInput})`,
  borderAccent: `var(--dash-border-accent, ${d.borderAccent})`,
  borderAccentSolid: `var(--dash-border-accent-solid, ${d.borderAccentSolid})`,

  // Brand
  red: `var(--dash-red, ${d.red})`,
  redHover: `var(--dash-red-hover, ${d.redHover})`,
  yellow: `var(--dash-yellow, ${d.yellow})`,
  yellowSolid: `var(--dash-yellow-solid, ${d.yellowSolid})`,

  // Status (fixed — not theme-dependent)
  success: d.success,
  successBg: d.successBg,
  warning: d.warning,
  warningBg: d.warningBg,
  danger: d.danger,
  dangerBg: d.dangerBg,
  info: d.info,
  infoBg: d.infoBg,

  // Text
  textPrimary: `var(--dash-text-primary, ${d.textPrimary})`,
  textSecondary: `var(--dash-text-secondary, ${d.textSecondary})`,
  textTertiary: `var(--dash-text-tertiary, ${d.textTertiary})`,
  textMuted: `var(--dash-text-muted, ${d.textMuted})`,
  textPlaceholder: `var(--dash-text-placeholder, ${d.textPlaceholder})`,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  modal: 20,
} as const;

export const FONT = {
  sizeXs: '0.6875rem',   // 11px
  sizeSm: '0.75rem',      // 12px
  sizeMd: '0.8125rem',    // 13px
  sizeBase: '0.875rem',   // 14px
  sizeLg: '1rem',         // 16px
  sizeXl: '1.0625rem',    // 17px
  sizeTitle: '1.25rem',   // 20px
  sizePageTitle: '1.75rem', // 28px

  weightNormal: 400,
  weightMedium: 500,
  weightSemibold: 600,
  weightBold: 700,
} as const;
