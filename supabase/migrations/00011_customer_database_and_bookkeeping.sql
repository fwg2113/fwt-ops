-- ============================================================================
-- Migration 00011: Customer Database + Bookkeeping Foundation
-- Customer vehicles, job history, transactions ledger, expense categories
-- ============================================================================

-- ============================================================================
-- CUSTOMER VEHICLES — links customers to vehicles they've brought in
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id       INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  vehicle_year  INT,
  vehicle_make  TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_id    BIGINT REFERENCES auto_vehicles(id),  -- optional link to YMM database

  first_seen    DATE DEFAULT CURRENT_DATE,
  last_seen     DATE DEFAULT CURRENT_DATE,
  job_count     INT NOT NULL DEFAULT 1,
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer ON customer_vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_shop ON customer_vehicles(shop_id);
-- Prevent duplicate vehicle entries for same customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_vehicles_unique
  ON customer_vehicles(shop_id, customer_id, vehicle_year, vehicle_make, vehicle_model);


-- ============================================================================
-- CUSTOMER JOBS — imported historical job records (not live invoices)
-- For shops importing their existing customer/job history
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_jobs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id       INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id    BIGINT REFERENCES customer_vehicles(id),

  -- Job details
  job_date      DATE NOT NULL,
  vehicle_desc  TEXT,           -- "2024 Civic" (denormalized for display)
  services_summary TEXT,        -- human-readable services string

  -- Service breakdown (structured)
  full_service  TEXT,           -- e.g. "i3 15%/56%"
  two_fd        TEXT,           -- e.g. "BC 30%"
  windshield    TEXT,           -- e.g. "i3 70%"
  sun_strip     TEXT,           -- e.g. "BLK 5%"
  sun_roof      TEXT,
  removal       TEXT,

  -- Financials
  subtotal      NUMERIC(10,2) DEFAULT 0,
  discount      NUMERIC(10,2) DEFAULT 0,
  discount_note TEXT,
  nfw_amount    NUMERIC(10,2) DEFAULT 0,   -- no-fault warranty
  tip           NUMERIC(10,2) DEFAULT 0,
  total         NUMERIC(10,2) DEFAULT 0,
  deposit       NUMERIC(10,2) DEFAULT 0,
  balance_due   NUMERIC(10,2) DEFAULT 0,
  starting_total NUMERIC(10,2) DEFAULT 0,
  upsell_amount NUMERIC(10,2) DEFAULT 0,

  -- Payment
  payment_method TEXT,          -- Cash, Credit Card, Venmo, CashApp, etc.
  processor     TEXT,           -- Stripe, Square, PayPal, etc.
  source        TEXT,           -- online, walk-in, phone, etc.

  -- References
  gc_code       TEXT,
  invoice_num   TEXT,
  company       TEXT,
  notes         TEXT,

  -- Import tracking
  import_batch_id TEXT,         -- groups rows from the same CSV import
  imported_at   TIMESTAMPTZ DEFAULT now(),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_jobs_customer ON customer_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_jobs_shop ON customer_jobs(shop_id);
CREATE INDEX IF NOT EXISTS idx_customer_jobs_date ON customer_jobs(job_date);


-- ============================================================================
-- TRANSACTIONS — canonical financial ledger (replaces Google Sheets FinCore)
-- Every dollar in or out flows through this table
-- ============================================================================
CREATE TABLE IF NOT EXISTS transactions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id         INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  transaction_id  TEXT NOT NULL,           -- TXN-00001 format

  -- Core fields
  txn_date        DATE NOT NULL,
  brand           TEXT NOT NULL DEFAULT 'default',  -- business/brand (FWT, FWG, SHARED, etc.)
  direction       TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  event_type      TEXT NOT NULL CHECK (event_type IN ('SALE', 'EXPENSE', 'FEE', 'TRANSFER', 'REFUND')),
  amount          NUMERIC(10,2) NOT NULL,
  account         TEXT,                    -- Stripe, Cash, Check, Bank Transfer, Credit Card, etc.
  category        TEXT NOT NULL,           -- from expense_categories

  -- Context
  service_line    TEXT,                    -- Tint, Flat Glass, Detailing, etc.
  vendor_or_customer TEXT,
  job_id          TEXT,                    -- reference to booking or job
  invoice_id      TEXT,                    -- reference to document
  payment_id      TEXT,                    -- Stripe payment intent, etc.
  payment_method  TEXT,
  processor       TEXT,
  memo            TEXT,

  -- Audit
  posted_by       TEXT,
  posted_at       TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_txn_id ON transactions(shop_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop ON transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_direction ON transactions(shop_id, direction);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(shop_id, category);

-- Sequence for generating transaction IDs per shop
CREATE TABLE IF NOT EXISTS transaction_sequence (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id   INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  last_number INT NOT NULL DEFAULT 0,
  UNIQUE(shop_id)
);

-- RPC to generate next transaction ID
CREATE OR REPLACE FUNCTION generate_transaction_id(p_shop_id INT DEFAULT 1)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  next_num integer;
BEGIN
  INSERT INTO transaction_sequence (shop_id, last_number)
  VALUES (p_shop_id, 1)
  ON CONFLICT (shop_id)
  DO UPDATE SET last_number = transaction_sequence.last_number + 1
  RETURNING last_number INTO next_num;

  RETURN 'TXN-' || lpad(next_num::text, 6, '0');
END;
$$;


-- ============================================================================
-- EXPENSE CATEGORIES — configurable per shop
-- ============================================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id     INT NOT NULL DEFAULT 1 REFERENCES shop_config(id),
  type        TEXT NOT NULL CHECK (type IN ('expense', 'revenue')),
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_shop ON expense_categories(shop_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_categories_unique ON expense_categories(shop_id, type, name);
