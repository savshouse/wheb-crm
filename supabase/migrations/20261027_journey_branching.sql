-- Journey branching support
-- Adds branch tracking to advice_journey_steps
-- Migrates existing template steps to include stable node IDs for graph traversal

-- 1. Add branching columns to the steps tracking table
ALTER TABLE advice_journey_steps
  ADD COLUMN IF NOT EXISTS template_node_id text,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_outcome text CHECK (branch_outcome IN ('success', 'failure'));

GRANT SELECT, INSERT, UPDATE, DELETE ON advice_journey_steps TO authenticated;

-- 2. Migrate existing template step arrays to add stable node IDs
--    Handles: old string arrays, {name,task_template_id} objects, already-migrated objects
UPDATE advice_journey_templates
SET steps = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(step) = 'string' THEN
        jsonb_build_object(
          'id',               'step_' || (idx - 1)::text,
          'name',             step#>>'{}',
          'task_template_id', null
        )
      WHEN (step->>'id') IS NULL THEN
        jsonb_set(step, '{id}', to_jsonb('step_' || (idx - 1)::text))
      ELSE step
    END
    ORDER BY idx
  )
  FROM jsonb_array_elements(advice_journey_templates.steps) WITH ORDINALITY AS t(step, idx)
)
WHERE steps IS NOT NULL AND jsonb_array_length(steps) > 0;
