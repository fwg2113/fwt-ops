-- Add auth_user_id column to team_members for linking to Supabase Auth
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'technician';

-- Create index for fast lookup during auth
CREATE INDEX IF NOT EXISTS idx_team_members_auth_user_id ON team_members(auth_user_id);

-- Ensure role column has valid values
-- Roles: owner, admin, manager, technician
