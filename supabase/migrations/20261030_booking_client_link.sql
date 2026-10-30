-- Add booking_token for client-facing self-service manage link
-- Add client_id FK to directly link bookings to CRM clients

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_token_unique ON bookings(booking_token);

-- Backfill tokens for any existing rows
UPDATE bookings SET booking_token = gen_random_uuid() WHERE booking_token IS NULL;
