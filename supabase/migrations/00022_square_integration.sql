-- Square B2 Platform integration columns on shop_config
-- Stores per-tenant Square OAuth credentials
ALTER TABLE shop_config
ADD COLUMN IF NOT EXISTS square_access_token text,
ADD COLUMN IF NOT EXISTS square_refresh_token text,
ADD COLUMN IF NOT EXISTS square_merchant_id text,
ADD COLUMN IF NOT EXISTS square_token_expires_at text,
ADD COLUMN IF NOT EXISTS square_connected boolean NOT NULL DEFAULT false;
