-- Add per-team-member ring schedule to call_settings
-- Schedule is a JSONB object with day keys (mon-sun), each containing:
--   { "start": "HH:MM", "end": "HH:MM" } or null (off that day)
-- null schedule = always ring (backwards compatible)
-- Times are interpreted in the shop's timezone (shop_config.shop_timezone)

ALTER TABLE call_settings
  ADD COLUMN IF NOT EXISTS schedule JSONB DEFAULT NULL;

-- Example schedule:
-- {
--   "mon": { "start": "07:00", "end": "20:00" },
--   "tue": { "start": "07:00", "end": "20:00" },
--   "wed": { "start": "07:00", "end": "20:00" },
--   "thu": { "start": "07:00", "end": "20:00" },
--   "fri": { "start": "07:00", "end": "20:00" },
--   "sat": null,
--   "sun": null
-- }
