-- Add new columns to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS papercloud_id text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS salary numeric(12,2);

-- ─── Benefit schemes (employer-level group schemes) ───────────────────────────
CREATE TABLE IF NOT EXISTS benefit_schemes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id        uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  scheme_type        text NOT NULL,  -- pension | death_in_service | critical_illness | pmi | income_protection | other
  scheme_name        text NOT NULL,
  provider           text,
  policy_reference   text,
  salary_definition  text,           -- e.g. "Basic salary", "Total earnings"
  cover_level        text,           -- e.g. "4x salary", "£100,000"
  policy_wording_url text,
  notes              text,
  is_active          boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  created_by         uuid REFERENCES auth.users(id)
);

-- ─── Benefit memberships (person-level) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS benefit_memberships (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheme_id                 uuid REFERENCES benefit_schemes(id) ON DELETE SET NULL,  -- NULL = personal policy
  -- Denormalised / overridden fields (set for personal policies or to override scheme defaults)
  scheme_type               text NOT NULL,
  scheme_name               text,
  provider                  text,
  policy_reference          text,   -- member's individual reference / policy number
  enrolment_type            text DEFAULT 'automatic',  -- automatic | opt_in | personal
  enrolled_date             date,
  membership_start_date     date,   -- when cover actually began (may differ from enrolled_date)
  opted_out                 boolean DEFAULT false,
  opted_out_date            date,
  -- Contributions (store both; salary_at_calculation allows reconstruction of either)
  employer_contribution_pct numeric(8,4),
  employer_contribution_gbp numeric(12,2),
  employee_contribution_pct numeric(8,4),
  employee_contribution_gbp numeric(12,2),
  salary_at_calculation     numeric(12,2),
  -- Overrides
  cover_level               text,
  notes                     text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id),
  updated_at                timestamptz DEFAULT now()
);

-- ─── Contribution change history ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS benefit_contribution_changes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id             uuid NOT NULL REFERENCES benefit_memberships(id) ON DELETE CASCADE,
  effective_date            date NOT NULL,
  employer_contribution_pct numeric(8,4),
  employer_contribution_gbp numeric(12,2),
  employee_contribution_pct numeric(8,4),
  employee_contribution_gbp numeric(12,2),
  salary_at_calculation     numeric(12,2),
  change_reason             text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id)
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE benefit_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_contribution_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read benefit_schemes"   ON benefit_schemes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert benefit_schemes" ON benefit_schemes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update benefit_schemes" ON benefit_schemes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete benefit_schemes" ON benefit_schemes FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read benefit_memberships"   ON benefit_memberships FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert benefit_memberships" ON benefit_memberships FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update benefit_memberships" ON benefit_memberships FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete benefit_memberships" ON benefit_memberships FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth read benefit_contribution_changes"   ON benefit_contribution_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert benefit_contribution_changes" ON benefit_contribution_changes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update benefit_contribution_changes" ON benefit_contribution_changes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete benefit_contribution_changes" ON benefit_contribution_changes FOR DELETE TO authenticated USING (true);
