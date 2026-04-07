-- ============================================================================
-- BRAND FINANCIAL INTEGRATION
-- Connect team members, expenses, and P&L to brands
-- ============================================================================

-- Team members can belong to multiple brands
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS brand_ids BIGINT[] DEFAULT '{}';

-- Shared expense split weights per brand
-- Example: {"FWT": 0.65, "FWG": 0.35} means FWT gets 65% of shared expenses
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS shared_expense_splits JSONB DEFAULT '{}';

-- Team pay config should also track which brand the pay applies to
ALTER TABLE team_pay_config ADD COLUMN IF NOT EXISTS brand_id BIGINT REFERENCES brands(id);
