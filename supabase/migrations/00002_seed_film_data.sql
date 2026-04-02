-- ============================================================================
-- FWT Flat Glass Schema
-- Migration 00002: Seed film types and pricing data from legacy system
-- Source: legacy/shopify-theme/assets/flatglass-estimator.js
-- ============================================================================

-- ============================================================================
-- FILM TYPES: Performance films (from FILM_DATA in flatglass-estimator.js)
-- ============================================================================
insert into film_types (type_id, category, display_name, description, interior_tone, exterior_tone, tier, heat, glare, uv_fade, privacy_day, appearance_neutral, appearance_reflective, residential, commercial) values
  ('neutral_clear', 'neutral', 'Neutral Clear', 'Virtually invisible protection', 'Neutral', 'Neutral', 6, true, false, true, false, true, false, true, true),
  ('neutral_smoke', 'neutral', 'Neutral Smoke', 'Subtle tint, natural look', 'Neutral', 'Neutral', 5, true, true, true, false, true, false, true, true),
  ('neutral_dark', 'neutral', 'Neutral Dark', 'Dark but natural appearance', 'Neutral', 'Neutral', 4, true, true, true, false, true, false, true, true),
  ('privacy_pro', 'dual_reflective', 'Privacy Pro', 'Great balance of privacy & light', 'Natural Warm Look or Crisp Cool Look', 'Subtle Reflective', 3, true, true, true, true, false, true, true, true),
  ('privacy_pro_plus', 'dual_reflective', 'Privacy Pro +', 'Strong privacy & heat control', 'Natural Warm Look or Crisp Cool Look', 'Subtle Reflective', 2, true, true, true, true, false, true, true, true),
  ('privacy_pro_max', 'dual_reflective', 'Privacy Pro Max', 'Maximum privacy & performance', 'Natural Warm Look or Crisp Cool Look', 'Subtle Reflective', 1, true, true, true, true, false, true, true, true);

-- ============================================================================
-- FILM SHADES: Performance specs and ratings per film
-- VLT, heat reduction, glare reduction from FILM_DATA
-- Pricing from PRICING_DATA (ratePerSqFt)
-- ============================================================================
insert into film_shades (type_id, film_code, film_name, vlt, glare_reduction, tser, fade_reduction, price_sqft_60) values
  ('neutral_clear', 'NC-60', 'Neutral Clear 60', 60, 20, 40, 99, 13.00),
  ('neutral_smoke', 'NS-40', 'Neutral Smoke 40', 40, 40, 55, 99, 13.00),
  ('neutral_dark', 'ND-35', 'Neutral Dark 35', 35, 75, 64, 99, 15.00),
  ('privacy_pro', 'PP-35', 'Privacy Pro 35', 35, 84, 71, 99, 13.00),
  ('privacy_pro_plus', 'PPP-25', 'Privacy Pro Plus 25', 25, 89, 82, 99, 15.00),
  ('privacy_pro_max', 'PPM-15', 'Privacy Pro Max 15', 15, 89, 82, 99, 15.00);

-- ============================================================================
-- DECORATIVE FILM TYPES: Frosted, patterned, gradient films
-- Source: DECORATIVE_FILMS array in flatglass-estimator.js
-- These are separate film types with their own pricing structure
-- ============================================================================

-- Decorative category parent types
insert into film_types (type_id, category, display_name, description, tier, decorative, privacy_full, residential, commercial) values
  ('decorative_frosted', 'decorative', 'Frosted Films', 'Complete 24/7 privacy with frosted glass appearance', 1, true, true, true, true),
  ('decorative_pattern', 'decorative', 'Patterned Films', 'Decorative patterns for privacy and style', 2, true, true, true, true),
  ('decorative_organic', 'decorative', 'Organic Films', 'Nature-inspired decorative patterns', 3, true, true, true, true),
  ('decorative_gradient', 'decorative', 'Gradient Films', 'Gradual transition patterns for modern look', 4, true, true, true, true);

