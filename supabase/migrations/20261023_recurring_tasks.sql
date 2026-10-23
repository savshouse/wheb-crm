ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence text CHECK (recurrence IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'biannual', 'annual')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date date;
