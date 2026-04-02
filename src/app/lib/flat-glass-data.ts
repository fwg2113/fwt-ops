/**
 * FWT Flat Glass Estimator - Data Constants
 * Ported from legacy flatglass-estimator.js
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CONFIG = {
  PHONE: '240-415-8527',
  DEPOSIT_PERCENT: 50,

  FEE_TIERS: [
    { maxMiles: 20, fee: 100 },
    { maxMiles: 30, fee: 150 },
    { maxMiles: 50, fee: 250 },
    { maxMiles: Infinity, fee: null }, // 51+ = request only
  ] as const,

  WINDOW_DISCOUNT_TIERS: [
    { minPanes: 1, discount: 0 },
    { minPanes: 6, discount: 1 },
    { minPanes: 12, discount: 2 },
    { minPanes: 18, discount: 3 },
    { minPanes: 24, discount: 4 },
  ] as const,
}

// ============================================================================
// FILM DATA
// ============================================================================

export interface FilmDataEntry {
  filmId: string
  displayName: string
  category: string
  shadeVLT: number
  shadeLabel: string
  heatReduction: number
  glareReduction: number
  uvProtection: number
  privacyRating: number
  appearanceInterior: string
  appearanceExterior: string
  shortTagline: string
  sortOrder: number
  warmCoolVariant: string
  ratings: { heat: number; glare: number; privacy: number; light: number; neutral: number }
  filters: string[]
  swatchClass: string
  hasSimulator?: boolean
  isMostPopular?: boolean
}

export const FILM_DATA: Record<string, FilmDataEntry> = {
  neutral_clear: {
    filmId: 'neutral_clear',
    displayName: 'Neutral Clear',
    category: 'Neutral',
    shadeVLT: 60,
    shadeLabel: '60 (Bright)',
    heatReduction: 40,
    glareReduction: 20,
    uvProtection: 99,
    privacyRating: 1,
    appearanceInterior: 'Neutral',
    appearanceExterior: 'Neutral',
    shortTagline: 'Virtually invisible protection',
    sortOrder: 6,
    warmCoolVariant: 'None',
    ratings: { heat: 2, glare: 1, privacy: 1, light: 6, neutral: 6 },
    filters: ['C'],
    swatchClass: 'neutral-clear',
  },
  neutral_smoke: {
    filmId: 'neutral_smoke',
    displayName: 'Neutral Smoke',
    category: 'Neutral',
    shadeVLT: 40,
    shadeLabel: '40 (Slight Tint)',
    heatReduction: 55,
    glareReduction: 40,
    uvProtection: 99,
    privacyRating: 2,
    appearanceInterior: 'Neutral',
    appearanceExterior: 'Neutral',
    shortTagline: 'Subtle tint, natural look',
    sortOrder: 5,
    warmCoolVariant: 'None',
    ratings: { heat: 3, glare: 3, privacy: 2, light: 4, neutral: 5 },
    filters: ['B', 'C'],
    swatchClass: 'neutral-smoke',
  },
  neutral_dark: {
    filmId: 'neutral_dark',
    displayName: 'Neutral Dark',
    category: 'Neutral',
    shadeVLT: 35,
    shadeLabel: '35 (Dark)',
    heatReduction: 64,
    glareReduction: 75,
    uvProtection: 99,
    privacyRating: 2,
    appearanceInterior: 'Neutral',
    appearanceExterior: 'Neutral',
    shortTagline: 'Dark but natural appearance',
    sortOrder: 4,
    warmCoolVariant: 'None',
    ratings: { heat: 4, glare: 4, privacy: 3, light: 3, neutral: 4 },
    filters: ['B'],
    swatchClass: 'neutral-dark',
  },
  privacy_pro: {
    filmId: 'privacy_pro',
    displayName: 'Privacy Pro',
    category: 'Privacy',
    shadeVLT: 35,
    shadeLabel: '35 (Standard)',
    heatReduction: 71,
    glareReduction: 84,
    uvProtection: 99,
    privacyRating: 3,
    appearanceInterior: 'Natural Warm Look or Crisp Cool Look',
    appearanceExterior: 'Subtle Reflective',
    shortTagline: 'Great balance of privacy & light',
    sortOrder: 3,
    warmCoolVariant: 'Warm or Cool',
    ratings: { heat: 4, glare: 4, privacy: 4, light: 3, neutral: 2 },
    filters: ['B'],
    swatchClass: 'privacy-pro',
    hasSimulator: true,
  },
  privacy_pro_plus: {
    filmId: 'privacy_pro_plus',
    displayName: 'Privacy Pro +',
    category: 'Privacy',
    shadeVLT: 25,
    shadeLabel: '25 (Dark)',
    heatReduction: 82,
    glareReduction: 89,
    uvProtection: 99,
    privacyRating: 4,
    appearanceInterior: 'Natural Warm Look or Crisp Cool Look',
    appearanceExterior: 'Subtle Reflective',
    shortTagline: 'Strong privacy & heat control',
    sortOrder: 2,
    warmCoolVariant: 'Warm or Cool',
    ratings: { heat: 5, glare: 5, privacy: 5, light: 2, neutral: 2 },
    filters: ['A', 'B'],
    swatchClass: 'privacy-pro-plus',
    hasSimulator: true,
    isMostPopular: true,
  },
  privacy_pro_max: {
    filmId: 'privacy_pro_max',
    displayName: 'Privacy Pro Max',
    category: 'Privacy',
    shadeVLT: 15,
    shadeLabel: '15 (Darkest)',
    heatReduction: 82,
    glareReduction: 89,
    uvProtection: 99,
    privacyRating: 5,
    appearanceInterior: 'Natural Warm Look or Crisp Cool Look',
    appearanceExterior: 'Subtle Reflective',
    shortTagline: 'Maximum privacy & performance',
    sortOrder: 1,
    warmCoolVariant: 'Warm or Cool',
    ratings: { heat: 6, glare: 6, privacy: 6, light: 1, neutral: 1 },
    filters: ['A'],
    swatchClass: 'privacy-pro-max',
    hasSimulator: true,
  },
}

// Films in the selector (ordered darkest to lightest)
export const SELECTOR_FILMS = [
  'privacy_pro_max',
  'privacy_pro_plus',
  'privacy_pro',
  'neutral_dark',
  'neutral_smoke',
  'neutral_clear',
]

// Legacy V1 films for recommendation engine
export const V1_FILMS = ['neutral_clear', 'neutral_smoke', 'privacy_pro', 'privacy_pro_plus']

// ============================================================================
// FILTER DEFINITIONS
// ============================================================================

export const FILTER_DEFINITIONS: Record<string, { title: string; desc: string; features: string[] }> = {
  A: {
    title: 'Max Performance',
    desc: "Appearance doesn't matter - I want the best results!",
    features: ['Best Privacy', 'Best Heat Rejection', 'Best Glare Reduction'],
  },
  B: {
    title: 'Balanced',
    desc: 'I want good performance but appearance also matters',
    features: ['Good Privacy', 'Good Heat/Glare', 'Moderate Appearance'],
  },
  C: {
    title: 'Keep It Subtle',
    desc: "Neutral look is the priority - I'll accept moderate performance",
    features: ['Most Natural Look', 'Moderate Protection', 'Maximum Light'],
  },
}

// ============================================================================
// DECORATIVE FILMS
// ============================================================================

export interface DecorativeFilm {
  code: string
  name: string
  category: string
  popular: boolean
  image: string
  direction: 'U' | 'V' | 'H'
  availableWidths: number[]
  ratePerSqFt: number
  tier: string
}

export const DECORATIVE_FILMS: DecorativeFilm[] = [
  // Most Popular (Top 12)
  { code: 'SX-3140', name: 'Dusted Crystal', category: 'frosted', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-3140_Dusted_Crystal.jpg?v=1766172955', direction: 'U', availableWidths: [12, 48, 60], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-1801', name: 'White Random Lines', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-1801_White_Random_Lines.jpg?v=1766172955', direction: 'V', availableWidths: [60], ratePerSqFt: 30, tier: 'designer' },
  { code: 'SX-C370', name: 'Dot Screen 18', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-C370_Dot_Screen_18.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 32, tier: 'designer' },
  { code: 'SX-3150', name: 'Geometric', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-3150_Geometric.jpg?v=1766172955', direction: 'U', availableWidths: [60], ratePerSqFt: 32, tier: 'designer' },
  { code: 'SX-1700', name: 'Sand Blast Squares', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-1700_S_and_Blast_Squares.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-3141', name: 'Dusted Leaf', category: 'organic', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-3141_Dusted_Leaf.jpg?v=1766172955', direction: 'U', availableWidths: [12, 24, 36, 48, 60], ratePerSqFt: 28, tier: 'premium' },
  { code: 'SX-3131-UG', name: 'Eco Dusted', category: 'frosted', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-3131-UG_Eco_Dusted.jpg?v=1766172955', direction: 'U', availableWidths: [36, 60, 72], ratePerSqFt: 20, tier: 'standard' },
  { code: 'SXC-130SR', name: 'White Stripe 1/8"', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXC-130SR_White_Stripe_1_8.jpg?v=1766172955', direction: 'V', availableWidths: [60], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-5039', name: 'Escape', category: 'organic', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-5039_Escape.jpg?v=1766172955', direction: 'V', availableWidths: [60], ratePerSqFt: 35, tier: 'designer' },
  { code: 'SXC-3511', name: 'Frosted Stripes', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXC-3511_Frosted_Stripes.jpg?v=1766172955', direction: 'V', availableWidths: [60], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-C382', name: 'Etched Stripes 1/2"', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-C382_Etched_Stripes_1_2.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 32, tier: 'designer' },
  { code: 'SX-SC564', name: 'Inclined Cell', category: 'pattern', popular: true, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-SC564_Inclined_Cell.jpg?v=1766172955', direction: 'U', availableWidths: [12], ratePerSqFt: 40, tier: 'specialty' },
  // Remaining films
  { code: 'SXC-4410', name: 'Frosted Squares', category: 'pattern', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXC-4410_Frosted_Squares.jpg?v=1766172955', direction: 'U', availableWidths: [60], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-C391', name: 'Swiss', category: 'pattern', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-C391_Swiss.jpg?v=1766172955', direction: 'U', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
  { code: 'SX-1546', name: 'Frosted Vine', category: 'organic', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-1546_Frosted_Vine.jpg?v=1766172955', direction: 'V', availableWidths: [48], ratePerSqFt: 26, tier: 'premium' },
  { code: 'SX-1004', name: 'Clear Ripple Glass', category: 'organic', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-1004_Clear_Ripple_Glass.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 20, tier: 'standard' },
  { code: 'SX-1551', name: 'Crystal Lattice', category: 'pattern', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-1551_Crystal_Lattice.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 26, tier: 'premium' },
  { code: 'SXD-1818', name: 'Dots', category: 'pattern', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXD-1818_Dots.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 32, tier: 'designer' },
  { code: 'SXR-9829', name: 'Glassfrost', category: 'frosted', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXR-9829_Glassfrost.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 18, tier: 'standard' },
  { code: 'SX-0103C', name: 'White Crayon', category: 'organic', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-0103C_White_Crayon.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 26, tier: 'premium' },
  { code: 'SX-SC684', name: 'Pyramid', category: 'pattern', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SX-SC684_Pyramid.jpg?v=1766172955', direction: 'U', availableWidths: [48], ratePerSqFt: 25, tier: 'premium' },
  // Gradients
  { code: 'SXJ-0500', name: 'White Matte Dot', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0500_W_hite_Matte_Dot.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
  { code: 'SXJ-0530', name: 'Gradient Stripes', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0530_Gradient_Stripes.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
  { code: 'SXJ-0541', name: 'Broken Lines', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0541_Broken_Lines_Gradient.jpg?v=1766172955', direction: 'H', availableWidths: [72], ratePerSqFt: 38, tier: 'specialty' },
  { code: 'SXJ-0548', name: 'Dual Feather', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0548_Dual_Feather_Gradient.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 38, tier: 'specialty' },
  { code: 'SXJ-0582', name: 'Matte Dual Dot', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0582_MatteDualDot_IndustrialConference.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
  { code: 'SXJ-0594', name: 'Triangle', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0594_T_riangle_Gradient.jpg?v=1766172955', direction: 'H', availableWidths: [72], ratePerSqFt: 38, tier: 'specialty' },
  { code: 'SXJ-0598', name: 'Dual Misty Frost', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0598_DualMistyFrostGradient.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
  { code: 'SXJ-0599', name: 'Lineage Dual Frost', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0599_Lineage_Dual_Frost.jpg?v=1766172955', direction: 'H', availableWidths: [72], ratePerSqFt: 38, tier: 'specialty' },
  { code: 'SXJ-0545', name: 'Beach Grass', category: 'gradient', popular: false, image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/SXJ-0545_Beach_Grass_Gradient.jpg?v=1766172955', direction: 'H', availableWidths: [60], ratePerSqFt: 25, tier: 'premium' },
]

export const DECORATIVE_MINIMUM = 250
export const DECORATIVE_WASTE_FACTOR = 1.1

// ============================================================================
// SECURITY FILM OPTIONS
// ============================================================================

export interface SecurityFilmOption {
  id: string
  label: string
  desc: string
  ratePerSqFt: number | null
  recommended?: boolean
}

export const SECURITY_FILM_OPTIONS: SecurityFilmOption[] = [
  { id: '2mil', label: '2 mil - Basic Protection', desc: 'Entry-level safety film for shatter resistance', ratePerSqFt: 16 },
  { id: '4mil', label: '4 mil - Standard Protection', desc: 'Most popular choice for homes and offices', recommended: true, ratePerSqFt: 17 },
  { id: '6mil', label: '6 mil - Enhanced Protection', desc: 'Stronger resistance for higher-risk areas', ratePerSqFt: 18 },
  { id: '8mil', label: '8 mil - Heavy Duty Protection', desc: 'Maximum residential/commercial security', ratePerSqFt: 20 },
  { id: '13mil', label: '13 mil - Maximum Protection', desc: 'Highest level for storefronts and high-security', ratePerSqFt: 25 },
  { id: 'not_sure', label: "I'm not sure - Help me decide", desc: "We'll recommend the right option during consultation", ratePerSqFt: null },
]

export const SECURITY_MINIMUM = 250

// ============================================================================
// ROOM TYPES
// ============================================================================

export interface RoomTypeEntry {
  id: string
  label: string
  sequential: boolean
}

export const RESIDENTIAL_ROOM_TYPES: RoomTypeEntry[] = [
  { id: 'living_room', label: 'Living Room', sequential: false },
  { id: 'family_room', label: 'Family Room', sequential: false },
  { id: 'kitchen', label: 'Kitchen', sequential: false },
  { id: 'dining_room', label: 'Dining Room', sequential: false },
  { id: 'front_entry', label: 'Front Entry', sequential: false },
  { id: 'master_bedroom', label: 'Master Bedroom', sequential: false },
  { id: 'bedroom', label: 'Bedroom', sequential: true },
  { id: 'master_bathroom', label: 'Master Bathroom', sequential: false },
  { id: 'bathroom', label: 'Bathroom', sequential: true },
  { id: 'office', label: 'Office', sequential: false },
  { id: 'den', label: 'Den', sequential: false },
  { id: 'basement', label: 'Basement', sequential: false },
  { id: 'loft', label: 'Loft', sequential: false },
  { id: 'sunroom', label: 'Sunroom', sequential: false },
  { id: 'custom', label: 'Custom Room Name', sequential: true },
]

export const COMMERCIAL_ROOM_TYPES: RoomTypeEntry[] = [
  { id: 'office', label: 'Office', sequential: true },
  { id: 'conference_room', label: 'Conference Room', sequential: true },
  { id: 'lobby', label: 'Lobby / Reception', sequential: false },
  { id: 'storefront', label: 'Storefront', sequential: false },
  { id: 'break_room', label: 'Break Room', sequential: false },
  { id: 'warehouse', label: 'Warehouse', sequential: false },
  { id: 'restroom', label: 'Restroom', sequential: true },
  { id: 'custom', label: 'Custom Room Name', sequential: true },
]

// ============================================================================
// WINDOW TYPES
// ============================================================================

export interface WindowTypeEntry {
  id: string
  label: string
  panes: number
  desc: string
}

export const RESIDENTIAL_WINDOW_TYPES: WindowTypeEntry[] = [
  { id: 'hung', label: 'Single/Double Hung', panes: 2, desc: 'Two stacked panes' },
  { id: 'single', label: 'Single Window', panes: 1, desc: 'Single fixed pane' },
  { id: 'sliding', label: 'Sliding Door', panes: 2, desc: 'Left & right panels' },
  { id: 'arch', label: 'Arch Window', panes: 1, desc: 'Arched top' },
  { id: 'sidelight', label: 'Sidelight', panes: 1, desc: 'Narrow, beside doors' },
  { id: 'transom', label: 'Transom', panes: 1, desc: 'Wide, above doors' },
  { id: 'casement', label: 'Casement', panes: 1, desc: 'Hinged, cranks open' },
  { id: 'misc', label: 'Misc', panes: 1, desc: 'Other shapes' },
]

export const COMMERCIAL_WINDOW_TYPES: WindowTypeEntry[] = [
  { id: 'single', label: 'Single Window', panes: 1, desc: 'Standard fixed pane' },
  { id: 'single_tall', label: 'Tall Window', panes: 1, desc: 'Floor-to-ceiling' },
  { id: 'storefront', label: 'Storefront', panes: 1, desc: 'Large display glass' },
  { id: 'transom', label: 'Transom', panes: 1, desc: 'Wide, above doors' },
  { id: 'sidelight', label: 'Sidelight', panes: 1, desc: 'Narrow, beside doors' },
  { id: 'entry_door', label: 'Entry Door', panes: 1, desc: 'Glass door panel' },
  { id: 'sliding', label: 'Sliding Door', panes: 2, desc: 'Left & right panels' },
  { id: 'hung', label: 'Single/Double Hung', panes: 2, desc: 'Two stacked panes' },
  { id: 'arch', label: 'Arch Window', panes: 1, desc: 'Arched top' },
  { id: 'misc', label: 'Misc', panes: 1, desc: 'Other shapes' },
]

// ============================================================================
// ACCESS LEVELS
// ============================================================================

export const ACCESS_LEVELS = {
  GROUND: 'ground',
  STEP_STOOL: 'step_stool',
  LADDER: 'ladder',
  TALL_LADDER: 'tall_ladder',
} as const

export const ACCESS_LABELS: Record<string, string> = {
  [ACCESS_LEVELS.GROUND]: 'Ground level',
  [ACCESS_LEVELS.STEP_STOOL]: 'Step stool needed',
  [ACCESS_LEVELS.LADDER]: '6ft ladder needed',
  [ACCESS_LEVELS.TALL_LADDER]: 'Tall ladder needed',
}

// ============================================================================
// QUESTIONS
// ============================================================================

export interface QuestionOption {
  id: string
  label: string
  icon?: string
  desc?: string
  note?: string
  hasPrivacyBreakdown?: boolean
}

export interface QuestionDef {
  id: string
  title: string
  subtitle?: string
  type: 'multi' | 'single'
  conditional?: boolean
  options: QuestionOption[]
}

export const QUESTIONS: Record<string, QuestionDef> = {
  problems: {
    id: 'problems',
    title: 'What problems are you trying to solve?',
    subtitle: 'Select all that apply',
    type: 'multi',
    options: [
      { id: 'heat', label: 'Heat from the sun', icon: 'heat', desc: 'Windows that make the space too hot' },
      { id: 'glare', label: 'Too much glare', icon: 'glare', desc: 'Hard to see screens, causes eye strain' },
      { id: 'privacy', label: 'Privacy', icon: 'privacy', desc: "Don't want people seeing in", hasPrivacyBreakdown: true },
      { id: 'uv_fading', label: 'UV / Fading protection', icon: 'uv_fading', desc: 'Protect furniture, floors, merchandise from sun damage' },
      { id: 'decorative', label: 'Decorative Privacy & Branding', icon: 'decorative', desc: 'Frosted glass, logos, patterns, or design elements' },
      { id: 'security', label: 'Security / Safety', icon: 'security', desc: 'Shatter resistance, break-in deterrent' },
    ],
  },
  appearance: {
    id: 'appearance',
    title: 'How important is the appearance of the film?',
    subtitle: 'This helps us balance looks vs. performance',
    type: 'single',
    options: [
      { id: 'performance_priority', label: 'Performance is the priority', desc: 'A reflective or darker look is fine if it means better results' },
      { id: 'balance', label: 'Balance of both', desc: "Some reflectivity is okay, but don't want it too dark or reflective" },
      { id: 'very_natural', label: 'Keeping it neutral is very important', desc: 'Want minimal change to the glass appearance, even if performance is reduced', note: 'Note: Neutral films are less effective at heat, glare & privacy' },
    ],
  },
  lightPreference: {
    id: 'lightPreference',
    title: 'How much natural light do you want to keep?',
    subtitle: 'Darker films block more heat but also more light',
    type: 'single',
    options: [
      { id: 'block_max', label: 'Block as much as possible', desc: 'Maximum heat/glare reduction is more important than brightness' },
      { id: 'reasonably_bright', label: 'Keep it reasonably bright', desc: 'Good balance - reduce heat/glare but maintain a comfortable light level' },
      { id: 'bright_as_possible', label: 'Keep it as bright as possible', desc: 'Maximize natural light, even if heat/glare reduction is limited' },
    ],
  },
  warmCool: {
    id: 'warmCool',
    title: 'Warm or cool appearance?',
    subtitle: 'This affects how the film looks from inside',
    type: 'single',
    conditional: true,
    options: [
      { id: 'warm', label: 'Natural Warm Look' },
      { id: 'cool', label: 'Crisp Cool Look' },
      { id: 'no_preference', label: 'No preference' },
    ],
  },
  timeline: {
    id: 'timeline',
    title: 'When are you looking to get this done?',
    type: 'single',
    options: [
      { id: 'asap', label: 'ASAP' },
      { id: '1_2_weeks', label: '1-2 weeks' },
      { id: 'month', label: 'Within a month' },
      { id: 'exploring', label: 'Just exploring options' },
    ],
  },
}

export const QUESTION_ORDER = ['problems', 'appearance', 'lightPreference']

// ============================================================================
// WINDOW COUNT OPTIONS (come-measure path)
// ============================================================================

export const WINDOW_COUNT_OPTIONS = [
  { value: '1-5', label: '1-5 windows' },
  { value: '6-10', label: '6-10 windows' },
  { value: '11-24', label: '11-24 windows' },
  { value: '25+', label: '25+ windows' },
]

// ============================================================================
// PRICING DATA (defaults, can be overridden from API)
// ============================================================================

export interface PricingEntry {
  ratePerSqFt: number
  archRatePerSqFt: number
  stepStoolAdder: number
  ladderAdder: number
  tallLadderAdder: number
}

// Pricing display multiplier — inflates base rates so discounts look bigger.
// 1.35 means "retail" prices are 35% above your real base rates.
// A 25% discount off 1.35x = customer pays ~1.01x your base (roughly break-even).
// A 30% discount off 1.35x = customer pays ~0.945x your base (small real discount — ad acquisition cost).
export const PRICING_MULTIPLIER = 1.35

export const DEFAULT_PRICING: Record<string, PricingEntry> = {
  neutral_clear: { ratePerSqFt: 13, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
  neutral_clear_plus: { ratePerSqFt: 15, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
  privacy_pro: { ratePerSqFt: 13, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
  privacy_pro_plus: { ratePerSqFt: 15, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
  privacy_pro_dark: { ratePerSqFt: 15, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
  frosted_privacy: { ratePerSqFt: 13, archRatePerSqFt: 20, stepStoolAdder: 2, ladderAdder: 4, tallLadderAdder: 6 },
}

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

export interface Recommendation {
  filmId: string
  score: number
  film: FilmDataEntry
  appearanceTone: string
}

export function getRecommendations(answers: {
  problems?: string[]
  appearance?: string | null
  lightPreference?: string | null
  warmCool?: string | null
}): Recommendation[] {
  const { problems = [], appearance = null, lightPreference = null, warmCool = null } = answers

  let allowedFilms = [...V1_FILMS]
  const scores: Record<string, number> = {}
  allowedFilms.forEach((id) => { scores[id] = 0 })

  if (appearance === 'very_natural') {
    allowedFilms = allowedFilms.filter((id) => FILM_DATA[id].category === 'Neutral')
  } else if (appearance === 'performance_priority') {
    scores['privacy_pro'] = (scores['privacy_pro'] || 0) + 2
    scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 2
    scores['neutral_clear'] = (scores['neutral_clear'] || 0) - 1
  } else if (appearance === 'balance') {
    scores['privacy_pro'] = (scores['privacy_pro'] || 0) + 1
    scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 1
  }

  if (lightPreference === 'bright_as_possible') {
    scores['neutral_clear'] = (scores['neutral_clear'] || 0) + 1
    scores['privacy_pro'] = (scores['privacy_pro'] || 0) + 1
    const hasPerformanceNeed = problems.some((p) => ['heat', 'glare', 'privacy'].includes(p))
    if (!hasPerformanceNeed) {
      allowedFilms = allowedFilms.filter((id) => !['neutral_clear_plus', 'privacy_pro_plus'].includes(id))
    }
  } else if (lightPreference === 'reasonably_bright') {
    scores['neutral_smoke'] = (scores['neutral_smoke'] || 0) + 1
    scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 1
  } else if (lightPreference === 'block_max') {
    scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 2
    scores['neutral_smoke'] = (scores['neutral_smoke'] || 0) + 1
  }

  problems.forEach((problem) => {
    if (problem === 'heat') {
      scores['neutral_smoke'] = (scores['neutral_smoke'] || 0) + 1
      scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 1
    } else if (problem === 'glare') {
      scores['neutral_smoke'] = (scores['neutral_smoke'] || 0) + 1
      scores['privacy_pro'] = (scores['privacy_pro'] || 0) + 1
    } else if (problem === 'privacy') {
      scores['privacy_pro'] = (scores['privacy_pro'] || 0) + 2
      scores['privacy_pro_plus'] = (scores['privacy_pro_plus'] || 0) + 2
    } else if (problem === 'uv_fading') {
      scores['neutral_clear'] = (scores['neutral_clear'] || 0) + 1
      scores['neutral_smoke'] = (scores['neutral_smoke'] || 0) + 1
    }
  })

  const wantsPrivacy = problems.includes('privacy')
  const wantsNatural = appearance === 'very_natural'
  if (wantsPrivacy && wantsNatural && !allowedFilms.includes('privacy_pro')) {
    allowedFilms.push('privacy_pro')
    scores['privacy_pro'] = 2
  }

  let candidates = allowedFilms
    .filter((id) => V1_FILMS.includes(id) && FILM_DATA[id])
    .map((id) => ({ filmId: id, score: scores[id] || 0, film: FILM_DATA[id] }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.film.sortOrder - b.film.sortOrder))

  let recommendations = candidates.slice(0, 2)

  if (wantsPrivacy && recommendations.length >= 2) {
    const privacyIdx = recommendations.findIndex((c) => c.film.category === 'Privacy')
    if (privacyIdx === 1) {
      ;[recommendations[0], recommendations[1]] = [recommendations[1], recommendations[0]]
    }
  }

  return recommendations.map((rec) => ({
    ...rec,
    appearanceTone:
      rec.film.warmCoolVariant === 'Warm or Cool'
        ? warmCool === 'warm'
          ? 'Natural Warm Look'
          : 'Crisp Cool Look'
        : 'Neutral',
  }))
}

// ============================================================================
// PRICE HELPERS
// ============================================================================

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount)
}

export function getConsultFee(distance: number | null): number | null {
  if (!distance) return null
  for (const tier of CONFIG.FEE_TIERS) {
    if (distance <= tier.maxMiles) {
      return tier.fee
    }
  }
  return null
}

export function getWindowQuantityDiscount(totalPanes: number): number {
  let discount = 0
  for (const tier of CONFIG.WINDOW_DISCOUNT_TIERS) {
    if (totalPanes >= tier.minPanes) {
      discount = tier.discount
    }
  }
  return discount
}

export function getNextWindowTier(totalPanes: number): { windowsNeeded: number; currentDiscount: number; nextDiscount: number } | null {
  const tiers = CONFIG.WINDOW_DISCOUNT_TIERS
  for (let i = 0; i < tiers.length; i++) {
    if (totalPanes < tiers[i].minPanes) {
      return {
        windowsNeeded: tiers[i].minPanes - totalPanes,
        currentDiscount: i > 0 ? tiers[i - 1].discount : 0,
        nextDiscount: tiers[i].discount,
      }
    }
  }
  return null
}

function getWindowRate(filmId: string, windowType: string, accessLevel: string): number {
  const pricing = DEFAULT_PRICING[filmId]
  if (!pricing) return 13

  if (windowType === 'arch') return pricing.archRatePerSqFt || 20

  let rate = pricing.ratePerSqFt || 13
  if (accessLevel === ACCESS_LEVELS.STEP_STOOL) rate += pricing.stepStoolAdder || 2
  else if (accessLevel === ACCESS_LEVELS.LADDER) rate += pricing.ladderAdder || 4
  else if (accessLevel === ACCESS_LEVELS.TALL_LADDER) rate += pricing.tallLadderAdder || 6
  return rate
}

export interface PriceBreakdown {
  standard: number
  decorative: number
  security: number
  total: number
  decorativeMinApplied: boolean
  securityMinApplied: boolean
}

export function calculatePriceBreakdown(defaultFilmId: string | undefined, rooms: import('./flat-glass-state').RoomEntry[]): PriceBreakdown {
  let standardTotal = 0
  let decorativeTotal = 0
  let securityTotal = 0

  // Count total panes for quantity discount (standard films only)
  let totalPanes = 0
  rooms.forEach((room) => {
    const filmType = room.filmType || 'recommended'
    if (filmType === 'recommended' || filmType === 'performance') {
      room.windows.forEach((win) => {
        const panes = win.panes || 1
        totalPanes += (win.quantity || 1) * panes
      })
    }
  })
  const windowDiscount = getWindowQuantityDiscount(totalPanes)

  rooms.forEach((room) => {
    const filmType = room.filmType || 'recommended'

    if (filmType === 'decorative') {
      let roomSqFt = 0
      room.windows.forEach((win) => {
        const w = win.width === 'oversize' ? 120 : parseFloat(String(win.width)) || 0
        const h = win.height === 'oversize' ? 120 : parseFloat(String(win.height)) || 0
        const qty = win.quantity || 1
        const panes = win.panes || 1
        if (w > 0 && h > 0) roomSqFt += (w * h / 144) * qty * panes
      })
      const selections = room.decorativeSelections || []
      if (selections.length > 0) {
        const maxRate = Math.max(...selections.map((s) => {
          const film = DECORATIVE_FILMS.find((f) => f.code === s.code)
          return film ? film.ratePerSqFt : 18
        }))
        decorativeTotal += roomSqFt * maxRate * 1.1 // 10% waste factor
      }
    } else if (filmType === 'security') {
      let roomSqFt = 0
      room.windows.forEach((win) => {
        const w = win.width === 'oversize' ? 120 : parseFloat(String(win.width)) || 0
        const h = win.height === 'oversize' ? 120 : parseFloat(String(win.height)) || 0
        const qty = win.quantity || 1
        const panes = win.panes || 1
        if (w > 0 && h > 0) roomSqFt += (w * h / 144) * qty * panes
      })
      const secOpt = room.securitySelection
      if (secOpt && secOpt.ratePerSqFt) {
        securityTotal += roomSqFt * secOpt.ratePerSqFt
      }
    } else {
      // Standard film
      const roomFilmId = defaultFilmId || 'privacy_pro'
      room.windows.forEach((win) => {
        const w = win.width === 'oversize' ? 120 : parseFloat(String(win.width)) || 0
        const h = win.height === 'oversize' ? 120 : parseFloat(String(win.height)) || 0
        const qty = win.quantity || 1
        const panes = win.panes || 1

        if (w > 0 && h > 0) {
          const sqFtPerPane = (w * h) / 144
          const accessLevels = win.accessLevels || []

          for (let i = 0; i < qty; i++) {
            const accessLevel = accessLevels[i] || ACCESS_LEVELS.GROUND
            const rate = getWindowRate(roomFilmId, win.windowType, accessLevel)
            const discountedRate = Math.max(0, rate - windowDiscount)
            standardTotal += sqFtPerPane * panes * discountedRate
          }
        }
      })
    }
  })

  // Apply minimums
  const decorativeMinApplied = decorativeTotal > 0 && decorativeTotal < 250
  const securityMinApplied = securityTotal > 0 && securityTotal < SECURITY_MINIMUM
  if (decorativeMinApplied) decorativeTotal = 250
  if (securityMinApplied) securityTotal = SECURITY_MINIMUM

  return {
    standard: Math.round(standardTotal),
    decorative: Math.round(decorativeTotal),
    security: Math.round(securityTotal),
    total: Math.round(standardTotal + decorativeTotal + securityTotal),
    decorativeMinApplied,
    securityMinApplied,
  }
}
