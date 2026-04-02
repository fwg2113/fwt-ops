// ============================================================================
// BOOKING PAGE — TypeScript Types
// All interfaces matching the Supabase schema + frontend needs
// ============================================================================

// --- Module types (universal across the platform) ---

export type ModuleKey = 'auto_tint' | 'flat_glass' | 'detailing' | 'ceramic_coating' | 'ppf' | 'wraps' | 'signage' | 'apparel';

export interface ModuleContentBlock {
  warranty_title?: string;
  warranty_text?: string;
  no_fault_title?: string;
  no_fault_text?: string;
  care_title?: string;
  care_items?: string[];
}

export type ModuleInvoiceContent = Partial<Record<string, ModuleContentBlock>>;

export const MODULE_LABELS: Record<string, string> = {
  auto_tint: 'Window Tint',
  flat_glass: 'Flat Glass',
  detailing: 'Detailing',
  ceramic_coating: 'Ceramic Coating',
  ppf: 'Paint Protection Film',
  wraps: 'Vehicle Wraps',
  signage: 'Signage',
  apparel: 'Custom Apparel',
};

export const MODULE_COLORS: Record<string, string> = {
  auto_tint: '#dc2626',
  flat_glass: '#0ea5e9',
  detailing: '#8b5cf6',
  ceramic_coating: '#f59e0b',
  ppf: '#10b981',
  wraps: '#ec4899',
  signage: '#06b6d4',
  apparel: '#a855f7',
};

// --- Database row types (from Supabase) ---

export interface ShopConfig {
  id: number;
  shop_name: string;
  shop_address: string | null;
  shop_phone: string | null;
  shop_email: string | null;
  shop_timezone: string;
  pricing_model: 'ymm' | 'category' | 'window_count';
  require_deposit: boolean;
  deposit_amount: number;
  deposit_refundable?: boolean;
  deposit_refund_hours?: number;
  price_ack_enabled?: boolean;
  price_ack_text?: string;
  allow_same_day: boolean;
  same_day_cutoff_hours: number;
  limit_booking_window: boolean;
  max_days_out: number;
  booking_cutoff_hours: number;
  enable_dropoff: boolean;
  enable_waiting: boolean;
  enable_headsup_30: boolean;
  enable_headsup_60: boolean;
  enable_multi_vehicle: boolean;
  enable_gift_certificates: boolean;
  cc_fee_percent: number;
  cc_fee_flat: number;
  cash_discount_percent: number;
  payment_methods: string[];
  film_card_specs?: string[];
  film_card_layout?: 'classic' | 'horizontal' | 'minimal';
  theme_ext_primary: string;
  theme_ext_secondary: string;
  theme_ext_accent: string;
  theme_ext_background: string;
  theme_int_primary: string;
  theme_int_accent: string;
  theme_int_background: string;
  theme_int_surface: string;
  theme_int_text: string;
  addon_discount_enabled?: boolean;
  addon_discount_percent?: number;
  addon_discount_excluded_films?: string[];
  addon_discount_promo_text?: string;
  addon_discount_disclaimer?: string;
  gc_help_text?: string;
  gc_call_enabled?: boolean;
  gc_call_number?: string;
  gc_text_enabled?: boolean;
  gc_text_number?: string;
}

