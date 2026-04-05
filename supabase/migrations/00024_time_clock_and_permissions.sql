-- Time clock entries
CREATE TABLE IF NOT EXISTS time_clock_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id integer NOT NULL DEFAULT 1,
  team_member_id uuid REFERENCES team_members(id) NOT NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  duration_minutes integer, -- computed on clock out
  notes text,
  edited_by uuid REFERENCES team_members(id), -- if admin edited
  edit_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_clock_shop ON time_clock_entries(shop_id);
CREATE INDEX IF NOT EXISTS idx_time_clock_member ON time_clock_entries(team_member_id);

-- Add login_mode to shop_config: 'user' (individual login) or 'station' (shared + PIN)
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS login_mode text DEFAULT 'user';

-- Expand role permissions schema
-- Update existing roles with comprehensive permissions
UPDATE team_roles SET permissions = jsonb_build_object(
  'full_access', true
) WHERE name = 'Owner';

UPDATE team_roles SET permissions = jsonb_build_object(
  'dashboard', true,
  'appointments', true,
  'quotes', true,
  'invoices', true,
  'checkout', true,
  'customers', true,
  'bookkeeping', true,
  'settings', true,
  'team_management', true,
  'module_settings', true,
  'consultations', true
) WHERE name = 'Manager';

UPDATE team_roles SET permissions = jsonb_build_object(
  'dashboard', true,
  'appointments', true,
  'quotes', false,
  'invoices', false,
  'checkout', false,
  'customers', false,
  'bookkeeping', false,
  'settings', false,
  'team_management', false,
  'module_settings', false,
  'consultations', false
) WHERE name = 'Installer';

UPDATE team_roles SET permissions = jsonb_build_object(
  'dashboard', true,
  'appointments', true,
  'quotes', true,
  'invoices', true,
  'checkout', true,
  'customers', true,
  'bookkeeping', false,
  'settings', false,
  'team_management', false,
  'module_settings', false,
  'consultations', true
) WHERE name = 'Front Desk';
