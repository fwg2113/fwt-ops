-- ============================================================
-- 00004_invoice_schema.sql
-- Invoice system + Roll ID inventory tracking
-- Invoices link to auto_bookings, store line item snapshots
-- with Roll IDs auto-applied from active inventory
-- ============================================================


-- ============================================================
-- ROLL INVENTORY (active rolls per film/shade)
-- One active roll per film+shade combo at any time
-- When a new box is opened, team updates the roll_id here
-- Invoice creation auto-fetches from this table
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_roll_inventory (
  id serial PRIMARY KEY,
  film_id integer NOT NULL REFERENCES auto_films(id) ON DELETE CASCADE,
  shade_id integer NOT NULL REFERENCES auto_film_shades(id) ON DELETE CASCADE,

  -- The manufacturer roll ID string (printed on the box)
  roll_id text NOT NULL,

  -- Roll metadata
  width_inches numeric,            -- roll width (e.g. 40, 60)
  length_feet numeric,             -- roll length when opened
  remaining_feet numeric,          -- estimated remaining
  cost_per_roll numeric,           -- purchase cost for analytics
  total_sqft numeric GENERATED ALWAYS AS (
    CASE WHEN width_inches IS NOT NULL AND length_feet IS NOT NULL
      THEN (width_inches / 12.0) * length_feet
      ELSE NULL
    END
  ) STORED,
  cost_per_sqft numeric GENERATED ALWAYS AS (
    CASE WHEN cost_per_roll IS NOT NULL AND width_inches IS NOT NULL AND length_feet IS NOT NULL
         AND width_inches > 0 AND length_feet > 0
      THEN cost_per_roll / ((width_inches / 12.0) * length_feet)
      ELSE NULL
    END
  ) STORED,

  -- Status
  is_active boolean NOT NULL DEFAULT true,  -- currently in use
  opened_at timestamptz DEFAULT now(),
  depleted_at timestamptz,                  -- when roll was finished

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Only one active roll per film+shade at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_roll_active
  ON auto_roll_inventory(film_id, shade_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_auto_roll_film_shade
  ON auto_roll_inventory(film_id, shade_id);

CREATE TRIGGER auto_roll_inventory_updated_at
  BEFORE UPDATE ON auto_roll_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- INVOICES (one per appointment checkout)
-- Public token enables customer-facing view without auth
-- Line items stored as JSONB snapshot (immutable after creation)
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,  -- INV-YYMMDD-### format

  -- Links
  booking_id uuid REFERENCES auto_bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,

  -- Public access token (URL-safe, no auth needed)
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Customer info snapshot (denormalized — survives customer edits)
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,

  -- Vehicle info snapshot
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  class_keys text,

  -- Service line items with Roll IDs baked in
  -- Each item: { label, filmName, filmAbbrev, shade, price, rollId, rollInventoryId, warrantyYears }
  line_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Pricing breakdown
  subtotal numeric NOT NULL DEFAULT 0,
  discount_code text,
  discount_type text CHECK (discount_type IN ('dollar', 'percent')),
  discount_percent numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  deposit_paid numeric DEFAULT 0,
  cc_fee_percent numeric DEFAULT 0,
  cc_fee_flat numeric DEFAULT 0,
  cc_fee_amount numeric DEFAULT 0,
  cash_discount_percent numeric DEFAULT 0,
  balance_due numeric NOT NULL DEFAULT 0,
  total_paid numeric DEFAULT 0,

  -- Payment
  payment_method text,  -- 'cc', 'cash', 'venmo', 'zelle', 'cashapp', 'applepay', 'bank_transfer'
  payment_confirmed_at timestamptz,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,

  -- Warranty info snapshot (from shop_config at invoice time)
  warranty_text text,

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partial', 'void')),

  -- Checkout flow tracking
  checkout_type text DEFAULT 'counter'
    CHECK (checkout_type IN ('counter', 'remote', 'self_checkout')),
  sent_via text,           -- 'sms', 'email', or null
  sent_at timestamptz,
  viewed_at timestamptz,

  -- Lock box (for after-hours remote pickup)
  lockbox_compartment integer,
  lockbox_code text,

  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_invoices_booking ON auto_invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_auto_invoices_customer ON auto_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_auto_invoices_status ON auto_invoices(status);
CREATE INDEX IF NOT EXISTS idx_auto_invoices_token ON auto_invoices(public_token);
CREATE INDEX IF NOT EXISTS idx_auto_invoices_date ON auto_invoices(created_at);

CREATE TRIGGER auto_invoices_updated_at
  BEFORE UPDATE ON auto_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- INVOICE NUMBER SEQUENCE
-- Tracks daily counter for INV-YYMMDD-### format
-- ============================================================
CREATE TABLE IF NOT EXISTS auto_invoice_sequence (
  id serial PRIMARY KEY,
  sequence_date date NOT NULL UNIQUE,
  last_number integer NOT NULL DEFAULT 0
);


-- ============================================================
-- INVOICE NUMBER GENERATOR
-- Returns next invoice number in INV-YYMMDD-### format
-- ============================================================
CREATE OR REPLACE FUNCTION generate_auto_invoice_number()
RETURNS text AS $$
DECLARE
  today date := CURRENT_DATE;
  date_prefix text;
  next_num integer;
BEGIN
  INSERT INTO auto_invoice_sequence (sequence_date, last_number)
  VALUES (today, 1)
  ON CONFLICT (sequence_date)
  DO UPDATE SET last_number = auto_invoice_sequence.last_number + 1
  RETURNING last_number INTO next_num;

  date_prefix := to_char(today, 'YYMMDD');

  RETURN 'INV-' || date_prefix || '-' || lpad(next_num::text, 3, '0');
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- PAYMENT CONFIRMATIONS (tracks all payments across invoices)
-- Supports multiple partial payments per invoice
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES auto_invoices(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES auto_bookings(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,

  amount numeric NOT NULL,
  processing_fee numeric DEFAULT 0,
  payment_method text NOT NULL,  -- 'cc', 'cash', 'venmo', 'zelle', 'cashapp', 'applepay', 'bank_transfer'
  processor text,                -- 'stripe', 'manual', etc.
  reference_id text,             -- Stripe payment intent, Venmo txn ID, etc.

  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),

  notes text,
  confirmed_by text,  -- team member name for manual confirmations
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_invoice ON payment_confirmations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_booking ON payment_confirmations(booking_id);
