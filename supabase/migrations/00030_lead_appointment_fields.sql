-- ============================================================================
-- Migration 00030: Add pre-set appointment fields to auto_leads
-- When FLQA sends a tailored quote with a specific appointment type, date,
-- and time, those values carry over to the lead booking page so the customer
-- just confirms and pays rather than choosing from scratch.
-- ============================================================================

ALTER TABLE auto_leads
  ADD COLUMN IF NOT EXISTS pre_appointment_type TEXT,
  ADD COLUMN IF NOT EXISTS pre_appointment_date DATE,
  ADD COLUMN IF NOT EXISTS pre_appointment_time TEXT;
