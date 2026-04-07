-- Add notification configuration columns to shop_config
-- Team notification settings for automated alerts
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notification_phone TEXT;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notify_team_new_booking BOOLEAN DEFAULT true;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notify_team_quote_approved BOOLEAN DEFAULT true;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notify_team_payment_received BOOLEAN DEFAULT true;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS notify_customer_booking_confirmed BOOLEAN DEFAULT true;
ALTER TABLE shop_config ADD COLUMN IF NOT EXISTS customer_booking_confirmation_template TEXT;
