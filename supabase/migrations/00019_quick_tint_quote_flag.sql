-- Add quick_tint_quote_enabled flag to shop_config
-- Controls whether the Quick Tint Quote mode is available in Quote Builder
-- Defaults to true for existing shops (FWT has this feature)
ALTER TABLE shop_config
ADD COLUMN IF NOT EXISTS quick_tint_quote_enabled boolean NOT NULL DEFAULT true;
