-- Add options_mode flag to auto_leads for FLQA Options Mode
-- When true, the lead booking page shows a pick-one-per-service UI
ALTER TABLE auto_leads ADD COLUMN IF NOT EXISTS options_mode boolean NOT NULL DEFAULT false;
