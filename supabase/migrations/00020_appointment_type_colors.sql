-- Configurable appointment type colors for the timeline left block
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS appointment_type_colors jsonb NOT NULL DEFAULT '{"dropoff":"#3b82f6","waiting":"#ef4444","headsup_30":"#f59e0b","headsup_60":"#f59e0b"}'::jsonb;
