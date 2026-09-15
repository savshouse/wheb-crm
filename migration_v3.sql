-- ============================================================
-- Migration v3
-- Run in Supabase SQL Editor
-- ============================================================

-- Profile avatar
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Task comments (like Planner task chat)
CREATE TABLE IF NOT EXISTS task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage task_comments"
  ON task_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Meeting history (audit trail for edits)
CREATE TABLE IF NOT EXISTS meeting_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE meeting_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage meeting_history"
  ON meeting_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
