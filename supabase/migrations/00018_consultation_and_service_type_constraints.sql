-- Migration 00018: Add consultation appointment type + expand service_type constraint
-- Consultation appointments are for in-person meetings without quotes/pricing

-- Expand appointment_type to include consultation and off_site
ALTER TABLE auto_bookings DROP CONSTRAINT IF EXISTS auto_bookings_appointment_type_check;
ALTER TABLE auto_bookings ADD CONSTRAINT auto_bookings_appointment_type_check
  CHECK (appointment_type = ANY (ARRAY['dropoff', 'waiting', 'headsup_30', 'headsup_60', 'consultation', 'off_site']));

-- Expand service_type to include module keys + legacy values
ALTER TABLE auto_bookings DROP CONSTRAINT IF EXISTS auto_bookings_service_type_check;
ALTER TABLE auto_bookings ADD CONSTRAINT auto_bookings_service_type_check
  CHECK (service_type = ANY (ARRAY[
    'tint', 'removal', 'alacarte', 'detailing', 'ceramic_coating', 'ppf', 'flat_glass', 'wraps',
    'auto_tint', 'signage', 'consultation'
  ]));
