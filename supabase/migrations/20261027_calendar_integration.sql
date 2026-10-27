-- Calendar integration: add calendar fields to meetings table
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS teams_meeting_url text,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text;

-- Allow meetings without a client (for internal team meetings booked from the calendar)
ALTER TABLE meetings ALTER COLUMN client_id DROP NOT NULL;

GRANT ALL ON meetings TO authenticated;
GRANT ALL ON meetings TO service_role;
