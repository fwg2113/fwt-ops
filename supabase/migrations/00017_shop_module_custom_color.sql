-- Migration 00017: Per-shop custom module color
-- Allows shops to override the default service_modules.color with their own
ALTER TABLE shop_modules
  ADD COLUMN IF NOT EXISTS custom_color TEXT DEFAULT NULL;
