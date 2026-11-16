-- PII column encryption
-- Adds _enc (AES-256-GCM ciphertext) and _hash (HMAC blind index) columns
-- alongside originals. Application writes to _enc; backfill migrates legacy rows.
-- Original plaintext columns are retained until all rows are migrated, then dropped.

-- clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_enc     text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_hash    text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone_enc     text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ni_number_enc text;

CREATE INDEX IF NOT EXISTS clients_email_hash_idx
  ON clients(email_hash)
  WHERE email_hash IS NOT NULL;

-- bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_email_enc text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_phone_enc text;

-- onsite_bookings
ALTER TABLE onsite_bookings ADD COLUMN IF NOT EXISTS attendee_email_enc text;
ALTER TABLE onsite_bookings ADD COLUMN IF NOT EXISTS attendee_phone_enc text;
