-- Run this in the Supabase dashboard SQL Editor
-- If you get "already exists" errors, run the DROP line first then re-run everything.

DROP TABLE IF EXISTS task_comments CASCADE;

CREATE TABLE task_comments (
  id         uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id    uuid         NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    uuid         NOT NULL,
  content    text         NOT NULL,
  created_at timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX task_comments_task_id_idx     ON task_comments (task_id);
CREATE INDEX task_comments_created_at_idx  ON task_comments (task_id, created_at DESC);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view task comments"
  ON task_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON task_comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
  ON task_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
