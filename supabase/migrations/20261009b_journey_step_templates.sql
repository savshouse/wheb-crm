-- ─────────────────────────────────────────────────────────────
-- Journey step ↔ task template linking
-- Run AFTER 20261009_advice_journeys.sql
-- ─────────────────────────────────────────────────────────────

-- 1. Add task_template_id to journey steps
ALTER TABLE advice_journey_steps
  ADD COLUMN IF NOT EXISTS task_template_id uuid
    REFERENCES task_templates(id) ON DELETE SET NULL;

-- 2. Migrate template steps from plain string array to object array
--    Old: ["Fact Find", "Suitability Report"]
--    New: [{"name":"Fact Find","task_template_id":null}, ...]
UPDATE advice_journey_templates
SET steps = (
  SELECT jsonb_agg(jsonb_build_object('name', step, 'task_template_id', null))
  FROM jsonb_array_elements_text(steps) AS step
)
WHERE jsonb_typeof(steps) = 'array'
  AND jsonb_array_length(steps) > 0
  AND jsonb_typeof(steps -> 0) = 'string';
