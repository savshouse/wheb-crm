-- Add office address fields to booking_profiles
ALTER TABLE booking_profiles
  ADD COLUMN IF NOT EXISTS office_address  text,
  ADD COLUMN IF NOT EXISTS office_maps_url text;
