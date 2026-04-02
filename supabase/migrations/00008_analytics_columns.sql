-- ============================================================
-- 00008_analytics_columns.sql
-- Missing columns for full analytics parity with legacy spreadsheet
-- ============================================================

-- Tip tracking on invoices
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS tip_amount numeric DEFAULT 0;

-- Discount note (free text description of why discount was applied)
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS discount_note text;

-- Processor (Stripe, Square, manual, etc.)
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS payment_processor text;

-- Upsell tracking: original subtotal at booking vs final at checkout
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS starting_total numeric,        -- subtotal when originally booked
  ADD COLUMN IF NOT EXISTS upsell_amount numeric;         -- difference: final subtotal - starting total

-- Accounting sync flag
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS posted_to_books boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_to_books_at timestamptz;

-- Company/business name on customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS company_name text;
