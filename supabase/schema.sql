create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.videos (
  id text primary key,
  title text not null,
  brand text,
  category text not null default 'Other',
  date date,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  earnings numeric(12, 2) not null default 0,
  is_sample boolean not null default false,
  duration text,
  cover_url text,
  share_url text,
  embed_url text,
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.brands enable row level security;
alter table public.videos enable row level security;

drop policy if exists "Public brands access" on public.brands;
create policy "Public brands access"
on public.brands
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public videos access" on public.videos;
create policy "Public videos access"
on public.videos
for all
to anon, authenticated
using (true)
with check (true);
