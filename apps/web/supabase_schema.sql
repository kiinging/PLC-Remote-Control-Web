-- Create Bookings Table
create table public.bookings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz default now(),
  constraint bookings_duration_check check (end_time > start_time)
);

-- Enable RLS
alter table public.bookings enable row level security;

-- Policies

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

-- Trigger for Overlap
create trigger check_booking_overlap
before insert or update on public.bookings
for each row execute procedure public.check_overlap();
