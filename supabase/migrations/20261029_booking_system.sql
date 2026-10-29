-- Calendly-style booking system
-- booking_profiles: one per staff member (their public booking page config)
-- booking_event_types: types of meetings (e.g. "Initial Consultation", "Annual Review")
-- booking_staff_event_types: which staff offer which event types
-- bookings: confirmed appointments

CREATE TABLE booking_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug          text NOT NULL UNIQUE,              -- URL slug e.g. "mike-savage"
  display_name  text NOT NULL,
  title         text,                              -- job title shown on booking page
  bio           text,
  avatar_url    text,
  timezone      text NOT NULL DEFAULT 'Europe/London',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking_event_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  slug                  text NOT NULL UNIQUE,      -- e.g. "initial-consultation"
  description           text,
  duration_minutes      int NOT NULL DEFAULT 60,
  location_type         text NOT NULL DEFAULT 'teams', -- 'teams' | 'our_office' | 'client_location'
  -- Buffer after the meeting (minutes). Location-aware defaults applied in app logic.
  buffer_after_minutes  int NOT NULL DEFAULT 15,
  -- Advance booking window: how far ahead clients can book (days)
  advance_days          int NOT NULL DEFAULT 60,
  -- Minimum notice before booking (hours)
  min_notice_hours      int NOT NULL DEFAULT 24,
  -- Working hours override (JSON: { mon: [{start:"09:00",end:"17:00"}], ... })
  -- null = use the booking profile's default working hours
  working_hours         jsonb,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Links staff to event types they offer (many-to-many with per-staff overrides)
CREATE TABLE booking_staff_event_types (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_profile_id    uuid NOT NULL REFERENCES booking_profiles(id) ON DELETE CASCADE,
  event_type_id         uuid NOT NULL REFERENCES booking_event_types(id) ON DELETE CASCADE,
  -- Override buffer for this staff member (null = use event type default)
  buffer_after_override int,
  is_active             boolean NOT NULL DEFAULT true,
  UNIQUE(booking_profile_id, event_type_id)
);

CREATE TABLE bookings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_profile_id    uuid NOT NULL REFERENCES booking_profiles(id) ON DELETE RESTRICT,
  event_type_id         uuid NOT NULL REFERENCES booking_event_types(id) ON DELETE RESTRICT,
  -- Client info (may not be in the CRM yet)
  client_name           text NOT NULL,
  client_email          text NOT NULL,
  client_phone          text,
  client_company        text,
  -- Timing
  start_at              timestamptz NOT NULL,
  end_at                timestamptz NOT NULL,
  timezone              text NOT NULL DEFAULT 'Europe/London',
  -- Location / meeting details
  location_type         text NOT NULL,             -- mirrors event_type at time of booking
  meeting_notes         text,
  -- Calendar / Teams
  calendar_event_id     text,                      -- MS Graph event id (advisor's calendar)
  teams_meeting_url     text,
  -- CRM link (if created)
  crm_meeting_id        uuid REFERENCES meetings(id) ON DELETE SET NULL,
  -- Status
  status                text NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'cancelled' | 'completed'
  cancelled_at          timestamptz,
  cancellation_reason   text,
  -- Audit
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX bookings_profile_idx       ON bookings(booking_profile_id);
CREATE INDEX bookings_start_at_idx      ON bookings(start_at);
CREATE INDEX bookings_status_idx        ON bookings(status);
CREATE INDEX booking_profiles_slug_idx  ON booking_profiles(slug);

-- RLS
ALTER TABLE booking_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_event_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_staff_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                  ENABLE ROW LEVEL SECURITY;

-- booking_profiles: staff can manage their own; admins see all
CREATE POLICY "booking_profiles_select" ON booking_profiles
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "booking_profiles_insert" ON booking_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "booking_profiles_update" ON booking_profiles
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- booking_event_types: any authenticated user can read; only admins can manage
CREATE POLICY "booking_event_types_read" ON booking_event_types
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "booking_event_types_write" ON booking_event_types
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- booking_staff_event_types: authenticated users read; own profile write
CREATE POLICY "bset_read" ON booking_staff_event_types
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "bset_write" ON booking_staff_event_types
  FOR ALL USING (
    EXISTS (SELECT 1 FROM booking_profiles WHERE id = booking_profile_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- bookings: authenticated users read all; service role writes (confirm route uses service role)
CREATE POLICY "bookings_read" ON bookings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "bookings_update" ON bookings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM booking_profiles WHERE id = booking_profile_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Grants
GRANT ALL ON booking_profiles          TO authenticated;
GRANT ALL ON booking_event_types       TO authenticated;
GRANT ALL ON booking_staff_event_types TO authenticated;
GRANT ALL ON bookings                  TO authenticated;
GRANT ALL ON booking_profiles          TO service_role;
GRANT ALL ON booking_event_types       TO service_role;
GRANT ALL ON booking_staff_event_types TO service_role;
GRANT ALL ON bookings                  TO service_role;
