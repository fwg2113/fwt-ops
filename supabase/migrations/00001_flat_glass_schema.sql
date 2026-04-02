-- ============================================================================
-- FWT Flat Glass Schema
-- Migration 00001: Core tables for the Flat Glass Configurator/Estimator
-- ============================================================================

-- ============================================================================
-- SETTINGS: Key-value configuration (company info, pricing defaults)
-- ============================================================================
create table settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz default now()
);

insert into settings (key, value, description) values
  ('company_name', 'Frederick Window Tinting', 'Company name for quotes'),
  ('company_phone', '240-415-8527', 'Company phone number'),
  ('company_email', 'frederickwindowtint@gmail.com', 'Company email'),
  ('minimum_charge', '150', 'Minimum job charge in dollars'),
  ('default_markup', '8', 'Default markup multiplier on film cost'),
  ('tax_rate', '0', 'Tax rate as decimal (0.06 = 6%)'),
  ('deposit_percent', '50', 'Deposit percentage for bookings'),
  ('business_address', '5728 Buckeystown Pike Unit B, Frederick, MD 21704', 'Business location'),
  ('business_lat', '39.3687', 'Business latitude'),
  ('business_lng', '-77.4261', 'Business longitude');

-- ============================================================================
-- FILM_TYPES: Film product categories with capability flags
-- Maps to legacy "Film Types" sheet
-- ============================================================================
create table film_types (
  id serial primary key,
  type_id text unique not null,        -- e.g. 'neutral_clear'
  category text not null,              -- e.g. 'neutral', 'dual_reflective', 'silver', etc.
  brand text,
  display_name text not null,
  description text,
  interior_tone text,
  exterior_tone text,
  shades_available text,               -- comma-separated shade list
  hero_stat_label text,
  hero_stat_value text,
  class_keys text,
  tier int default 1,                  -- sort order (1=top, 2, 3)
  -- Capability flags (for filtering)
  heat boolean default false,
  glare boolean default false,
  uv_fade boolean default false,
  privacy_day boolean default false,
  privacy_full boolean default false,
  security boolean default false,
  decorative boolean default false,
  exterior boolean default false,
  -- Appearance flags
  appearance_neutral boolean default false,
  appearance_reflective boolean default false,
  appearance_dark boolean default false,
  -- Property type flags
  residential boolean default true,
  commercial boolean default true,
  -- Status
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- FILM_SHADES: Individual shade options per film type with pricing
-- Maps to legacy "Film Shades" sheet
-- ============================================================================
create table film_shades (
  id serial primary key,
  type_id text not null references film_types(type_id),
  film_code text not null,             -- e.g. 'DR15'
  film_name text not null,             -- e.g. 'Dual Reflective 15'
  interior_tone text,
  exterior_tone text,
  -- Pricing per sq ft by roll width
  price_sqft_36 numeric(10,4),         -- 36" roll
  price_sqft_48 numeric(10,4),         -- 48" roll
  price_sqft_60 numeric(10,4),         -- 60" roll (most common)
  price_sqft_72 numeric(10,4),         -- 72" roll
  -- Specs
  vlt numeric(5,1),                    -- Visible Light Transmission %
  vlre numeric(5,1),                   -- Visible Light Reflectance Exterior %
  glare_reduction numeric(5,1),        -- Glare Reduction %
  tser numeric(5,1),                   -- Total Solar Energy Rejected %
  fade_reduction numeric(5,1),         -- Fade Reduction %
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================================
-- DISTANCE_ZONES: Consultation fee tiers based on mileage
-- Maps to legacy "DistanceZones" sheet
-- ============================================================================
create table distance_zones (
  id serial primary key,
  zone_id text unique not null,        -- e.g. 'zone_20'
  min_miles numeric(6,1) not null,
  max_miles numeric(6,1),              -- null = unlimited (request only)
  fee numeric(8,2),                    -- null = "call for quote"
  label text,                          -- display label
  sort_order int default 0,
  created_at timestamptz default now()
);

insert into distance_zones (zone_id, min_miles, max_miles, fee, label, sort_order) values
  ('zone_20', 0, 20, 100, '0-20 miles', 1),
  ('zone_30', 20.1, 30, 150, '20-30 miles', 2),
  ('zone_50', 30.1, 50, 250, '30-50 miles', 3),
  ('zone_custom', 50.1, null, null, '50+ miles (request only)', 4);

-- ============================================================================
-- SCHEDULE: Business hours per day of week for flat glass appointments
-- Maps to legacy "Schedule" sheet
-- ============================================================================
create table schedule (
  id serial primary key,
  day_of_week text unique not null,    -- 'Monday', 'Tuesday', etc.
  enabled boolean default true,
  open_time time,                      -- e.g. '09:00'
  close_time time,                     -- e.g. '17:00'
  max_appointments int default 3,
  available_slots text,                -- pipe-delimited specific slots, e.g. '9:00 AM|11:00 AM|1:00 PM'
  created_at timestamptz default now()
);

insert into schedule (day_of_week, enabled, open_time, close_time, max_appointments) values
  ('Monday', true, '09:00', '17:00', 3),
  ('Tuesday', true, '09:00', '17:00', 3),
  ('Wednesday', true, '09:00', '17:00', 3),
  ('Thursday', true, '09:00', '17:00', 3),
  ('Friday', true, '09:00', '17:00', 3),
  ('Saturday', false, null, null, 0),
  ('Sunday', false, null, null, 0);

-- ============================================================================
-- CLOSED_DATES: Dates when flat glass appointments are blocked
-- Maps to legacy "ClosedDates" sheet
-- ============================================================================
create table closed_dates (
  id serial primary key,
  closed_date date not null,
  reason text,
  created_at timestamptz default now()
);

-- ============================================================================
-- QUANTITY_DISCOUNTS: Volume discount tiers based on window count
-- Maps to legacy "QuantityDiscountTiers" sheet
-- ============================================================================
create table quantity_discounts (
  id serial primary key,
  min_panes int not null,
  max_panes int,                       -- null = unlimited
  discount_percent numeric(5,2) default 0,
  label text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================================
-- ROOM_TYPES: Predefined room types for the configurator
-- Maps to legacy "Room Types" sheet
-- ============================================================================
create table room_types (
  id serial primary key,
  name text not null,
  sort_order int default 0,
  active boolean default true
);

insert into room_types (name, sort_order) values
  ('Living Room', 1),
  ('Kitchen', 2),
  ('Master Bedroom', 3),
  ('Bedroom', 4),
  ('Bathroom', 5),
  ('Office', 6),
  ('Dining Room', 7),
  ('Laundry Room', 8),
  ('Garage', 9),
  ('Sunroom', 10),
  ('Basement', 11),
  ('Conference Room', 12),
  ('Lobby', 13),
  ('Storefront', 14),
  ('Other', 15);

-- ============================================================================
-- ESTIMATES: Customer-facing quotes (from the configurator)
-- Maps to legacy "Estimates" sheet in Flat Glass Configurator
-- ============================================================================
create table estimates (
  id uuid primary key default gen_random_uuid(),
  estimate_id text unique not null,    -- human-readable ID: FWT-YYMMDD-###
  property_type text,                  -- 'residential' or 'commercial'
  -- Customer info
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  -- Selection
  selected_film_type text,             -- references film_types.type_id
  selected_shade text,                 -- references film_shades.film_code
  -- Totals
  total_sqft numeric(10,2) default 0,
  total_windows int default 0,
  total_price numeric(10,2) default 0,
  -- Status
  status text default 'Draft',         -- Draft, Sent, Accepted, Expired
  notes text,
  -- Structured data
  rooms jsonb default '[]'::jsonb,     -- room-by-room window measurements
  criteria jsonb default '{}'::jsonb,  -- filter criteria used
  -- Tracking
  sent_date timestamptz,
  sent_method text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- SUBMISSIONS: Full quote submissions (from the estimator flow)
-- Maps to legacy "Submissions" sheet in FWT Flat Glass
-- This is the main operational table for flat glass jobs
-- ============================================================================
create table submissions (
  id uuid primary key default gen_random_uuid(),
  submission_id text unique not null,  -- e.g. FGS-20260317-143022 or FGV-... or FGC-...
  -- Path: what the customer chose to do
  path text not null,                  -- 'save' (quote only), 'visit' (schedule consultation), 'commit' (book + pay)
  status text default 'New',           -- New, Pending Review, Deposit Paid, Completed, Cancelled
  -- Customer info
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  customer_address text,
  -- Film selection
  film_id text,                        -- references film_types.type_id
  film_name text,                      -- denormalized for display
  -- Window data
  total_windows int default 0,
  total_sqft numeric(10,2) default 0,
  has_oversized boolean default false,
  rooms jsonb default '[]'::jsonb,     -- room measurements + photos
  -- Pricing
  price numeric(10,2) default 0,       -- calculated price
  override_price numeric(10,2),        -- manual override (admin)
  commit_price numeric(10,2),          -- final agreed price
  deposit_amount numeric(10,2),        -- deposit collected
  discount_percent numeric(5,2) default 0,
  visit_fee numeric(8,2),             -- consultation fee based on distance
  -- Customer answers (from questionnaire)
  problems text,                       -- comma-separated: 'heat, glare, uv_fade'
  appearance text,                     -- 'neutral', 'reflective'
  light_preference text,
  warm_cool text,
  timeline text,
  -- Distance & scheduling
  distance_miles numeric(6,1),
  appointment_date date,
  appointment_time time,
  -- Integration
  event_id text,                       -- calendar event ID (Supabase-native in future)
  shopify_order_id text,
  discount_note text,
  -- Photos
  photo_folder_url text,
  room_photo_count int default 0,
  -- Tracking
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- APPOINTMENTS: Supabase-native calendar (replaces Google Calendar)
-- New table — no legacy equivalent. This IS the calendar.
-- ============================================================================
create table appointments (
  id uuid primary key default gen_random_uuid(),
  -- Link to source
  submission_id text references submissions(submission_id),
  -- Scheduling
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes int default 60,
  -- Customer info (denormalized for quick display)
  customer_name text not null,
  customer_phone text,
  customer_email text,
  customer_address text,
  -- Job details
  title text not null,                 -- display title for calendar view
  description text,
  job_type text default 'flat_glass',  -- 'flat_glass', 'auto_tint' (future)
  -- Status
  status text default 'scheduled',     -- scheduled, confirmed, in_progress, completed, cancelled, no_show
  -- Tracking
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
create index idx_film_shades_type_id on film_shades(type_id);
create index idx_estimates_status on estimates(status);
create index idx_estimates_created on estimates(created_at desc);
create index idx_submissions_status on submissions(status);
create index idx_submissions_created on submissions(created_at desc);
create index idx_submissions_customer_phone on submissions(customer_phone);
create index idx_submissions_customer_email on submissions(customer_email);
create index idx_appointments_date on appointments(appointment_date);
create index idx_appointments_status on appointments(status);
create index idx_appointments_submission on appointments(submission_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger settings_updated_at before update on settings
  for each row execute function update_updated_at();
create trigger film_types_updated_at before update on film_types
  for each row execute function update_updated_at();
create trigger estimates_updated_at before update on estimates
  for each row execute function update_updated_at();
create trigger submissions_updated_at before update on submissions
  for each row execute function update_updated_at();
create trigger appointments_updated_at before update on appointments
  for each row execute function update_updated_at();
