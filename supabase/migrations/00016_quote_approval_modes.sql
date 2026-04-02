-- ============================================================================
-- Migration 00016: Quote Approval Modes
-- Three approval options: schedule+approve, just approve, approve+request dates
-- ============================================================================

-- 1. Shop config: which approval modes are enabled
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS quote_approval_modes JSONB NOT NULL DEFAULT '{"schedule_approve": true, "just_approve": true, "request_dates": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS quote_default_approval_mode TEXT NOT NULL DEFAULT 'just_approve'
    CHECK (quote_default_approval_mode IN ('schedule_approve', 'just_approve', 'request_dates'));

-- 2. Documents: per-quote approval configuration
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS approval_mode TEXT DEFAULT NULL
    CHECK (approval_mode IS NULL OR approval_mode IN ('schedule_approve', 'just_approve', 'request_dates')),
  ADD COLUMN IF NOT EXISTS available_slots JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS customer_requested_dates JSONB DEFAULT NULL;
