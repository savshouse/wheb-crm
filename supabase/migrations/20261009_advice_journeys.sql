-- ─────────────────────────────────────────────────────────────
-- Advice Journey feature — run in Supabase SQL editor
-- ─────────────────────────────────────────────────────────────

-- 1. Templates (re-usable blueprints per advice type)
CREATE TABLE IF NOT EXISTS advice_journey_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  category    text NOT NULL,
  description text,
  steps       jsonb NOT NULL DEFAULT '[]',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advice_journey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access to advice_journey_templates"
  ON advice_journey_templates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Starter templates
INSERT INTO advice_journey_templates (name, category, description, steps) VALUES
(
  'Pension Transfer',
  'Pensions',
  'Full pension transfer process from initial fact find to confirmation.',
  '["Fact Find & Assessment","Transfer Analysis","Suitability Report","Client Sign-off","Transfer Submission","Confirmation & Review"]'
),
(
  'ISA',
  'Savings & Investments',
  'ISA application from risk assessment to confirmation.',
  '["Fact Find & Risk Assessment","Fund Selection","Application Submitted","Confirmation"]'
),
(
  'Fund Switch',
  'Savings & Investments',
  'Fund switch instruction process.',
  '["Review Meeting","Switch Instruction","Confirmation"]'
),
(
  'Protection',
  'Protection',
  'Protection policy from needs analysis to policy issue.',
  '["Fact Find & Needs Analysis","Research & Comparison","Suitability Report","Application","Policy Issued"]'
),
(
  'Income Drawdown',
  'Pensions',
  'Flexi-access drawdown setup and review.',
  '["Fact Find","Drawdown Analysis","Suitability Report","Client Sign-off","Implementation","Review Scheduled"]'
),
(
  'General Advice',
  'General',
  'Generic advice journey for cases that do not fit another template.',
  '["Initial Meeting","Research & Recommendation","Implementation","Confirmation"]'
);

-- 2. Active journeys (one per client per advice case)
CREATE TABLE IF NOT EXISTS advice_journeys (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id        uuid REFERENCES advice_journey_templates(id) ON DELETE SET NULL,
  title              text NOT NULL,
  category           text NOT NULL,
  status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','complete','cancelled')),
  current_step_order int NOT NULL DEFAULT 0,
  meeting_id         uuid REFERENCES meetings(id) ON DELETE SET NULL,
  assigned_to        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

ALTER TABLE advice_journeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access to advice_journeys"
  ON advice_journeys FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 3. Steps copied from template at journey creation
CREATE TABLE IF NOT EXISTS advice_journey_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id   uuid NOT NULL REFERENCES advice_journeys(id) ON DELETE CASCADE,
  step_order   int NOT NULL,
  name         text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','complete')),
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE advice_journey_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access to advice_journey_steps"
  ON advice_journey_steps FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Link tasks to journey steps
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS journey_step_id uuid
  REFERENCES advice_journey_steps(id) ON DELETE SET NULL;
