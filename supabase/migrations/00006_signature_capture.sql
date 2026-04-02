-- ============================================================
-- 00006_signature_capture.sql
-- Signature and initials capture on invoices
-- Stored as base64 PNG data URLs
-- ============================================================

-- Signature and initials data on invoices
ALTER TABLE auto_invoices
  ADD COLUMN IF NOT EXISTS initials_data text,        -- base64 PNG of customer initials
  ADD COLUMN IF NOT EXISTS signature_data text,       -- base64 PNG of customer signature
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,     -- when signature was captured
  ADD COLUMN IF NOT EXISTS signed_via text;           -- 'counter', 'remote_link', 'self_checkout'

-- Signature settings are stored in checkout_flow_config JSONB on shop_config
-- New keys added to the existing JSONB:
--   signature_enabled: boolean (default false)
--   signature_required: boolean (default false) -- if true, must sign before payment
--   signature_terms_text: string -- customizable terms/acceptance text
--   legality_acknowledgment_enabled: boolean (default false)
--   legality_acknowledgment_required: boolean (default false)
--   legality_acknowledgment_text: string -- customizable legal text (state-specific)

-- Update FWT's config with signature defaults
UPDATE shop_config SET checkout_flow_config = checkout_flow_config || '{
  "signature_enabled": true,
  "signature_required": true,
  "signature_terms_text": "No Refunds. I accept ALL work stated above. The product was as described and I am satisfied with the outcome. Frederick Window Tinting is not responsible for any vehicle left on the premises during off hours. FWT is not responsible for the safety/liability of the vehicle or passengers as a result of using after market window film. FWT has my permission to take photographs and/or video of my vehicle for social media content.",
  "legality_acknowledgment_enabled": true,
  "legality_acknowledgment_required": true,
  "legality_acknowledgment_text": "NO tint lines were explained to me. I understand I have purchased an illegal shade and my windows will meter up to {illegal_percent}% darker than the legal limit."
}'::jsonb
WHERE id = 1;