export interface AutoFilmBrand {
  id: number;
  name: string;
  logo_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface AutoFilm {
  id: number;
  brand_id: number;
  name: string;
  tier: number;
  tier_label: string | null;
  abbreviation: string;
  ir_rejection: string | null;
  description: string | null;
  offered: boolean;
  sort_order: number;
  film_type: string | null;
  signal_safe: boolean;
  color_appearance: string | null;
  thickness_mil: number | null;
  warranty: string | null;
  notes: string | null;
  display_name: string | null;
  card_image_url: string | null;
  featured_specs: string[] | null;
  custom_metrics: Array<{ label: string; value: string }> | null;
  card_styles: {
    bg?: string;
    nameColor?: string;
    tierColor?: string;
    metricValueColor?: string;
    metricLabelColor?: string;
  } | null;
  badge: {
    enabled: boolean;
    text: string;
    position: 'top' | 'bottom';
    bgColor: string;
    textColor: string;
  } | null;
}

export interface AutoFilmShade {
  id: number;
  film_id: number;
  shade_value: string;
  shade_label: string | null;
  shade_numeric: number | null;
  offered: boolean;
  sort_order: number;
  vlt: number | null;
  tser: number | null;
  irer: number | null;
  sirr: number | null;
  uv_rejection: string | null;
  glare_reduction: number | null;
  vlr: number | null;
}

export interface AutoVehicle {
  id: number;
  make: string;
  model: string;
  year_start: number;
  year_end: number;
  class_keys: string[];
  window_count: number | null;
  door_count: number | null;
  has_front_quarters: boolean;
  has_rear_quarters: boolean;
  vehicle_category: string | null;
  duration_override_minutes: number | null;
  active: boolean;
}

export interface AutoClassRule {
  id: number;
  class_key: string;
  full_requires_split_front_rear: boolean;
  has_rear_doors: boolean;
  description: string | null;
}

export interface AutoService {
  id: number;
  service_key: string;
  label: string;
  service_type: 'tint' | 'removal' | 'alacarte';
  conflicts_with: string | null;
  duration_minutes: number;
  show_note: string | null;
  is_primary: boolean;
  is_addon: boolean;
  sort_order: number;
  enabled: boolean;
}

export interface AutoPricing {
  id: number;
  class_key: string;
  service_key: string;
  film_id: number | null;
  price: number;
  duration_minutes: number | null;
}

export interface AutoScheduleDay {
  id: number;
  day_of_week: string;
  enabled: boolean;
  open_time: string | null;
  close_time: string | null;
  max_dropoff: number;
  max_waiting: number;
  max_headsup: number;
}

export interface AutoDropoffSlot {
  id: number;
  time_slot: string;
  label: string;
  sort_order: number;
  enabled: boolean;
}

export interface AutoWaitingSlot {
  id: number;
  day_of_week: string;
  time_slot: string;
  label: string;
  sort_order: number;
  enabled: boolean;
}

export interface AutoDiscount {
  id: number;
  name: string;
  percentage: number;
  applies_to_services: string[];
  requires_primary: boolean;
  excluded_films: string[];
  applies_when_multi_vehicle: boolean;
  enabled: boolean;
  customer_message: string | null;
  badge_text: string | null;
}

export interface AutoGiftCertificate {
  id: number;
  gc_code: string;
  discount_type: 'dollar' | 'percent';
  amount: number;
  charge_deposit: boolean;
  redeemed: boolean;
  start_date: string | null;
  end_date: string | null;
  disable_default_discounts: boolean;
  allow_same_day: boolean;
  applicable_services: string[];
  excluded_services: string[];
  promo_note: string | null;
}

export interface AutoServiceShade {
  id: number;
  service_key: string;
  film_key: string;
  shade_value: string;
  shade_label: string | null;
  sort_order: number;
}

export interface AutoSpecialShade {
  id: number;
  code: string;
  label: string;
  applies_to_service: string | null;
  price_behavior: string | null;
  calendar_label: string | null;
  enabled: boolean;
}

export interface AutoVehicleClass {
  id: number;
  class_key: string;
  label: string;
  add_fee: number;
  sort_order: number;
}

export interface AutoVehicleCustomClass {
  id: number;
  vehicle_id: number;
  class_key: string;
  label: string;
  description: string | null;
  image_url: string | null;
  category: 'primary' | 'secondary';
  duration_minutes: number;
  sort_order: number;
  enabled: boolean;
}

export interface AutoVehiclePricingOverride {
  id: number;
  vehicle_id: number;
  service_key: string;
  film_id: number | null;
  price: number;
}

// --- Bulk config response (single API call) ---

export interface BulkConfig {
  shopConfig: ShopConfig;
  films: AutoFilm[];
  filmShades: AutoFilmShade[];
  filmBrands: AutoFilmBrand[];
  vehicles: AutoVehicle[];
  classRules: AutoClassRule[];
  vehicleClasses: AutoVehicleClass[];
  services: AutoService[];
  pricing: AutoPricing[];
  schedule: AutoScheduleDay[];
  dropoffSlots: AutoDropoffSlot[];
  waitingSlots: AutoWaitingSlot[];
  discounts: AutoDiscount[];
  serviceShades: AutoServiceShade[];
  specialShades: AutoSpecialShade[];
  vehicleCustomClasses: AutoVehicleCustomClass[];
  vehiclePricingOverrides: AutoVehiclePricingOverride[];
}

// --- Frontend state types ---

export type ServiceType = 'tint' | 'removal' | 'alacarte';
export type AppointmentType = 'dropoff' | 'waiting' | 'headsup_30' | 'headsup_60';

export interface SelectedService {
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
}

export interface GCValidation {
  valid: boolean;
  code: string;
  discountType: 'dollar' | 'percent';
  amount: number;
  chargeDeposit: boolean;
  disableDefaultDiscounts: boolean;
  allowSameDay: boolean;
  promoNote: string | null;
}

export interface BookingState {
  // GC
  gcValidation: GCValidation | null;

