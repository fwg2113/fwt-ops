-- Migration 00032: Google Calendar integration
-- OAuth tokens + calendar ID on shop_config, event ID on bookings

ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS google_calendar_connected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_token_expiry TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS google_calendar_email TEXT;

ALTER TABLE auto_bookings
  ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;
