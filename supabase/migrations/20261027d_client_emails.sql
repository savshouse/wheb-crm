CREATE TABLE IF NOT EXISTS client_emails (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  label       text        NOT NULL DEFAULT 'Work',
  is_primary  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_emails_client_id_idx ON client_emails(client_id);

-- Migrate existing clients.email → client_emails as primary
INSERT INTO client_emails (client_id, email, label, is_primary)
SELECT id, email, 'Work', true
FROM clients
WHERE email IS NOT NULL AND email != '';

-- Ensure at most one primary per client
CREATE UNIQUE INDEX IF NOT EXISTS client_emails_primary_idx ON client_emails(client_id) WHERE is_primary = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON client_emails TO authenticated;
