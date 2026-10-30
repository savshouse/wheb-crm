-- Per-company onsite booking token (one link per company, permanent)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS onsite_booking_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS clients_onsite_token_idx ON clients(onsite_booking_token);

-- On-site visit days
CREATE TABLE IF NOT EXISTS onsite_days (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  profile_id              uuid        NOT NULL REFERENCES profiles(id),
  address                 text        NOT NULL,
  meeting_room            text,
  date                    date        NOT NULL,
  timezone                text        NOT NULL DEFAULT 'Europe/London',
  calendar_block_event_id text,
  notes                   text,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Slots within an on-site day (variable duration, capacity, label)
CREATE TABLE IF NOT EXISTS onsite_slots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  onsite_day_id uuid        NOT NULL REFERENCES onsite_days(id) ON DELETE CASCADE,
  start_time    time        NOT NULL,
  end_time      time        NOT NULL,
  label         text,
  max_capacity  int         NOT NULL DEFAULT 1 CHECK (max_capacity >= 1),
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Individual bookings against a slot
CREATE TABLE IF NOT EXISTS onsite_bookings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  onsite_slot_id    uuid        NOT NULL REFERENCES onsite_slots(id) ON DELETE CASCADE,
  attendee_name     text        NOT NULL,
  attendee_email    text        NOT NULL,
  attendee_phone    text,
  notes             text,
  booking_token     uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  calendar_event_id text,
  status            text        NOT NULL DEFAULT 'confirmed'
                                CHECK (status IN ('confirmed', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS onsite_days_client_idx    ON onsite_days(client_id);
CREATE INDEX IF NOT EXISTS onsite_days_date_idx      ON onsite_days(date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS onsite_slots_day_idx      ON onsite_slots(onsite_day_id);
CREATE INDEX IF NOT EXISTS onsite_bookings_slot_idx  ON onsite_bookings(onsite_slot_id);
CREATE INDEX IF NOT EXISTS onsite_bookings_token_idx ON onsite_bookings(booking_token);

-- RLS
ALTER TABLE onsite_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth onsite_days"     ON onsite_days     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth onsite_slots"    ON onsite_slots    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth onsite_bookings" ON onsite_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON onsite_days     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onsite_slots    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON onsite_bookings TO authenticated;
