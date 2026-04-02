-- ============================================================
-- 00009_universal_document_foundation.sql
-- Universal Document Foundation for SaaS Platform
--
-- This migration:
-- 1. Adds shop_id to ALL existing tenant-specific tables
-- 2. Creates service_modules registry (DB-driven, not hardcoded)
-- 3. Creates normalized documents + document_line_items tables
-- 4. Creates document_payments (replaces payment_confirmations)
-- 5. Creates subscription_plans + team_roles (data model for future)
-- 6. Updates shop_config with module content + enabled modules
-- 7. Updates invoice sequence generator for multi-tenant + doc types
-- ============================================================


-- ============================================================
-- STEP 1: ADD shop_id TO ALL EXISTING TENANT-SPECIFIC TABLES
-- Backfill with 1 (FWT's current shop_config.id)
-- Universal lookup tables (auto_vehicles, auto_films, etc.) are
-- shared catalogs and do NOT get shop_id.
-- ============================================================

-- Remove singleton constraint on shop_config
ALTER TABLE shop_config DROP CONSTRAINT IF EXISTS shop_config_id_check;

-- Add tenant_id to shop_config for future multi-tenant identity
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT gen_random_uuid();

-- Automotive booking tables
ALTER TABLE auto_services ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_pricing ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_special_shades ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_schedule ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_dropoff_slots ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_waiting_slots ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_closed_dates ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_date_overrides ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_abbreviations ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_discounts ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_emoji_markers ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_gift_certificates ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_bookings ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_booking_sequence ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_roll_inventory ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_invoices ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_invoice_sequence ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE auto_lockboxes ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;

-- Customer + payment tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE payment_confirmations ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;

-- Checkout add-on tables
ALTER TABLE checkout_discount_types ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE warranty_products ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE warranty_product_options ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;

-- Flat glass tables
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE closed_dates ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE quantity_discounts ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS shop_id integer NOT NULL DEFAULT 1;

-- Update UNIQUE constraints that need shop_id scope for multi-tenant
-- (These prevent Shop A and Shop B from colliding)

-- auto_closed_dates: was UNIQUE(closed_date), now UNIQUE(shop_id, closed_date)
ALTER TABLE auto_closed_dates DROP CONSTRAINT IF EXISTS auto_closed_dates_closed_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_closed_dates_shop_date
  ON auto_closed_dates(shop_id, closed_date);

-- auto_date_overrides: was UNIQUE(override_date), now UNIQUE(shop_id, override_date)
ALTER TABLE auto_date_overrides DROP CONSTRAINT IF EXISTS auto_date_overrides_override_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_date_overrides_shop_date
  ON auto_date_overrides(shop_id, override_date);

-- auto_booking_sequence: was UNIQUE(sequence_date), now UNIQUE(shop_id, sequence_date)
ALTER TABLE auto_booking_sequence DROP CONSTRAINT IF EXISTS auto_booking_sequence_sequence_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_booking_sequence_shop_date
  ON auto_booking_sequence(shop_id, sequence_date);

-- auto_invoice_sequence: was UNIQUE(sequence_date), now UNIQUE(shop_id, sequence_date)
ALTER TABLE auto_invoice_sequence DROP CONSTRAINT IF EXISTS auto_invoice_sequence_sequence_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_invoice_sequence_shop_date
  ON auto_invoice_sequence(shop_id, sequence_date);

-- auto_invoices.invoice_number: was UNIQUE(invoice_number), now UNIQUE(shop_id, invoice_number)
ALTER TABLE auto_invoices DROP CONSTRAINT IF EXISTS auto_invoices_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_invoices_shop_number
  ON auto_invoices(shop_id, invoice_number);

-- auto_services: was UNIQUE(service_key), now UNIQUE(shop_id, service_key)
ALTER TABLE auto_services DROP CONSTRAINT IF EXISTS auto_services_service_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_services_shop_key
  ON auto_services(shop_id, service_key);

-- auto_emoji_markers: was UNIQUE(code_name), now UNIQUE(shop_id, code_name)
ALTER TABLE auto_emoji_markers DROP CONSTRAINT IF EXISTS auto_emoji_markers_code_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_emoji_markers_shop_code
  ON auto_emoji_markers(shop_id, code_name);

-- auto_roll_inventory active roll index: was UNIQUE(film_id, shade_id) WHERE is_active
-- now UNIQUE(shop_id, film_id, shade_id) WHERE is_active
DROP INDEX IF EXISTS idx_auto_roll_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_roll_active
  ON auto_roll_inventory(shop_id, film_id, shade_id) WHERE is_active = true;

-- Expand auto_bookings.service_type for future modules
ALTER TABLE auto_bookings DROP CONSTRAINT IF EXISTS auto_bookings_service_type_check;
ALTER TABLE auto_bookings
  ADD CONSTRAINT auto_bookings_service_type_check
  CHECK (service_type IN ('tint', 'removal', 'alacarte', 'detailing', 'ceramic_coating', 'ppf', 'flat_glass', 'wraps'));


-- ============================================================
-- STEP 2: SERVICE MODULES REGISTRY
-- DB-driven module definitions. Adding a new service = inserting a row.
-- ============================================================
CREATE TABLE IF NOT EXISTS service_modules (
  id serial PRIMARY KEY,
  module_key text NOT NULL UNIQUE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  parent_category text NOT NULL DEFAULT 'AUTOMOTIVE'
    CHECK (parent_category IN ('AUTOMOTIVE', 'HOME_SERVICES', 'APPAREL', 'SIGNAGE', 'OTHER')),
  icon_name text,
  default_invoice_content jsonb DEFAULT '{}'::jsonb,
  pricing_model text DEFAULT 'custom_quote'
    CHECK (pricing_model IN ('ymm_matrix', 'size_class', 'sqft', 'custom_quote', 'flat_rate')),
  available_for_onboarding boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Seed service modules
INSERT INTO service_modules (module_key, label, color, parent_category, pricing_model, available_for_onboarding, sort_order, default_invoice_content) VALUES
  ('auto_tint', 'Window Tint', '#dc2626', 'AUTOMOTIVE', 'ymm_matrix', true, 1,
    '{"warranty_title": "Warranty Information", "warranty_text": "Your window tint service includes a manufacturer warranty on all films installed. Please refer to your installer for specific warranty terms and conditions.", "care_title": "Tint Care Instructions", "care_items": ["Avoid rolling down or cleaning windows for 3-5 days after installation.", "Use an ammonia-free window cleaner.", "Some moisture or haziness is normal during the curing period."]}'::jsonb),
  ('flat_glass', 'Flat Glass', '#0ea5e9', 'HOME_SERVICES', 'sqft', true, 2,
    '{"warranty_title": "Warranty Information", "warranty_text": "Your window film installation includes a manufacturer warranty. Please refer to your installer for specific coverage details."}'::jsonb),
  ('detailing', 'Detailing', '#8b5cf6', 'AUTOMOTIVE', 'size_class', false, 3,
    '{"warranty_title": "Service Guarantee", "warranty_text": "Your detailing service is backed by our satisfaction guarantee. Contact us within 48 hours if you have any concerns."}'::jsonb),
  ('ceramic_coating', 'Ceramic Coating', '#f59e0b', 'AUTOMOTIVE', 'size_class', false, 4,
    '{"warranty_title": "Coating Warranty", "warranty_text": "Your ceramic coating includes a manufacturer warranty. Warranty duration and coverage depend on the product applied. Please refer to your installer for specific terms.", "care_title": "Coating Care", "care_items": ["Avoid washing for 7 days after application.", "Use pH-neutral car wash soap only.", "Avoid automatic car washes with abrasive brushes."]}'::jsonb),
  ('ppf', 'Paint Protection Film', '#10b981', 'AUTOMOTIVE', 'ymm_matrix', false, 5,
    '{"warranty_title": "PPF Warranty", "warranty_text": "Your paint protection film includes a manufacturer warranty against yellowing, cracking, peeling, and staining. Please refer to your installer for specific coverage details."}'::jsonb),
  ('wraps', 'Vehicle Wraps', '#ec4899', 'AUTOMOTIVE', 'custom_quote', false, 6,
    '{"warranty_title": "Wrap Warranty", "warranty_text": "Your vehicle wrap includes a warranty on materials and installation. Please refer to your installer for specific terms and expected lifespan."}'::jsonb),
  ('signage', 'Signage', '#06b6d4', 'SIGNAGE', 'custom_quote', false, 7,
    '{}'::jsonb),
  ('apparel', 'Custom Apparel', '#a855f7', 'APPAREL', 'custom_quote', false, 8,
    '{}'::jsonb);


-- ============================================================
-- STEP 3: DOCUMENTS TABLE
-- Replaces auto_invoices. Also serves as quotes (Phase 2).
-- Every field from auto_invoices is preserved + new fields added.
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id integer NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  brand_id integer,  -- Phase 4: multi-brand. Nullable for now.

  -- Document identity
  doc_type text NOT NULL DEFAULT 'invoice'
    CHECK (doc_type IN ('quote', 'invoice')),
  doc_number text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'approved', 'revision_requested', 'in_progress', 'completed', 'paid', 'partial', 'void')),
  public_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Links
  booking_id uuid REFERENCES auto_bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,

  -- Customer snapshot (denormalized -- survives customer edits)
  customer_name text NOT NULL DEFAULT '',
  customer_email text,
  customer_phone text,

  -- Vehicle snapshot
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  class_keys text,
  vehicle_id uuid,  -- FK to auto_vehicles if applicable

  -- Financial
  subtotal numeric NOT NULL DEFAULT 0,
  discount_code text,
  discount_type text CHECK (discount_type IN ('dollar', 'percent')),
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  deposit_required numeric DEFAULT 0,
  deposit_paid numeric DEFAULT 0,
  cc_fee_percent numeric DEFAULT 0,
  cc_fee_flat numeric DEFAULT 0,
  cc_fee_amount numeric DEFAULT 0,
  cash_discount_percent numeric DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  total_paid numeric DEFAULT 0,

  -- Payment
  payment_method text,
  payment_confirmed_at timestamptz,
  payment_processor text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  tip_amount numeric DEFAULT 0,
  discount_note text,

  -- Checkout flow
  checkout_type text DEFAULT 'counter'
    CHECK (checkout_type IN ('counter', 'remote', 'self_checkout')),
  sent_via text,
  sent_at timestamptz,
  viewed_at timestamptz,

  -- Signature capture
  initials_data text,
  signature_data text,
  signed_at timestamptz,
  signed_via text,

  -- Analytics
  starting_total numeric,
  upsell_amount numeric,
  posted_to_books boolean NOT NULL DEFAULT false,
  posted_to_books_at timestamptz,

  -- Warranty content snapshot (frozen at creation -- old invoices retain their terms)
  warranty_content_snapshot jsonb,

  -- Checkout add-ons
  applied_discounts jsonb DEFAULT '[]'::jsonb,
  applied_warranty jsonb,

  -- Quote features (Phase 2 -- columns exist now for forward compat)
  options_mode boolean NOT NULL DEFAULT false,
  options_json jsonb,
  project_description text,

  -- Lock box (after-hours remote pickup)
  lockbox_compartment integer,
  lockbox_code text,

  -- Lifecycle
  notes text,
  created_at timestamptz DEFAULT now(),
  sent_at_ts timestamptz,  -- alias if needed
  approved_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_public_token ON documents(public_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_shop_number ON documents(shop_id, doc_number) WHERE doc_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_shop_created ON documents(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_shop_status ON documents(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_booking ON documents(booking_id);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_shop_type ON documents(shop_id, doc_type);

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- STEP 4: DOCUMENT LINE ITEMS
-- Normalized: each line item is its own row.
-- module field identifies which service module it belongs to.
-- custom_fields JSONB holds module-specific data.
-- ============================================================
CREATE TABLE IF NOT EXISTS document_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  module text NOT NULL DEFAULT 'auto_tint',
  group_id text,       -- future: options mode grouping within a module
  category text,       -- sub-category within module if needed

  -- Display
  description text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,

  -- Module-specific data (flexible per module)
  -- auto_tint: { filmId, filmName, filmAbbrev, shadeId, shade, shadeFront, shadeRear,
  --              rollId, rollInventoryId, warrantyYears, serviceKey, discountAmount, duration }
  -- ppf: { coverage_zone, film_type }
  -- detailing: { package_tier, size_class }
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,

  taxable boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_line_items_document ON document_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_line_items_doc_module ON document_line_items(document_id, module);
CREATE INDEX IF NOT EXISTS idx_doc_line_items_module ON document_line_items(module);

-- Partial index for Roll ID lookups (tint items with filmId)
CREATE INDEX IF NOT EXISTS idx_doc_line_items_film
  ON document_line_items((custom_fields->>'filmId'))
  WHERE custom_fields->>'filmId' IS NOT NULL;


-- ============================================================
-- STEP 5: DOCUMENT PAYMENTS
-- Replaces payment_confirmations for the new documents table.
-- payment_confirmations is kept for archived auto_invoices data.
-- ============================================================
CREATE TABLE IF NOT EXISTS document_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  shop_id integer NOT NULL DEFAULT 1,

  amount numeric NOT NULL,
  processing_fee numeric DEFAULT 0,
  payment_method text NOT NULL,
  processor text,
  reference_id text,

  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),

  notes text,
  confirmed_by text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_payments_document ON document_payments(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_payments_shop ON document_payments(shop_id, created_at DESC);


-- ============================================================
-- STEP 6: SUBSCRIPTION PLANS (minimal -- data model for future)
-- Controls which modules a shop can access based on their tier.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id serial PRIMARY KEY,
  name text NOT NULL,
  allowed_modules text[] NOT NULL DEFAULT '{}',
  max_team_members integer DEFAULT 10,
  price_monthly numeric DEFAULT 0,
  price_yearly numeric DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- STEP 7: TEAM ROLES (data model only -- UI comes later)
-- Per-shop role definitions with granular permissions.
-- ============================================================
CREATE TABLE IF NOT EXISTS team_roles (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  name text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_roles_shop ON team_roles(shop_id);

-- Seed default roles for FWT
INSERT INTO team_roles (shop_id, name, permissions, is_system) VALUES
  (1, 'Owner', '{"full_access": true}'::jsonb, true),
  (1, 'Manager', '{"view_revenue": true, "edit_settings": true, "manage_team": true, "access_all_modules": true}'::jsonb, true),
  (1, 'Technician', '{"view_revenue": false, "edit_settings": false, "manage_team": false, "access_all_modules": true}'::jsonb, true),
  (1, 'Front Desk', '{"view_revenue": false, "edit_settings": false, "manage_team": false, "access_all_modules": true, "create_invoices": true, "manage_appointments": true}'::jsonb, true);


-- ============================================================
-- STEP 8: SHOP_CONFIG ADDITIONS
-- Module content, enabled modules, subscription plan
-- ============================================================
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS module_invoice_content jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT ARRAY['auto_tint', 'flat_glass'],
  ADD COLUMN IF NOT EXISTS subscription_plan_id integer REFERENCES subscription_plans(id);

-- Seed FWT's specific warranty/care content (NOT the generic defaults)
UPDATE shop_config SET module_invoice_content = '{
  "auto_tint": {
    "warranty_title": "Warranty Information",
    "warranty_text": "All tint jobs have a lifetime warranty against fading, bubbling, cracking and peeling.\n\nWarranty issues will not be addressed until a minimum of 14 days when the film has had time to dry/cure. This warranty does not cover film removal if you are given a repair order, want to change shades, self inflicted damage, seat belt knicks, contamination on previously tinted vehicles or vehicles over 10 years in age. Invoice must be presented for ANY warranty issues.",
    "no_fault_title": "No Fault Warranty",
    "no_fault_text": "3 years unlimited FREE removals with half retail price retest (same vehicle; NON transferable; any tint/shade).\n\nFilm: D/F, $25 / W, $50 / Cars, $75 each.",
    "care_title": "Tint Care & Instructions",
    "care_items": [
      "Avoid rolling down or cleaning windows for 3-5 days. Use an ammonia-free window cleaner.",
      "Moisture in the windows is normal for up to two weeks while the tint completely dries.",
      "Streaks on the outside of vehicle are normal, it is water and baby soap. We do not clean for liability reasons.",
      "Caution should be used when releasing your seat belt, to avoid seat belt chips/knicks.",
      "During cold weather, do not roll down windows until your vehicle is fully defrosted, as it could cause peeling."
    ]
  }
}'::jsonb
WHERE id = 1;


-- ============================================================
-- STEP 9: UPDATE DOCUMENT NUMBER GENERATOR
-- Now accepts shop_id and doc_type for multi-tenant + quotes
-- Uses a new sequence table scoped by shop + type
-- ============================================================
CREATE TABLE IF NOT EXISTS document_sequence (
  id serial PRIMARY KEY,
  shop_id integer NOT NULL DEFAULT 1,
  doc_type text NOT NULL DEFAULT 'invoice',
  sequence_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  UNIQUE(shop_id, doc_type, sequence_date)
);

CREATE OR REPLACE FUNCTION generate_document_number(p_shop_id integer DEFAULT 1, p_doc_type text DEFAULT 'invoice')
RETURNS text AS $$
DECLARE
  today date := CURRENT_DATE;
  date_prefix text;
  type_prefix text;
  next_num integer;
BEGIN
  INSERT INTO document_sequence (shop_id, doc_type, sequence_date, last_number)
  VALUES (p_shop_id, p_doc_type, today, 1)
  ON CONFLICT (shop_id, doc_type, sequence_date)
  DO UPDATE SET last_number = document_sequence.last_number + 1
  RETURNING last_number INTO next_num;

  date_prefix := to_char(today, 'YYMMDD');

  IF p_doc_type = 'quote' THEN
    type_prefix := 'QTE-';
  ELSE
    type_prefix := 'INV-';
  END IF;

  RETURN type_prefix || date_prefix || '-' || lpad(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