-- Decorative film shades (individual products with pricing)
-- Frosted films
insert into film_shades (type_id, film_code, film_name, price_sqft_60) values
  ('decorative_frosted', 'SX-3140', 'Dusted Crystal', 18.00),
  ('decorative_frosted', 'SX-3131-UG', 'Eco Dusted', 20.00),
  ('decorative_frosted', 'SXR-9829', 'Glassfrost', 18.00);

-- Pattern films
insert into film_shades (type_id, film_code, film_name, price_sqft_60) values
  ('decorative_pattern', 'SX-1801', 'White Random Lines', 30.00),
  ('decorative_pattern', 'SX-C370', 'Dot Screen 18', 32.00),
  ('decorative_pattern', 'SX-3150', 'Geometric', 32.00),
  ('decorative_pattern', 'SX-1700', 'Sand Blast Squares', 18.00),
  ('decorative_pattern', 'SXC-130SR', 'White Stripe 1/8"', 18.00),
  ('decorative_pattern', 'SXC-3511', 'Frosted Stripes', 18.00),
  ('decorative_pattern', 'SX-C382', 'Etched Stripes 1/2"', 32.00),
  ('decorative_pattern', 'SX-SC564', 'Inclined Cell', 40.00),
  ('decorative_pattern', 'SXC-4410', 'Frosted Squares', 18.00),
  ('decorative_pattern', 'SX-C391', 'Swiss', 25.00),
  ('decorative_pattern', 'SX-1551', 'Crystal Lattice', 26.00),
  ('decorative_pattern', 'SXD-1818', 'Dots', 32.00),
  ('decorative_pattern', 'SX-SC684', 'Pyramid', 25.00);

-- Organic films
insert into film_shades (type_id, film_code, film_name, price_sqft_60) values
  ('decorative_organic', 'SX-3141', 'Dusted Leaf', 28.00),
  ('decorative_organic', 'SX-5039', 'Escape', 35.00),
  ('decorative_organic', 'SX-1546', 'Frosted Vine', 26.00),
  ('decorative_organic', 'SX-1004', 'Clear Ripple Glass', 20.00),
  ('decorative_organic', 'SX-0103C', 'White Crayon', 26.00);

-- Gradient films
insert into film_shades (type_id, film_code, film_name, price_sqft_60) values
  ('decorative_gradient', 'SXJ-0500', 'White Matte Dot', 25.00),
  ('decorative_gradient', 'SXJ-0530', 'Gradient Stripes', 25.00),
  ('decorative_gradient', 'SXJ-0541', 'Broken Lines', 38.00),
  ('decorative_gradient', 'SXJ-0548', 'Dual Feather', 38.00),
  ('decorative_gradient', 'SXJ-0582', 'Matte Dual Dot', 25.00),
  ('decorative_gradient', 'SXJ-0594', 'Triangle', 38.00),
  ('decorative_gradient', 'SXJ-0598', 'Dual Misty Frost', 25.00),
  ('decorative_gradient', 'SXJ-0599', 'Lineage Dual Frost', 38.00),
  ('decorative_gradient', 'SXJ-0545', 'Beach Grass', 25.00);

-- ============================================================================
-- QUANTITY DISCOUNT TIERS
-- Source: getQuantityDiscountTiers() in FWT_FlatGlass_Main
-- These are fetched from the QuantityDiscountTiers sheet
-- Using reasonable defaults; update from actual spreadsheet data
-- ============================================================================
insert into quantity_discounts (min_panes, max_panes, discount_percent, label, sort_order) values
  (1, 5, 0, '1-5 panes (standard pricing)', 1),
  (6, 11, 5, '6-11 panes (5% off)', 2),
  (12, 17, 10, '12-17 panes (10% off)', 3),
  (18, 23, 15, '18-23 panes (15% off)', 4),
  (24, null, 20, '24+ panes (20% off)', 5);
