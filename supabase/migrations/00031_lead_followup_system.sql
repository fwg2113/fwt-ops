-- Migration 00031: Follow-up system for lead pipeline
-- Adds follow-up tracking, incentive discounts, and global defaults

-- Add follow-up tracking to auto_leads
ALTER TABLE auto_leads
  ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_discount_type TEXT,
  ADD COLUMN IF NOT EXISTS followup_discount_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Add follow-up default settings to shop_config (module-level, starts with auto tint)
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS followup_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_default_discount_type TEXT DEFAULT 'dollar',
  ADD COLUMN IF NOT EXISTS followup_default_discount_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_auto_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_auto_days INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS followup_auto_send_hour INTEGER DEFAULT 9,
  ADD COLUMN IF NOT EXISTS followup_expiry_days INTEGER DEFAULT 30;
