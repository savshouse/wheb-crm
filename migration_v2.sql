-- ── WHEB CRM v2 Migration ─────────────────────────────────────────────────
-- Run in Supabase SQL Editor (Project → SQL Editor → paste & Run)

-- 1. Individual client support
ALTER TABLE clients
  ADD COLUMN type        text NOT NULL DEFAULT 'corporate' CHECK (type IN ('corporate','individual')),
  ADD COLUMN employer_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN date_of_birth date,
  ADD COLUMN ni_number   text;

-- 2. Relationships between individuals (bidirectional — one row, queried from both sides)
CREATE TABLE relationships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  related_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(individual_id, related_id)
);

ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage relationships"
  ON relationships FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. Sub-tasks (self-referential parent)
ALTER TABLE tasks
  ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;

-- 4. Task templates
CREATE TABLE task_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE task_template_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id      uuid NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  priority         text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  order_index      integer NOT NULL DEFAULT 0,
  relative_due_days integer
);

ALTER TABLE task_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can manage task_templates"
  ON task_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can manage task_template_items"
  ON task_template_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
