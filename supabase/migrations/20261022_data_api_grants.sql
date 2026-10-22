-- ─────────────────────────────────────────────────────────────────────────────
-- Data API grants — required from Supabase October 30 2026 onwards.
-- From that date, tables created in public no longer receive automatic grants.
-- This migration is idempotent: granting an existing privilege is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

-- Core tables (created via dashboard, not in earlier migrations)
grant select, insert, update, delete on public.profiles              to authenticated;
grant select, insert, update, delete on public.clients               to authenticated;
grant select, insert, update, delete on public.tasks                 to authenticated;
grant select, insert, update, delete on public.task_history          to authenticated;
grant select, insert, update, delete on public.task_templates        to authenticated;
grant select, insert, update, delete on public.task_template_items   to authenticated;
grant select, insert, update, delete on public.meetings              to authenticated;
grant select, insert, update, delete on public.relationships         to authenticated;

-- Migration-created tables
grant select, insert, update, delete on public.task_comments                 to authenticated;
grant select, insert, update, delete on public.activity_log                  to authenticated;
grant select, insert, update, delete on public.meeting_history               to authenticated;
grant select, insert, update, delete on public.benefit_schemes               to authenticated;
grant select, insert, update, delete on public.benefit_memberships           to authenticated;
grant select, insert, update, delete on public.benefit_contribution_changes  to authenticated;
grant select, insert, update, delete on public.advice_journey_templates      to authenticated;
grant select, insert, update, delete on public.advice_journeys               to authenticated;
grant select, insert, update, delete on public.advice_journey_steps          to authenticated;
grant select, insert, update, delete on public.email_templates               to authenticated;
grant select, insert, update, delete on public.email_sends                   to authenticated;
