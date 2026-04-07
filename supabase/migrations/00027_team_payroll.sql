-- ============================================================================
-- TEAM PAYROLL SYSTEM
-- Pay configuration, commission rules, pay periods, and pay entries
-- ============================================================================

-- Pay configuration per team member
CREATE TABLE IF NOT EXISTS team_pay_config (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  -- Base pay
  pay_type TEXT NOT NULL DEFAULT 'weekly', -- 'hourly', 'salary', 'weekly', 'commission_only'
  base_rate NUMERIC(10,2) NOT NULL DEFAULT 0, -- hourly rate, weekly amount, or annual salary

  -- Goals & bonus
  annual_goal NUMERIC(10,2) DEFAULT 0,
  bonus_pool_weight NUMERIC(5,4) DEFAULT 0, -- 0.30 = 30% of pool
  bonus_pool_eligible BOOLEAN DEFAULT false,

  -- Draw advance
  draw_enabled BOOLEAN DEFAULT false,
  draw_balance NUMERIC(10,2) DEFAULT 0, -- running draw balance

  -- Schedule
  scheduled_days TEXT[] DEFAULT '{"Mon","Tue","Wed","Thu","Fri"}', -- which days they work

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(shop_id, team_member_id)
);

-- Commission rules per team member per module/service
-- Multiple rules per person allowed (different rates for different modules)
CREATE TABLE IF NOT EXISTS team_commission_rules (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  -- What this commission applies to
  label TEXT NOT NULL, -- display name: "Auto Tint Upsell 10%", "Flat Glass 10%"
  module_keys TEXT[] NOT NULL DEFAULT '{}', -- which modules: ['auto_tint'] or ['ppf', 'wraps', 'vinyl']

  -- Commission type and rate
  commission_type TEXT NOT NULL DEFAULT 'revenue_percent',
    -- 'revenue_percent': % of total revenue for matched modules
    -- 'upsell_percent': % of (final_total - starting_total) for matched modules
    -- 'flat_per_job': flat dollar amount per completed job
  commission_rate NUMERIC(6,3) NOT NULL DEFAULT 0, -- 10.000 = 10%, or flat dollar amount

  -- Conditions
  only_assigned BOOLEAN DEFAULT true, -- only count jobs where this person is assigned

  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pay periods (weekly, biweekly, monthly -- shop configurable)
CREATE TABLE IF NOT EXISTS team_pay_periods (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL,

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT, -- "Week of Jan 6", "January 2026", etc.

  -- Bonus pool for this period
  bonus_pool_revenue NUMERIC(10,2) DEFAULT 0, -- total revenue for the period
  bonus_pool_profit NUMERIC(10,2) DEFAULT 0, -- net profit for the period
  bonus_pool_percent NUMERIC(5,2) DEFAULT 25, -- % of profit allocated to pool (default 25%)
  bonus_pool_amount NUMERIC(10,2) DEFAULT 0, -- actual pool amount (profit * percent)

  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'calculated', 'finalized'
  finalized_at TIMESTAMPTZ,
  finalized_by TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Individual pay entries (line items per person per period)
CREATE TABLE IF NOT EXISTS team_pay_entries (
  id SERIAL PRIMARY KEY,
  shop_id INTEGER NOT NULL,
  pay_period_id INTEGER REFERENCES team_pay_periods(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,

  -- Entry type
  entry_type TEXT NOT NULL,
    -- 'base': base pay
    -- 'commission': auto-calculated commission
    -- 'bonus_pool': share of bonus pool
    -- 'adjustment': manual adjustment (owner override)
    -- 'draw_advance': draw advance entry
    -- 'cold_to_hot': lead conversion bonus

  -- Details
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT, -- "Auto Tint Upsell Commission 10%", "Base Pay (Week of Jan 6)", etc.

  -- Source tracking (for commission entries)
  source_document_id INTEGER, -- FK to documents table (the invoice that generated this commission)
  source_module TEXT, -- which module this came from
  commission_rule_id INTEGER REFERENCES team_commission_rules(id),

  -- For upsell commissions: the breakdown
  starting_total NUMERIC(10,2), -- original booking total
  final_total NUMERIC(10,2), -- final invoice total
  upsell_amount NUMERIC(10,2), -- the delta

  -- Owner override
  override_by TEXT, -- who made the adjustment
  override_reason TEXT, -- why (for the regular customer scenario)

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add starting_total_override to auto_bookings for owner edits
-- This lets the owner adjust the baseline for commission calculation
-- without changing the actual booking record
ALTER TABLE auto_bookings ADD COLUMN IF NOT EXISTS starting_total_override NUMERIC(10,2);
ALTER TABLE auto_bookings ADD COLUMN IF NOT EXISTS starting_total_override_reason TEXT;
ALTER TABLE auto_bookings ADD COLUMN IF NOT EXISTS starting_total_override_by TEXT;

-- Shop-level payroll config
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS pay_period_type TEXT DEFAULT 'monthly'; -- 'weekly', 'biweekly', 'monthly'
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS bonus_pool_percent NUMERIC(5,2) DEFAULT 25; -- % of net profit for bonus pool
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS payroll_modules TEXT[] DEFAULT '{}'; -- which modules count for commission tracking
