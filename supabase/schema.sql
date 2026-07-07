-- ============================================================================
-- a shared garden — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL > New query).
-- Then enable "Anonymous sign-ins" under Authentication > Providers.
-- Finally add the project URL + anon key to the frontend env:
--   VITE_SUPABASE_URL=...       VITE_SUPABASE_ANON_KEY=...
-- ============================================================================

-- --- players (one row per anonymous account) -------------------------------
create table if not exists public.players (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text        not null default 'wanderer',
  color       text        not null default '#a9d98a',
  gold        integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.players enable row level security;

-- anyone signed in may read profiles (needed to show names/colours);
-- you may only insert/update your OWN row.
drop policy if exists "players readable" on public.players;
create policy "players readable" on public.players
  for select using (true);

drop policy if exists "players insert self" on public.players;
create policy "players insert self" on public.players
  for insert with check (auth.uid() = id);

drop policy if exists "players update self" on public.players;
create policy "players update self" on public.players
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- --- trees (the shared, persistent world) ----------------------------------
create table if not exists public.trees (
  id          uuid primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  region_x    integer     not null,
  region_z    integer     not null,
  x           real        not null,
  z           real        not null,
  variant     smallint    not null default 0,
  scale       real        not null default 1,
  planted_at  timestamptz not null default now()
);

create index if not exists trees_region_idx on public.trees (region_x, region_z);

alter table public.trees enable row level security;

-- everyone may read trees (the world is shared); you may only plant as
-- yourself, and only touch your own trees.
drop policy if exists "trees readable" on public.trees;
create policy "trees readable" on public.trees
  for select using (true);

drop policy if exists "trees insert self" on public.trees;
create policy "trees insert self" on public.trees
  for insert with check (auth.uid() = owner_id);

drop policy if exists "trees update self" on public.trees;
create policy "trees update self" on public.trees
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============================================================================
-- Notes
-- * Positions and chat are ephemeral (Realtime broadcast/presence) and are NOT
--   stored here, keeping the database tiny and within the free tier.
-- * Gold is currently client-mirrored to players.gold under RLS. For a
--   competitive economy you'd move plant/water/world-chat into SECURITY DEFINER
--   RPCs; for this calm, non-competitive game client-side is acceptable for MVP.
-- ============================================================================
