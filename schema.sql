-- ============================================================
-- WHEB CRM - Database Schema
-- Run this in the Supabase SQL editor: Project → SQL Editor → New query
-- ============================================================

-- PROFILES (extends auth.users)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'staff' check (role in ('admin', 'manager', 'staff')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CLIENTS
create table clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  industry text,
  status text default 'active' check (status in ('prospect', 'active', 'inactive')),
  notes text,
  website text,
  phone text,
  address text,
  account_manager_id uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CONTACTS (people at client companies)
create table contacts (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  is_primary boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- MEETINGS
create table meetings (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  title text not null,
  meeting_date timestamptz not null,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TASKS
create table tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  client_id uuid references clients(id) on delete cascade not null,
  meeting_id uuid references meetings(id) on delete set null,
  assigned_to uuid references profiles(id),
  created_by uuid references profiles(id),
  due_date date,
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  status text default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TASK HISTORY (assignment changes, status changes, pings)
create table task_history (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade not null,
  action text not null,
  performed_by uuid references profiles(id),
  from_user_id uuid references profiles(id),
  to_user_id uuid references profiles(id),
  old_value text,
  new_value text,
  note text,
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table clients enable row level security;
alter table contacts enable row level security;
alter table meetings enable row level security;
alter table tasks enable row level security;
alter table task_history enable row level security;

-- Profiles: all team members can see each other
create policy "profiles_select" on profiles for select to authenticated using (true);
create policy "profiles_insert" on profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update" on profiles for update to authenticated using (auth.uid() = id);

-- Clients, contacts, meetings, tasks: all authenticated users have full access
create policy "clients_all" on clients for all to authenticated using (true);
create policy "contacts_all" on contacts for all to authenticated using (true);
create policy "meetings_all" on meetings for all to authenticated using (true);
create policy "tasks_all" on tasks for all to authenticated using (true);
create policy "task_history_all" on task_history for all to authenticated using (true);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at();
create trigger clients_updated_at before update on clients
  for each row execute function update_updated_at();
create trigger meetings_updated_at before update on meetings
  for each row execute function update_updated_at();
create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();
