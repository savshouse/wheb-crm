CREATE TABLE trusted_devices (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_token            uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  verification_token      uuid        UNIQUE DEFAULT gen_random_uuid(),
  verification_expires_at timestamptz,
  device_name             text,
  verified_at             timestamptz,
  last_used_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  is_active               boolean     NOT NULL DEFAULT true
);

-- Fast lookup by device_token (used on every authenticated page load)
CREATE INDEX trusted_devices_token_idx ON trusted_devices(device_token) WHERE is_active = true;
-- Fast lookup by verification_token (used once at device registration)
CREATE INDEX trusted_devices_verify_idx ON trusted_devices(verification_token) WHERE verification_token IS NOT NULL;

ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

-- Users can read and revoke their own devices
CREATE POLICY "users select own devices"
  ON trusted_devices FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users update own devices"
  ON trusted_devices FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- All writes from the app use service role
GRANT SELECT, INSERT, UPDATE, DELETE ON trusted_devices TO authenticated;
