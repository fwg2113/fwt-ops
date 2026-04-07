-- Add view_preferences JSONB column to team_members
-- Stores per-page filter defaults for each user/station
-- Example: { "appointments": ["auto_tint"], "invoicing": ["auto_tint", "flat_glass"] }
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS view_preferences JSONB DEFAULT '{}';
