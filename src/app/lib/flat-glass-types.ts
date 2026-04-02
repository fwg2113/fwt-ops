// Flat Glass Configurator types

export interface FilmType {
  id: number
  type_id: string
  category: string
  brand: string | null
  display_name: string
  description: string | null
  interior_tone: string | null
  exterior_tone: string | null
  shades_available: string | null
  hero_stat_label: string | null
  hero_stat_value: string | null
  class_keys: string | null
  tier: number
  heat: boolean
  glare: boolean
  uv_fade: boolean
  privacy_day: boolean
  privacy_full: boolean
  security: boolean
  decorative: boolean
  exterior: boolean
  appearance_neutral: boolean
  appearance_reflective: boolean
  appearance_dark: boolean
  residential: boolean
  commercial: boolean
  active: boolean
}

export interface FilmShade {
  id: number
  type_id: string
  film_code: string
  film_name: string
  interior_tone: string | null
  exterior_tone: string | null
  vlt: string | null
  glare_reduction: string | null
  vlre: string | null
  tser: string | null
  fade_reduction: string | null
  price_sqft_36: number | null
  price_sqft_48: number | null
  price_sqft_60: number | null
  price_sqft_72: number | null
  active: boolean
}

export interface DistanceZone {
  id: number
  zone_name: string
  min_miles: number
  max_miles: number | null
  fee: number
  description: string | null
  sort_order: number
}

export interface RoomType {
  id: number
  name: string
  icon: string | null
  default_windows: number
  sort_order: number
}

export interface QuantityDiscount {
  id: number
  min_windows: number
  max_windows: number | null
  discount_percent: number
  label: string | null
}

export interface ScheduleDay {
  id: number
  day_of_week: string
  enabled: boolean
  open_time: string | null
  close_time: string | null
  max_appointments: number
  available_slots: string | null
}

export interface ConfigData {
  filmTypes: FilmType[]
  filmShades: FilmShade[]
  settings: Record<string, string>
  distanceZones: DistanceZone[]
  roomTypes: RoomType[]
  quantityDiscounts: QuantityDiscount[]
  schedule: ScheduleDay[]
}

// Configurator state

export type PropertyType = 'residential' | 'commercial'

export type AppearancePreference = 'neutral' | 'reflective' | 'any'

export interface Criteria {
  propertyType: PropertyType | null
  heat: boolean
  glare: boolean
  uv_fade: boolean
  privacy_day: boolean
  privacy_full: boolean
  security: boolean
  decorative: boolean
  appearance: AppearancePreference
}

export interface WindowEntry {
  width: number
  height: number
  quantity: number
}

export interface Room {
  id: string
  name: string
  roomType: string
  windows: WindowEntry[]
  notes: string
}

export interface ContactInfo {
  name: string
  email: string
  phone: string
  address: string
}

export type SubmitPath = 'save' | 'visit' | 'commit'

export interface AppointmentSlot {
  date: string
  slot: string
}

export interface ConfiguratorState {
  step: number
  criteria: Criteria
  selectedFilmType: FilmType | null
  selectedShade: FilmShade | null
  rooms: Room[]
  contact: ContactInfo
  path: SubmitPath | null
  appointment: AppointmentSlot | null
}

export const INITIAL_CRITERIA: Criteria = {
  propertyType: null,
  heat: false,
  glare: false,
  uv_fade: false,
  privacy_day: false,
  privacy_full: false,
  security: false,
  decorative: false,
  appearance: 'any',
}

export const INITIAL_STATE: ConfiguratorState = {
  step: 1,
  criteria: { ...INITIAL_CRITERIA },
  selectedFilmType: null,
  selectedShade: null,
  rooms: [],
  contact: { name: '', email: '', phone: '', address: '' },
  path: null,
  appointment: null,
}

// Category display metadata
export interface CategoryMeta {
  id: string
  name: string
  iconKey: string
  description: string
  benefits: string[]
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  dual_reflective: {
    id: 'dual_reflective',
    name: 'Dual Reflective',
    iconKey: 'mirror',
    description: 'Mirror exterior with subtle interior — privacy without a cave effect',
    benefits: ['Daytime Privacy', 'Heat Rejection', 'Glare Reduction'],
  },
  neutral: {
    id: 'neutral',
    name: 'Neutral Films',
    iconKey: 'window',
    description: 'Nearly invisible protection that preserves your view',
    benefits: ['Heat Rejection', 'UV Protection', 'Natural Appearance'],
  },
  silver: {
    id: 'silver',
    name: 'Silver / Mirror',
    iconKey: 'sparkle',
    description: 'Maximum heat rejection with a reflective exterior',
    benefits: ['Maximum Heat Rejection', 'Daytime Privacy', 'Glare Reduction'],
  },
  oneway: {
    id: 'oneway',
    name: 'One Way Mirror',
    iconKey: 'search',
    description: 'See out clearly while others see only reflection',
    benefits: ['Maximum Privacy', 'Heat Rejection'],
  },
  decorative: {
    id: 'decorative',
    name: 'Decorative / Full Privacy',
    iconKey: 'block',
    description: 'Complete 24/7 privacy with frosted or patterned designs',
    benefits: ['24/7 Privacy', 'Decorative'],
  },
  security: {
    id: 'security',
    name: 'Security Film',
    iconKey: 'security',
    description: 'Hold glass together on impact for safety and security',
    benefits: ['Shatter Protection', 'Safety'],
  },
}
