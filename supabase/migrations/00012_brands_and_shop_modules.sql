-- ============================================================================
-- Migration 00012: Brands + Shop Modules
-- Brands are customer-facing business identities (FWT, FWG)
-- Shop Modules link a shop to its enabled service modules with per-shop config
-- ============================================================================

-- ============================================================================
-- BRANDS — customer-facing business identities
-- A shop can have 1+ brands. Each brand has its own name, logo, colors, email.
-- Services are assigned to brands so invoices show the right identity.
-- ============================================================================
CREATE TABLE IF NOT EXISTS brands (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id     INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),

  -- Identity
  name        TEXT NOT NULL,                -- "Frederick Window Tinting"
  short_name  TEXT,                         -- "FWT" (for badges, abbreviations)
  logo_url    TEXT,                         -- brand logo image

  -- Contact (per-brand, overrides shop defaults)
  email_from  TEXT,                         -- sending email for this brand
  phone       TEXT,                         -- brand-specific phone (optional)
  website     TEXT,                         -- brand website URL

  -- Appearance (per-brand colors for invoices/docs)
  primary_color   TEXT DEFAULT '#dc2626',
  secondary_color TEXT DEFAULT '#1a1a1a',

  -- Config
  is_default  BOOLEAN NOT NULL DEFAULT false,  -- one brand per shop is the default
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_shop ON brands(shop_id);

-- ============================================================================
-- SHOP_MODULES — per-shop module configuration
-- Links a shop to a service module with shop-specific settings
-- This replaces the module_* boolean columns on shop_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS shop_modules (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id     INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  module_id   INT NOT NULL REFERENCES service_modules(id),

  -- Enable/disable
  enabled     BOOLEAN NOT NULL DEFAULT false,

  -- Online presence mode
  -- 'full_booking': customer self-books with date/time/deposit (auto tint style)
  -- 'pricing_only': customer sees pricing, submits request (becomes lead, no self-booking)
  -- 'none': no public-facing page for this module (quote-only, internal)
  online_mode TEXT NOT NULL DEFAULT 'none' CHECK (online_mode IN ('full_booking', 'pricing_only', 'none')),

  -- Brand assignment (which brand this service appears under on invoices/docs)
  brand_id    BIGINT REFERENCES brands(id),

  -- Scheduling (independent per module)
  has_own_schedule    BOOLEAN NOT NULL DEFAULT false,  -- uses module-specific scheduling rules
  -- If false, uses the shop's global schedule (auto_schedule table)
  -- If true, reads from a module-specific schedule table (future)

  -- Appointment types (independent per module)
  enable_dropoff      BOOLEAN NOT NULL DEFAULT true,
  enable_waiting      BOOLEAN NOT NULL DEFAULT false,
  enable_headsup_30   BOOLEAN NOT NULL DEFAULT false,
  enable_headsup_60   BOOLEAN NOT NULL DEFAULT false,

  -- Booking page config (only relevant for full_booking or pricing_only modes)
  booking_page_title  TEXT,          -- custom title for the booking/pricing page
  booking_page_subtitle TEXT,        -- custom subtitle

  -- Deposit config (can override shop defaults per module)
  override_deposit    BOOLEAN NOT NULL DEFAULT false,
  deposit_amount      NUMERIC(10,2),
  require_deposit     BOOLEAN DEFAULT true,
  deposit_refundable  BOOLEAN DEFAULT false,
  deposit_refund_hours INT DEFAULT 24,

  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(shop_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_shop_modules_shop ON shop_modules(shop_id);
