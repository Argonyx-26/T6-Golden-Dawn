-- Run manually in the Supabase SQL editor. Dentist identity only — no clinical data ever goes here.
create table if not exists public.dentist_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  doctor_name text,
  mobile text,
  dob date,
  clinic_name text,
  clinic_location text,
  created_at timestamptz default now()
);

alter table public.dentist_profiles enable row level security;

create policy "own profile: select" on public.dentist_profiles
  for select using (id = auth.uid());

create policy "own profile: insert" on public.dentist_profiles
  for insert with check (id = auth.uid());

create policy "own profile: update" on public.dentist_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
