-- ============================================================================
-- Migration 00010: Auto Leads table
-- Tracks pre-filled booking links sent from Pricing Lookup
-- ============================================================================

CREATE TABLE IF NOT EXISTS auto_leads (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shop_id       BIGINT DEFAULT 1 REFERENCES shop_config(id),
  token         TEXT NOT NULL UNIQUE,

  -- Customer info (optional at creation time)
  customer_name  TEXT,
  customer_phone TEXT,
  customer_email TEXT,

  -- Vehicle info
  vehicle_year   INT NOT NULL,
  vehicle_make   TEXT NOT NULL,
  vehicle_model  TEXT NOT NULL,
  vehicle_id     BIGINT REFERENCES auto_vehicles(id),

  -- Vehicle class keys (for booking payload)
  class_keys     TEXT,

  -- Services snapshot (includes film_id, film_name, shade_front, shade_rear, price per service)
  services       JSONB NOT NULL DEFAULT '[]',
  total_price    NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Deposit config (overrideable per lead)
  charge_deposit BOOLEAN NOT NULL DEFAULT true,
  deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Tracking
  send_method    TEXT NOT NULL DEFAULT 'copy',  -- 'sms', 'email', 'copy'
  status         TEXT NOT NULL DEFAULT 'sent',  -- 'sent', 'opened', 'booked', 'expired'
  link_opened_at TIMESTAMPTZ,
  booked_at      TIMESTAMPTZ,
  booking_id     UUID REFERENCES auto_bookings(id),

  -- Metadata
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     TEXT,  -- team member who created the lead
  notes          TEXT
);

-- Index for token lookups (booking page will look up by token)
CREATE INDEX IF NOT EXISTS idx_auto_leads_token ON auto_leads(token);
CREATE INDEX IF NOT EXISTS idx_auto_leads_shop_id ON auto_leads(shop_id);
CREATE INDEX IF NOT EXISTS idx_auto_leads_status ON auto_leads(status);
