-- Email threads tagged to clients from the Outlook add-in
CREATE TABLE IF NOT EXISTS client_email_threads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  conversation_id text NOT NULL,
  subject        text,
  tagged_by      uuid REFERENCES profiles(id),
  tagged_at      timestamptz DEFAULT now(),
  UNIQUE(client_id, conversation_id)
);

ALTER TABLE client_email_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage client_email_threads"
  ON client_email_threads FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT ALL ON client_email_threads TO authenticated;
