-- Run this in the Supabase dashboard SQL Editor (or via supabase db push)

-- ─── activity_log ─────────────────────────────────────────────
-- General audit trail for client profile changes, employer changes,
-- and relationship additions / removals.

CREATE TABLE IF NOT EXISTS activity_log (
  id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type  text         NOT NULL,  -- 'client', 'relationship'
  entity_id    uuid         NOT NULL,  -- always the client id the entry relates to
  action       text         NOT NULL,  -- 'field_updated' | 'employer_set' | 'employer_removed' | 'relationship_added' | 'relationship_removed'
  field        text,                   -- e.g. 'Name', 'Status', 'Employer'
  old_value    text,
  new_value    text,
  performed_by uuid         REFERENCES profiles(id),
  note         text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_log_entity_idx    ON activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS activity_log_created_idx   ON activity_log (created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read activity_log"
  ON activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert activity_log"
  ON activity_log FOR INSERT TO authenticated WITH CHECK (true);


-- ─── meeting_history ──────────────────────────────────────────
-- Field-level change log for meetings.

CREATE TABLE IF NOT EXISTS meeting_history (
  id           uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id   uuid         REFERENCES meetings(id) ON DELETE CASCADE,
  field        text         NOT NULL,
  old_value    text,
  new_value    text,
  performed_by uuid         REFERENCES profiles(id),
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_history_meeting_idx ON meeting_history (meeting_id);

ALTER TABLE meeting_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read meeting_history"
  ON meeting_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert meeting_history"
  ON meeting_history FOR INSERT TO authenticated WITH CHECK (true);
