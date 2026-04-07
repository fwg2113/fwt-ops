-- ============================================================================
-- PLAID BANK CONNECTIONS + VENDOR MAPPINGS
-- ============================================================================

-- Connected bank accounts via Plaid
CREATE TABLE IF NOT EXISTS plaid_connections (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  institution_id TEXT,
  account_name TEXT, -- display name like "PNC Business Checking"
  default_brand TEXT DEFAULT 'default', -- default brand for transactions from this account
  active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now()
);

-- Vendor mapping rules for auto-categorization
CREATE TABLE IF NOT EXISTS vendor_mappings (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  pattern TEXT NOT NULL, -- substring to match (case-insensitive)
  category TEXT NOT NULL, -- expense category to assign
  vendor_name TEXT, -- clean display name
  brand TEXT, -- FWT, FWG, SHARED, or null (use account default)
  filter_out BOOLEAN DEFAULT false, -- if true, skip/hide matching transactions
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_mappings_shop ON vendor_mappings(shop_id);
