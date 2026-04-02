-- ============================================================================
-- Migration 00013: Brand Logos + Invoice Branding
-- Adds logo columns to brands, invoice brand mode to shop_config,
-- and per-document brand display override to documents
-- ============================================================================

-- 1. Brands: rename logo_url to logo_square_url, add logo_wide_url
ALTER TABLE brands
  RENAME COLUMN logo_url TO logo_square_url;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS logo_wide_url TEXT;

-- 2. Shop Config: add invoice brand display defaults
ALTER TABLE shop_config
  ADD COLUMN IF NOT EXISTS invoice_brand_mode TEXT NOT NULL DEFAULT 'auto'
    CHECK (invoice_brand_mode IN ('auto', 'fixed')),
  ADD COLUMN IF NOT EXISTS invoice_brand_fixed_id BIGINT REFERENCES brands(id);

-- 3. Documents: add per-document brand display override
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS brand_display_mode TEXT DEFAULT NULL
    CHECK (brand_display_mode IS NULL OR brand_display_mode IN ('auto', 'fixed')),
  ADD COLUMN IF NOT EXISTS brand_display_ids BIGINT[] DEFAULT NULL;

-- 4. Create storage bucket for brand logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-logos', 'brand-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies for brand-logos bucket
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_logos_public_read') THEN
    CREATE POLICY brand_logos_public_read ON storage.objects FOR SELECT
      USING (bucket_id = 'brand-logos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_logos_auth_insert') THEN
    CREATE POLICY brand_logos_auth_insert ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'brand-logos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'brand_logos_auth_delete') THEN
    CREATE POLICY brand_logos_auth_delete ON storage.objects FOR DELETE
      USING (bucket_id = 'brand-logos');
  END IF;
END $$;
