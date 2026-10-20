-- Add design_json to store Unlayer editor state for re-editing
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS design_json jsonb;