  // Vehicle
  selectedYear: string;
  selectedMake: string;
  selectedModel: string;
  selectedVehicle: AutoVehicle | null;

  // Service type
  serviceType: ServiceType;

  // Tint flow
  primaryServiceKey: string | null;
  selectedFilmId: number | null;
  shadeFront: string | null;
  shadeRear: string | null;
  shadeUniform: boolean;
  selectedAddons: Set<string>;
  addonConfigs: Record<string, {
    filmId: number | null;
    shade: string | null;
  }>;

  // Tesla Model 3
  teslaClassKey: string | null;

  // Removal flow
  selectedRemovals: Set<string>;

  // A la carte flow
  selectedAlaCarteWindows: Set<string>;
  alaCarteConfigs: Record<string, {
    filmId: number | null;
    shade: string | null;
  }>;

  // Summary & schedule
  windowStatus: string;
  hasAftermarketTint: string;
  windshieldReplaced: string;
  windshield72hrAck: boolean;
  policyCheckbox: boolean;
  priceAckCheckbox: boolean;

  // Schedule
  appointmentType: AppointmentType;
  selectedDate: string;
  selectedTime: string;

  // Contact
  firstName: string;
  lastName: string;
  phone: string;
  email: string;

  // Interests
  additionalInterests: Set<string>;
}


// Service keys
export const PRIMARY_SERVICES = ['TWO_FRONT_DOORS', 'FULL_SIDES'] as const;
export const ADDON_SERVICES = ['FULL_WS', 'SUN_STRIP', 'SUNROOF_SINGLE', 'SUNROOF_PANO'] as const;
export const REMOVAL_SERVICES = ['REMOVAL_2FD', 'REMOVAL_FULL', 'REMOVAL_WS', 'REMOVAL_SUNSTRIP', 'REMOVAL_REAR'] as const;
export const ALACARTE_SERVICES = ['ALACARTE_DFD', 'ALACARTE_PFD', 'ALACARTE_DRD', 'ALACARTE_PRD', 'ALACARTE_QTR', 'ALACARTE_RW'] as const;

// Additional interest options (cross-sell checkboxes)
export const ADDITIONAL_INTERESTS = [
  'Residential Window Tint',
  'Commercial Window Tint',
  'Paint Protection Film',
  'Commercial Vehicle Wrap or Lettering',
  'Color Change Vinyl Wrap',
  'Vehicle Graphics or Styling',
  'Signage',
  'Interior Vinyl Graphics',
  'Exterior Vinyl Graphics',
  'Custom Apparel'
] as const;

// Tesla Model 3 config
export const TESLA_MODEL3_CONFIG = {
  classKeys: ['MD3_HALF', 'MD3_FULL'] as const,
  image: 'https://cdn.shopify.com/s/files/1/0903/9947/3979/files/UPDATED-AUTOBAHN-TM3-PRODUCT-IMAGE-37.jpg?v=1763514918',
  options: {
    'MD3_HALF': {
      label: 'Half Back Window',
      description: 'Factory tint with 22% lower half creates a unified look'
    },
    'MD3_FULL': {
      label: 'Full Back Window',
      description: 'Covers upper factory tint and adds tint to lower half, upper will be darker and lower will be lighter'
    }
  }
} as const;
