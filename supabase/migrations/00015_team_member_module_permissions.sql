-- ============================================================================
-- Migration 00015: Team Member Module Permissions
-- Adds module_permissions array, role_id FK, and appointment assignment
-- ============================================================================

-- 1. Module permissions: which modules this team member can work
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS module_permissions TEXT[] DEFAULT ARRAY['auto_tint'];

-- 2. Role ID: links to team_roles table
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES team_roles(id);

-- 3. Assigned team member on appointments
ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS assigned_team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auto_bookings_assigned ON auto_bookings(assigned_team_member_id) WHERE assigned_team_member_id IS NOT NULL;

-- 4. Backfill module_permissions from department
UPDATE team_members SET module_permissions = CASE
  WHEN department LIKE '%auto%' AND department LIKE '%flat_glass%' THEN ARRAY['auto_tint', 'flat_glass']
  WHEN department LIKE '%flat_glass%' THEN ARRAY['flat_glass']
  WHEN department LIKE '%auto%' THEN ARRAY['auto_tint']
  ELSE ARRAY['auto_tint']
END;

-- 5. Backfill role_id from role text
UPDATE team_members tm SET role_id = tr.id
FROM team_roles tr
WHERE tr.shop_id = tm.shop_id AND (
  (tm.role = 'technician' AND tr.name = 'Technician') OR
  (tm.role = 'admin' AND tr.name = 'Owner') OR
  (tm.role = 'manager' AND tr.name = 'Manager') OR
  (tm.role = 'front_desk' AND tr.name = 'Front Desk')
);
