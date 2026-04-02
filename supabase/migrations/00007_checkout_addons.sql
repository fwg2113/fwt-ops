-- ============================================================
-- 00007_checkout_addons.sql
-- Checkout add-ons: discount types + warranty products
-- Both are shop-configurable, both apply as line items on invoices
-- ============================================================


-- ============================================================
-- DISCOUNT TYPES (shop-configurable discounts applied at checkout)
-- Examples: Military, Cash, Multi-Service, Senior, First Responder
-- ============================================================
CREATE TABLE IF NOT EXISTS checkout_discount_types (
  id serial PRIMARY KEY,

  -- Name + display
  name text NOT NULL,                    -- "Military Discount"
  description text,                      -- "10% off for active/veteran military"

  -- Discount value
  discount_type text NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent', 'dollar')),
  discount_value numeric NOT NULL,       -- 10 (for 10%) or 25 (for $25)

  -- Rules
  stackable boolean NOT NULL DEFAULT false,  -- can combine with other discounts?
  auto_apply boolean NOT NULL DEFAULT false,  -- auto-applied vs manual selection
  requires_verification boolean NOT NULL DEFAULT false,  -- team must verify (e.g. military ID)
  applies_to text NOT NULL DEFAULT 'balance_due'  -- 'subtotal' or 'balance_due' (after deposit)
    CHECK (applies_to IN ('subtotal', 'balance_due')),
  include_warranty boolean NOT NULL DEFAULT false,  -- include warranty amount in discount calc?

  -- Service scope (null = all services)
  applies_to_modules text[],             -- ['auto_tint', 'ppf', 'detailing'] or null for all

  -- Status
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER checkout_discount_types_updated_at
  BEFORE UPDATE ON checkout_discount_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- WARRANTY PRODUCTS (in-house warranty upsells at checkout)
-- Examples: FWT's "No Fault Warranty" with tiers
-- Each shop can name their warranty, set terms, define tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS warranty_products (
  id serial PRIMARY KEY,

  -- Product identity
  name text NOT NULL,                    -- "No Fault Warranty"
  description text,                      -- Brief description shown during checkout
  terms_text text,                       -- Full warranty terms (shown on invoice)

  -- Coverage
  coverage_years integer NOT NULL DEFAULT 3,

  -- Service scope (null = all services)
  applies_to_modules text[],             -- ['auto_tint'] or null for all

  -- Status
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER warranty_products_updated_at
  BEFORE UPDATE ON warranty_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- WARRANTY PRODUCT OPTIONS (tiers within a warranty product)
-- Each option has a name and price, added as invoice line item
-- ============================================================
CREATE TABLE IF NOT EXISTS warranty_product_options (
  id serial PRIMARY KEY,
  warranty_product_id integer NOT NULL REFERENCES warranty_products(id) ON DELETE CASCADE,

  name text NOT NULL,                    -- "No Fault - Full"
  price numeric NOT NULL DEFAULT 0,      -- $75

  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_options_product
  ON warranty_product_options(warranty_product_id);


-- ============================================================
-- SEED FWT DEFAULTS
-- ============================================================

-- Discounts
INSERT INTO checkout_discount_types (name, description, discount_type, discount_value, stackable, sort_order) VALUES
  ('Military Discount', 'Active duty and veterans', 'percent', 10, false, 1),
  ('Multi-Service Discount', 'Multiple services in one visit', 'percent', 10, false, 2),
  ('Senior Discount', '65 and older', 'percent', 10, false, 3),
  ('First Responder Discount', 'Police, fire, EMS', 'percent', 10, false, 4);

-- Warranty product
INSERT INTO warranty_products (name, description, terms_text, coverage_years, applies_to_modules) VALUES
  ('No Fault Warranty',
   '3 years unlimited free removals with half retail price retint',
   '3 years unlimited FREE removals with half retail price retest (same vehicle; NON transferable; any tint/shade). Film: D/F, $25 / W, $50 / Cars, $75 each.',
   3,
   ARRAY['auto_tint']);

-- Warranty options (using subquery for the product ID)
INSERT INTO warranty_product_options (warranty_product_id, name, price, sort_order)
SELECT wp.id, v.name, v.price, v.sort_order
FROM warranty_products wp
CROSS JOIN (VALUES
  ('Declined - No Warranty', 0, 1),
  ('No Fault - 2 Front Doors', 25, 2),
  ('No Fault - Full', 75, 3),
  ('No Fault - Windshield', 50, 4),
  ('No Fault - 2FD + Windshield', 75, 5),
  ('No Fault - Full + Windshield', 125, 6)
) AS v(name, price, sort_order)
WHERE wp.name = 'No Fault Warranty';


-- ============================================================
-- ADD COLUMNS TO auto_invoices FOR TRACKING APPLIED ADD-ONS
-- ============================================================
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS applied_discounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS applied_warranty jsonb DEFAULT NULL;
  -- applied_discounts: [{ discount_type_id, name, discount_type, discount_value, amount }]
  -- applied_warranty: { warranty_product_id, option_id, name, option_name, price }
