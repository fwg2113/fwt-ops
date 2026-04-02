-- ============================================================
-- 00003_auto_booking_schema.sql
-- Automotive booking system — SaaS-ready architecture
-- All auto tables prefixed auto_ to separate from flat glass
-- ============================================================

-- ============================================================
-- SHOP CONFIGURATION (singleton now, becomes per-tenant later)
-- Every business setting is a typed column, never key-value
-- Pattern: feature_enabled (bool) + feature_config (typed)
-- ============================================================
CREATE TABLE IF NOT EXISTS shop_config (
  id integer PRIMARY KEY DEFAULT 1,

  -- Business Info
  shop_name text NOT NULL DEFAULT 'Frederick Window Tinting',
  shop_address text,
  shop_phone text,
  shop_email text,
  shop_timezone text NOT NULL DEFAULT 'America/New_York',
  shop_logo_url text,

  -- Module Toggles (each module can be independently enabled)
  module_auto_booking boolean NOT NULL DEFAULT true,
  module_flat_glass boolean NOT NULL DEFAULT true,
  module_invoicing boolean NOT NULL DEFAULT true,
  module_communication boolean NOT NULL DEFAULT true,
  module_statistics boolean NOT NULL DEFAULT true,

  -- Pricing Model
  pricing_model text NOT NULL DEFAULT 'ymm'
    CHECK (pricing_model IN ('ymm', 'category', 'window_count')),

  -- Booking Settings
  require_deposit boolean NOT NULL DEFAULT true,
  deposit_amount numeric NOT NULL DEFAULT 50.00,
  allow_same_day boolean NOT NULL DEFAULT false,
  same_day_cutoff_hours integer NOT NULL DEFAULT 8,
  limit_booking_window boolean NOT NULL DEFAULT true,
  max_days_out integer NOT NULL DEFAULT 45,
  booking_cutoff_hours integer NOT NULL DEFAULT 8,

  -- Appointment Type Toggles
  enable_dropoff boolean NOT NULL DEFAULT true,
  enable_waiting boolean NOT NULL DEFAULT true,
  enable_headsup_30 boolean NOT NULL DEFAULT true,
  enable_headsup_60 boolean NOT NULL DEFAULT true,
  enable_multi_vehicle boolean NOT NULL DEFAULT false,
  enable_gift_certificates boolean NOT NULL DEFAULT true,

  -- Payment Settings
  cc_fee_percent numeric NOT NULL DEFAULT 3.5,
  cc_fee_flat numeric NOT NULL DEFAULT 0.30,
  cash_discount_percent numeric NOT NULL DEFAULT 5.0,
  payment_methods jsonb NOT NULL DEFAULT '["cc","cashapp","zelle","venmo","applepay","cash"]'::jsonb,

  -- Twilio (per-shop)
  twilio_phone_number text,
  twilio_account_sid text,
  twilio_auth_token text,

  -- Stripe (per-shop)
  stripe_account_id text,

  -- Singleton constraint (becomes tenant_id in SaaS)
  CHECK (id = 1),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reuse existing trigger function from 00001
CREATE TRIGGER shop_config_updated_at
  BEFORE UPDATE ON shop_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert FWT defaults
INSERT INTO shop_config (id) VALUES (1) ON CONFLICT DO NOTHING;


-- ============================================================
-- CUSTOMERS (first-class entity, shared across auto & flat glass)
-- Phone is primary match key
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text,
  email text,
  first_name text,
  last_name text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- FILM BRANDS (master catalog — shared in SaaS)
-- Each brand is a company like AutoBahn, SunTek, 3M, SolarGard
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_film_brands (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  logo_url text,
  website_url text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- FILMS (products within a brand)
-- manufacturer_available = brand makes this product
-- offered = this shop offers it to customers
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_films (
  id serial PRIMARY KEY,
  brand_id integer NOT NULL REFERENCES auto_film_brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  tier integer NOT NULL DEFAULT 1
    CHECK (tier BETWEEN 1 AND 5),
  tier_label text, -- 'Entry', 'Essential', 'Elite', 'Enthusiast'
  abbreviation text NOT NULL DEFAULT '',
  ir_rejection text, -- heat rejection % for display
  description text,
  manufacturer_available boolean NOT NULL DEFAULT true,
  offered boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(brand_id, name)
);


-- ============================================================
-- FILM SHADES (shade options per film product)
-- manufacturer_available = film comes in this shade
-- offered = shop offers this shade to customers
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_film_shades (
  id serial PRIMARY KEY,
  film_id integer NOT NULL REFERENCES auto_films(id) ON DELETE CASCADE,
  shade_value text NOT NULL, -- '5%', '15%', '20%', '22%', 'MATCH', etc.
  shade_label text, -- display label
  shade_numeric integer, -- for sorting: 5, 15, 20, 22, etc. NULL for non-numeric
  manufacturer_available boolean NOT NULL DEFAULT true,
  offered boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(film_id, shade_value)
);


-- ============================================================
-- VEHICLE DATABASE (universal catalog)
-- class_keys power YMM pricing; metadata powers alternative models
-- In SaaS: shared across tenants, pricing is per-tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_vehicles (
  id serial PRIMARY KEY,
  make text NOT NULL,
  model text NOT NULL,
  year_start integer NOT NULL,
  year_end integer NOT NULL,
  class_keys text[] NOT NULL DEFAULT '{}',

  -- Metadata for alternative pricing models & future SaaS
  window_count integer,
  door_count integer,
  has_front_quarters boolean DEFAULT false,
  has_rear_quarters boolean DEFAULT false,
  vehicle_category text, -- '2_door', '4_door_sedan', 'small_suv', 'large_suv', 'van', 'truck_std', 'truck_crew'

  -- Per-vehicle override (optional, takes priority over service default)
  duration_override_minutes integer,

  needs_review boolean DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_vehicles_make ON auto_vehicles(make);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_make_model ON auto_vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_auto_vehicles_years ON auto_vehicles(year_start, year_end);

CREATE TRIGGER auto_vehicles_updated_at
  BEFORE UPDATE ON auto_vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- CLASS RULES (structural rules per vehicle class)
-- Determines UI behavior: split shade pickers, rear door options
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_class_rules (
  id serial PRIMARY KEY,
  class_key text NOT NULL UNIQUE,
  full_requires_split_front_rear boolean NOT NULL DEFAULT false,
  has_rear_doors boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- SERVICES (what can be booked)
-- service_type groups: tint, removal, alacarte
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_services (
  id serial PRIMARY KEY,
  service_key text NOT NULL UNIQUE,
  label text NOT NULL,
  service_type text NOT NULL DEFAULT 'tint'
    CHECK (service_type IN ('tint', 'removal', 'alacarte')),
  conflicts_with text, -- pipe-separated service keys that can't be selected together
  duration_minutes integer NOT NULL DEFAULT 30,
  show_note text,
  is_primary boolean NOT NULL DEFAULT false, -- primary service (2FD or FULL)
  is_addon boolean NOT NULL DEFAULT false, -- secondary add-on (WS, sunroof, strip)
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- PRICING — YMM MODEL (class_key + service + film = price)
-- This is the FWT/recommended pricing model
-- Future: pricing_category and pricing_window_count tables
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_pricing (
  id serial PRIMARY KEY,
  class_key text NOT NULL, -- matches class_rules.class_key, or '*' for wildcard
  service_key text NOT NULL,
  film_id integer REFERENCES auto_films(id) ON DELETE SET NULL, -- NULL for removals (no film)
  price numeric NOT NULL DEFAULT 0,
  duration_minutes integer, -- override duration for this combo
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_pricing_lookup
  ON auto_pricing(class_key, service_key, film_id);


-- ============================================================
-- SPECIAL SHADES (non-numeric: MATCH, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_special_shades (
  id serial PRIMARY KEY,
  code text NOT NULL,
  label text NOT NULL,
  applies_to_service text, -- service_key or NULL for all
  price_behavior text, -- how this shade affects pricing
  calendar_label text, -- how it appears in calendar title
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- SCHEDULE (auto-specific, separate from flat glass)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_schedule (
  id serial PRIMARY KEY,
  day_of_week text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  open_time time,
  close_time time,
  max_dropoff integer NOT NULL DEFAULT 6,
  max_waiting integer NOT NULL DEFAULT 2,
  max_headsup integer NOT NULL DEFAULT 3,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- TIME SLOTS (separate tables for dropoff & waiting)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_dropoff_slots (
  id serial PRIMARY KEY,
  time_slot time NOT NULL,
  label text NOT NULL, -- '8:00 am', '8:30 am', etc.
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_waiting_slots (
  id serial PRIMARY KEY,
  day_of_week text NOT NULL,
  time_slot time NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- CLOSED DATES & OVERRIDES (auto-specific)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_closed_dates (
  id serial PRIMARY KEY,
  closed_date date NOT NULL UNIQUE,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auto_date_overrides (
  id serial PRIMARY KEY,
  override_date date NOT NULL UNIQUE,
  max_dropoff integer,
  max_waiting integer,
  max_headsup integer,
  notes text,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- ABBREVIATIONS (for building calendar event titles)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_abbreviations (
  id serial PRIMARY KEY,
  abbrev_type text NOT NULL
    CHECK (abbrev_type IN ('CLASS_KEY', 'SERVICE', 'FLAG', 'FILM')),
  key text NOT NULL,
  abbreviation text NOT NULL,
  format text NOT NULL DEFAULT 'display'
    CHECK (format IN ('display', 'code')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_abbreviations_lookup
  ON auto_abbreviations(abbrev_type, key);


-- ============================================================
-- DISCOUNTS (promo rules and conditions)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_discounts (
  id serial PRIMARY KEY,
  name text NOT NULL,
  percentage numeric NOT NULL DEFAULT 0,
  applies_to_services text[] DEFAULT '{}',
  requires_primary boolean NOT NULL DEFAULT false,
  excluded_films text[] DEFAULT '{}',
  applies_when_multi_vehicle boolean NOT NULL DEFAULT false,
  min_spend numeric,
  max_spend numeric,
  valid_from timestamptz,
  valid_until timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  customer_message text,
  badge_text text,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- EMOJI MARKERS (booking type definitions for calendar sync)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_emoji_markers (
  id serial PRIMARY KEY,
  emoji text NOT NULL,
  code_name text NOT NULL UNIQUE,
  marker_type text NOT NULL
    CHECK (marker_type IN ('appointment', 'status')),
  description text,
  counts_toward_limit boolean NOT NULL DEFAULT false,
  limit_type text DEFAULT 'none'
    CHECK (limit_type IN ('dropoff', 'waiting', 'headsup', 'none')),
  notes text,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- GIFT CERTIFICATES
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_gift_certificates (
  id serial PRIMARY KEY,
  gc_code text NOT NULL UNIQUE,
  discount_type text NOT NULL DEFAULT 'dollar'
    CHECK (discount_type IN ('dollar', 'percent')),
  amount numeric NOT NULL DEFAULT 0,
  charge_deposit boolean NOT NULL DEFAULT true,
  redeemed boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  redeemed_booking_id text, -- links to auto_bookings.booking_id
  start_date date,
  end_date date,
  disable_default_discounts boolean NOT NULL DEFAULT false,
  allow_same_day boolean NOT NULL DEFAULT false,
  applicable_services text[] DEFAULT '{}', -- empty = all services
  excluded_services text[] DEFAULT '{}',
  min_purchase numeric,
  promo_note text,

  -- Purchaser info
  customer_id uuid REFERENCES customers(id),
  customer_name text,
  customer_phone text,
  customer_email text,

  -- Stripe payment reference
  stripe_payment_id text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER auto_gift_certificates_updated_at
  BEFORE UPDATE ON auto_gift_certificates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- BOOKINGS (main booking/appointment log)
-- This is the heart of the system — replaces BookingLog sheet
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL UNIQUE, -- YYMMDD-### format

  -- Customer link
  customer_id uuid REFERENCES customers(id),

  -- Booking metadata
  booking_source text NOT NULL DEFAULT 'online'
    CHECK (booking_source IN ('online', 'internal', 'gc', 'sameday', 'phone')),
  appointment_type text NOT NULL
    CHECK (appointment_type IN ('dropoff', 'waiting', 'headsup_30', 'headsup_60')),
  service_type text NOT NULL DEFAULT 'tint'
    CHECK (service_type IN ('tint', 'removal', 'alacarte')),
  emoji_marker text,

  -- Customer info (denormalized — preserves record even if customer merged/deleted)
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,

  -- Vehicle info
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  class_keys text, -- pipe-separated as stored in legacy

  -- Appointment scheduling
  appointment_date date NOT NULL,
  appointment_time time,
  duration_minutes integer,
  estimated_end_time time,

  -- Heads-up appointment tracking
  headsup_notified_at timestamptz,
  headsup_message text, -- custom message sent
  headsup_eta time, -- when they should arrive
  headsup_actual_arrival timestamptz,

  -- Services & pricing detail
  services_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,

  -- Discounts
  discount_code text,
  discount_type text CHECK (discount_type IN ('dollar', 'percent')),
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,

  -- Payment
  deposit_paid numeric DEFAULT 0,
  cc_fee numeric DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  payment_method text,
  total_paid numeric DEFAULT 0,

  -- Stripe
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,

  -- Calendar sync (Google Calendar redundancy)
  calendar_title text,
  calendar_event_id text,

  -- Status tracking
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'confirmed', 'in_progress', 'completed', 'invoiced', 'cancelled', 'no_show')),

  -- Window condition
  window_status text CHECK (window_status IN ('never', 'previously', 'unsure')),
  has_aftermarket_tint text CHECK (has_aftermarket_tint IN ('yes', 'no', 'not_sure')),

  -- Extras
  additional_interests text,
  notes text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_bookings_date ON auto_bookings(appointment_date);
CREATE INDEX IF NOT EXISTS idx_auto_bookings_customer ON auto_bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_auto_bookings_status ON auto_bookings(status);
CREATE INDEX IF NOT EXISTS idx_auto_bookings_date_type
  ON auto_bookings(appointment_date, appointment_type);

CREATE TRIGGER auto_bookings_updated_at
  BEFORE UPDATE ON auto_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- BOOKING ID SEQUENCE
-- Tracks daily counter for YYMMDD-### format
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_booking_sequence (
  id serial PRIMARY KEY,
  sequence_date date NOT NULL UNIQUE,
  last_number integer NOT NULL DEFAULT 0
);


-- ============================================================
-- BOOKING ID GENERATOR FUNCTION
-- Returns next booking_id in YYMMDD-### format
-- ============================================================
CREATE OR REPLACE FUNCTION generate_auto_booking_id()
RETURNS text AS $$
DECLARE
  today date := CURRENT_DATE;
  date_prefix text;
  next_num integer;
BEGIN
  -- Insert or increment the daily counter
  INSERT INTO auto_booking_sequence (sequence_date, last_number)
  VALUES (today, 1)
  ON CONFLICT (sequence_date)
  DO UPDATE SET last_number = auto_booking_sequence.last_number + 1
  RETURNING last_number INTO next_num;

  -- Build YYMMDD prefix
  date_prefix := to_char(today, 'YYMMDD');

  RETURN date_prefix || '-' || lpad(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
