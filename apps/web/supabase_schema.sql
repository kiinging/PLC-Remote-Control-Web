-- Create Bookings Table
create table if not exists public.bookings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz default now(),
  constraint bookings_duration_check check (end_time > start_time)
);

-- Enable RLS
alter table public.bookings enable row level security;

-- Policies (Drop first to avoid "already exists")
drop policy if exists "Enable read access for all users" on public.bookings;
drop policy if exists "Enable insert for authenticated users" on public.bookings;
drop policy if exists "Enable delete for users based on user_id" on public.bookings;

-- 1. Read: Everyone can read bookings (to see busy slots)
create policy "Enable read access for all users"
on public.bookings for select
to authenticated
using (true);

-- 2. Insert: Users can create bookings for themselves
create policy "Enable insert for authenticated users"
on public.bookings for insert
to authenticated
with check (auth.uid() = user_id);

-- 3. Delete: Users can delete ONLY their own bookings
create policy "Enable delete for users based on user_id"
on public.bookings for delete
to authenticated
using (auth.uid() = user_id);

-- 4. Overlap Check Function (prevent double booking)
create or replace function public.check_overlap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.bookings
    where tstzrange(start_time, end_time) && tstzrange(NEW.start_time, NEW.end_time)
    and id != NEW.id -- exclude self if updating
  ) then
    raise exception 'Time slot overlaps with an existing booking.';
  end if;
  return NEW;
end;
$$;

-- Trigger for Overlap (Drop if exists then create)
drop trigger if exists check_booking_overlap on public.bookings;
create trigger check_booking_overlap
before insert or update on public.bookings
for each row execute procedure public.check_overlap();

-- ============================================================
-- Event Logs Table (login events & temperature alerts)
-- ============================================================
create table if not exists public.event_logs (
  id uuid default gen_random_uuid() primary key,
  event_type text not null,        -- 'login' | 'temp_alert'
  user_email text,                 -- who triggered it
  details jsonb,                   -- e.g. { "temperature": 105.3 }
  created_at timestamptz default now()
);

alter table public.event_logs enable row level security;

-- Policies (Drop first)
drop policy if exists "Insert own events" on public.event_logs;
drop policy if exists "Authenticated reads logs" on public.event_logs;

-- Any authenticated user can insert (log their own events)
create policy "Insert own events"
on public.event_logs for insert
to authenticated
with check (true);

-- Any authenticated user can read (admin filter enforced client-side)
create policy "Authenticated reads logs"
on public.event_logs for select
to authenticated
using (true);

-- ============================================================
-- Profiles Table (Tracks onboarding & user preferences)
-- ============================================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  has_seen_welcome boolean default false,
  has_seen_start_guide boolean default false,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Policies for Profiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id);

-- Function to handle new user profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

-- Trigger to create profile on signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create profiles for existing users who don't have one
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ============================================================
-- Reviews Table (Student lab experience feedback)
-- ============================================================
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  conn_rating integer not null default 5 check (conn_rating >= 1 and conn_rating <= 5),
  resp_rating integer not null default 5 check (resp_rating >= 1 and resp_rating <= 5),
  comment text not null,
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

-- Drop existing policies to allow re-running this script
drop policy if exists "Anyone can read reviews" on public.reviews;
drop policy if exists "Authenticated users can submit reviews" on public.reviews;

-- Public read: everyone (including logged in users) can see reviews
create policy "Anyone can read reviews"
on public.reviews for select
using (true);

-- Insert: only authenticated users can submit
create policy "Authenticated users can submit reviews"
on public.reviews for insert
to authenticated
with check (true);

-- ============================================================
-- Lab Submissions Table (Student results & report files)
-- ============================================================
create table if not exists public.lab_submissions (
  id uuid default gen_random_uuid() primary key,
  student_name text not null,
  student_id text not null,
  pb decimal,
  ti decimal,
  td decimal,
  overshoot decimal,
  settling_time decimal,
  file_url text,                   -- Link to the uploaded report in Supabase Storage
  created_at timestamptz default now()
);

alter table public.lab_submissions enable row level security;

-- Allow anyone to insert (since it's on the login page)
-- In a more secure setup, you'd restrict this to authenticated users.
-- CREATE POLICY "Allow public upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'lab-submission');
drop policy if exists "Enable insert for all" on public.lab_submissions;
create policy "Enable insert for all"
on public.lab_submissions for insert
with check (true);

-- Admin can read all submissions
drop policy if exists "Enable read for authenticated" on public.lab_submissions;
create policy "Enable read for authenticated"
on public.lab_submissions for select
to authenticated
using (true);
