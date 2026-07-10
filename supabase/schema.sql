-- ============================================================================
-- a shared garden — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard > SQL > New query).
-- Idempotent: safe to run multiple times as the game evolves.
--
-- Then enable "Anonymous sign-ins" under Authentication > Providers,
-- and set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the frontend .env.
--
-- Security model:
--   * Direct INSERT/UPDATE/DELETE on `players`, `trees`, and `rocks` is REVOKED from
--     anon/authenticated. Clients read (SELECT) freely, but all mutations
--     go through SECURITY DEFINER RPCs that enforce game rules: spacing,
--     cooldowns, gold costs, daily-bonus once per day, etc.
--   * Chat is ephemeral (Realtime broadcast) but gated by rate-limit RPCs
--     so a modded client can't spam a channel.
-- ============================================================================

-- --- players ---------------------------------------------------------------
create table if not exists public.players (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text        not null default 'wanderer',
  color           text        not null default '#a9d98a',
  gold            integer     not null default 0,
  discovered      text[]      not null default '{}',
  trees_planted   integer     not null default 0,
  last_bonus_date date,
  last_plant_at   timestamptz,
  last_water_at   timestamptz,
  last_chat_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.players add column if not exists discovered        text[]      not null default '{}';
alter table public.players add column if not exists trees_planted     integer     not null default 0;
alter table public.players add column if not exists last_bonus_date   date;
alter table public.players add column if not exists last_plant_at     timestamptz;
alter table public.players add column if not exists last_water_at     timestamptz;
alter table public.players add column if not exists last_chat_at      timestamptz;
alter table public.players add column if not exists last_profile_at   timestamptz;
alter table public.players add column if not exists blocked_users     uuid[] not null default '{}';
alter table public.players add column if not exists head_color        text;
alter table public.players add column if not exists body_color        text;
alter table public.players add column if not exists leg_color         text;
alter table public.players add column if not exists hat_id            text;

-- Enforce case-insensitive unique names. Players must pick distinct names.
-- Multiple players can keep the default "wanderer", but any custom name must be
-- unique (handles the bootstrap case gracefully without a cleanup migration).
create unique index if not exists players_name_lower_idx on public.players (lower(name)) where lower(name) <> 'wanderer';

alter table public.players enable row level security;

-- --- trees -----------------------------------------------------------------
create table if not exists public.trees (
  id          uuid primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  region_x    integer     not null,
  region_z    integer     not null,
  x           real        not null,
  z           real        not null,
  variant     smallint    not null default 0,
  shape       smallint    not null default 0,
  scale       real        not null default 1,
  planted_at  timestamptz not null default now()
);
alter table public.trees add column if not exists shape smallint not null default 0;
alter table public.trees add column if not exists dye text;
create index if not exists trees_region_idx on public.trees (region_x, region_z);

alter table public.trees enable row level security;

-- --- policies: SELECT only. Mutations go through RPCs. ---------------------
drop policy if exists "players readable"    on public.players;
drop policy if exists "players insert self" on public.players;
drop policy if exists "players update self" on public.players;
create policy "players readable" on public.players for select using (true);

drop policy if exists "trees readable"    on public.trees;
drop policy if exists "trees insert self" on public.trees;
drop policy if exists "trees update self" on public.trees;
create policy "trees readable" on public.trees for select using (true);

-- Revoke direct writes at the table level too, so even if a policy is added
-- later, clients still can't touch gold / forge trees directly.
revoke insert, update, delete on public.players from anon, authenticated;
revoke insert, update, delete on public.trees   from anon, authenticated;

-- ============================================================================
-- RPCs (SECURITY DEFINER, fixed search_path). These are the ONLY way a client
-- can mutate the game state. Every one re-validates auth.uid() and inputs.
-- ============================================================================

-- Needed for gen_random_bytes() used by trusted chat message ids.
create extension if not exists pgcrypto with schema extensions;

-- Ensure a player row exists on first sign-in. Returns the row.
create or replace function public.ensure_profile(p_name text, p_color text)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row   public.players;
  base  text;
  final text;
  sfx   int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select * into row from public.players where id = auth.uid();
  if found then return row; end if;

  base  := coalesce(nullif(left(p_name, 18), ''), 'wanderer');
  final := base;

  loop
    begin
      insert into public.players (id, name, color)
      values (auth.uid(), final, coalesce(nullif(left(p_color, 16), ''), '#a9d98a'));
      exit;
    exception
      when unique_violation then
        sfx := sfx + 1;
        if sfx > 999 then raise exception 'could not assign unique name'; end if;
        final := left(base || sfx::text, 18);
    end;
  end loop;

  select * into row from public.players where id = auth.uid();
  return row;
end
$$;

create or replace function public.check_name_available(p_name text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  is_profane boolean;
  is_taken boolean;
begin
  p_name := btrim(p_name);
  if length(p_name) < 2 then return false; end if;
  p_name := left(p_name, 18);
  if public.name_contains_profanity(p_name) then return false; end if;
  
  select exists(select 1 from public.players where lower(name) = lower(p_name) and lower(name) <> 'wanderer') into is_taken;
  return not is_taken;
end
$$;
grant execute on function public.check_name_available(text) to anon, authenticated;

-- Change name / color only. Gold cannot be touched from here.
-- Enforces: minimum length, profanity filter, 5s cooldown, unique name.
create or replace function public.update_profile(p_name text, p_color text)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row     public.players;
  last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  -- Minimum length (after trim)
  p_name := btrim(p_name);
  if length(p_name) < 2 then raise exception 'name too short'; end if;
  p_name := left(p_name, 18);

  -- Profanity check (mirrors client-side moderation)
  if public.name_contains_profanity(p_name) then
    raise exception 'profanity in name';
  end if;

  -- Color: validate hex format, fallback to default
  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then
    p_color := '#a9d98a';
  end if;
  p_color := left(p_color, 16);

  -- Rate-limit: 5 seconds between profile changes
  select last_profile_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '5 seconds' then
    raise exception 'name change too fast';
  end if;

  update public.players
    set name = p_name,
        color = p_color,
        last_profile_at = now(),
        updated_at = now()
    where id = auth.uid();

  if not found then raise exception 'player not found'; end if;

  select * into row from public.players where id = auth.uid();
  return row;
exception
  when unique_violation then
    raise exception 'name already taken';
end
$$;

create or replace function public.buy_cosmetic(p_type text, p_id text, p_color text, p_cost integer)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  
  select * into row from public.players where id = auth.uid();
  if row.gold < p_cost then raise exception 'not enough gold'; end if;
  
  if p_type = 'hat' then
    update public.players set hat_id = p_id, gold = gold - p_cost where id = auth.uid() returning * into row;
  elsif p_type = 'head' then
    update public.players set head_color = p_color, gold = gold - p_cost where id = auth.uid() returning * into row;
  elsif p_type = 'body' then
    update public.players set body_color = p_color, gold = gold - p_cost where id = auth.uid() returning * into row;
  elsif p_type = 'legs' then
    update public.players set leg_color = p_color, gold = gold - p_cost where id = auth.uid() returning * into row;
  end if;
  
  return row;
end
$$;
grant execute on function public.buy_cosmetic(text, text, text, integer) to authenticated;

-- Plant a tree. Enforces cooldown + spacing. Awards +5 gold.
-- Returns the updated player row (for gold reconciliation).
create or replace function public.plant_tree(
  p_id uuid, p_x real, p_z real,
  p_variant smallint, p_shape smallint, p_scale real
)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
  rx int; rz int;
  crowded int;
  last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select last_plant_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'plant cooldown';
  end if;

  -- clamp cosmetic values so a modded client can't ship absurd trees
  p_scale   := greatest(0.8::real, least(2.4::real, coalesce(p_scale,   1.4::real)));
  p_variant := greatest(0::smallint, least(2::smallint, coalesce(p_variant, 0::smallint)));
  p_shape   := greatest(0::smallint, least(3::smallint, coalesce(p_shape,   0::smallint)));

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  perform pg_advisory_xact_lock(rx, rz);

  -- spacing: no tree within 2.0 units of the requested spot
  select count(*) into crowded
    from public.trees
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 4.0;
  if crowded > 0 then raise exception 'too crowded'; end if;

  insert into public.trees (id, owner_id, region_x, region_z, x, z, variant, shape, scale, planted_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_variant, p_shape, p_scale, now());

  update public.players
    set gold = gold + 5,
        trees_planted = trees_planted + 1,
        last_plant_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;
  return row;
end
$$;

-- Water a tree. Only works on trees younger than the 90s growth window.
-- Enforces per-player cooldown. Awards +1 gold, boosts growth by 18s.
-- Returns the new gold total (scalar) so we avoid OUT-parameter/column
-- name shadowing that previously caused the UPDATE to match nothing.
--
-- Note: Postgres refuses `CREATE OR REPLACE FUNCTION` when the return type
-- changes. A prior version of this function returned `table(gold, planted_at)`;
-- we drop it first so re-running this schema actually installs the new one.
drop function if exists public.water_tree(uuid);
create or replace function public.water_tree(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  last_at   timestamptz;
  affected  int;
  new_gold  int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select last_water_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '4 seconds' then
    raise exception 'water cooldown';
  end if;

  update public.trees
    set planted_at = planted_at - interval '18 seconds'
    where id = p_tree_id
      and now() - planted_at < interval '90 seconds';
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'not waterable'; end if;

  update public.players
    set gold = gold + 1,
        last_water_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning gold into new_gold;

  return new_gold;
end
$$;

-- First-time landmark discovery. Awards +20 gold; idempotent per landmark.
-- Returns current gold either way.
create or replace function public.discover_landmark(p_landmark_id text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_landmark_id is null or length(p_landmark_id) = 0 or length(p_landmark_id) > 64 then
    raise exception 'bad landmark id';
  end if;

  perform 1 from public.players
    where id = auth.uid() and p_landmark_id = any(discovered);
  if found then
    select gold into g from public.players where id = auth.uid();
    return g;
  end if;

  update public.players
    set discovered = array_append(discovered, p_landmark_id),
        gold = gold + 20,
        updated_at = now()
    where id = auth.uid()
    returning gold into g;
  return g;
end
$$;

-- Once per UTC day. Awards +10 gold. Returns current gold.
create or replace function public.claim_daily_bonus()
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int; today date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  update public.players
    set gold = gold + 10,
        last_bonus_date = today,
        updated_at = now()
    where id = auth.uid()
      and (last_bonus_date is null or last_bonus_date < today)
    returning gold into g;

  if g is null then
    select gold into g from public.players where id = auth.uid();
  end if;
  return g;
end
$$;

-- Gate for world chat: rate-limited, costs 3 gold. Returns new gold total.
-- The actual message is still broadcast client-side over Realtime; this RPC
-- is the trusted gate that debits gold and rate-limits spam.
create or replace function public.send_world_chat(p_text text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int; last_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_text is null or length(p_text) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select last_chat_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '1500 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  update public.players
    set gold = gold - 3,
        last_chat_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= 3
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;
  return g;
end
$$;

-- Gate for region chat: rate-limited only (free). No return value needed.
-- Dropped first so re-running the full schema doesn't trip on a later
-- return-type change (void → text after sanitize_chat was added).
drop function if exists public.check_region_chat(text);
create or replace function public.check_region_chat(p_text text)
returns text
language plpgsql security definer set search_path = public
as $$
declare 
  last_at timestamptz;
  clean_text text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_text is null or length(p_text) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select last_chat_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '800 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  update public.players set last_chat_at = now() where id = auth.uid();

  clean_text := public.sanitize_chat(p_text);
  return clean_text;
end
$$;

-- Grant execute to signed-in users (anon isn't authenticated here since we use
-- anonymous sign-ins, which produces an authenticated JWT).
grant execute on function public.ensure_profile(text, text)                              to authenticated;
grant execute on function public.update_profile(text, text)                               to authenticated;
grant execute on function public.plant_tree(uuid, real, real, smallint, smallint, real)   to authenticated;
grant execute on function public.water_tree(uuid)                                         to authenticated;
grant execute on function public.discover_landmark(text)                                  to authenticated;
grant execute on function public.claim_daily_bonus()                                      to authenticated;
grant execute on function public.send_world_chat(text)                                    to authenticated;
grant execute on function public.check_region_chat(text)                                  to authenticated;

-- ============================================================================
-- Hardening: server-authoritative cut, server-emitted world chat.
-- Idempotent additions — safe to re-run.
-- ============================================================================

-- Cooldown column for cut_tree
alter table public.players add column if not exists last_cut_at timestamptz;

-- Cut a tree (or uproot a sapling). Verifies ownership, applies cooldown,
-- credits gold based on age, deletes the tree, returns the new gold total.
-- Rewards mirror the client-side constants:
--   grown (>= 90s):    +8
--   sapling (< 90s):   +2
create or replace function public.cut_tree(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  last_at   timestamptz;
  planted   timestamptz;
  reward    int;
  new_gold  int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select last_cut_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'cut cooldown';
  end if;

  select planted_at into planted
    from public.trees
    where id = p_tree_id and owner_id = auth.uid();
  if planted is null then raise exception 'not your tree'; end if;

  if now() - planted >= interval '90 seconds' then
    reward := 8;
  else
    reward := 2;
  end if;

  delete from public.trees where id = p_tree_id and owner_id = auth.uid();

  update public.players
    set gold = gold + reward,
        last_cut_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning gold into new_gold;

  return new_gold;
end
$$;

grant execute on function public.cut_tree(uuid) to authenticated;

-- Replace send_world_chat: same rate-limit + gold gate, but the actual chat
-- payload is now emitted by the database via realtime.send() on the 'world'
-- topic. Clients only subscribe; they no longer emit world-chat broadcasts,
-- which closes the "pay for one text, broadcast another" gap.
--
-- Signature stays `text -> integer` so no drop needed.
create or replace function public.send_world_chat(p_text text)
returns integer
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
  g        int;
  last_at  timestamptz;
  p        public.players;
  mid      text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_text is null then raise exception 'bad text'; end if;

  -- Normalize + length gate
  p_text := btrim(p_text);
  if length(p_text) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select * into p from public.players where id = auth.uid();
  if p.last_chat_at is not null and now() - p.last_chat_at < interval '1500 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  update public.players
    set gold = gold - 3,
        last_chat_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= 3
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;

  mid := encode(gen_random_bytes(8), 'hex');

  -- Emit the trusted payload. Clients subscribe to channel 'world' and
  -- listen for event 'chat'. `private := false` keeps the topic public so
  -- anon-authenticated clients receive it without extra RLS.
  perform realtime.send(
    jsonb_build_object(
      'id',   auth.uid(),
      'mid',  mid,
      'name', p.name,
      'color', p.color,
      'text', p_text
    ),
    'chat',
    'world',
    false
  );

  return g;
end
$$;

grant execute on function public.send_world_chat(text) to authenticated;

-- ============================================================================
-- ROCKS — persistent, server-owned, visible to all players in a region.
-- Same security pattern as trees: SELECT open, INSERT/UPDATE/DELETE revoked,
-- mutations go through SECURITY DEFINER RPCs.
-- ============================================================================

create table if not exists public.rocks (
  id          uuid primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  region_x    integer     not null,
  region_z    integer     not null,
  x           real        not null,
  z           real        not null,
  rot         real        not null default 0,
  rock_shape  smallint    not null default 2,
  sx          real        not null default 1,
  sy          real        not null default 1,
  sz          real        not null default 1,
  mat_idx     smallint    not null default 0,
  placed_at   timestamptz not null default now()
);

create index if not exists rocks_region_idx on public.rocks (region_x, region_z);

alter table public.rocks enable row level security;
drop policy if exists "rocks readable" on public.rocks;
create policy "rocks readable" on public.rocks for select using (true);
revoke insert, update, delete on public.rocks from anon, authenticated;

-- Cooldown column for rock placement
alter table public.players add column if not exists last_rock_at timestamptz;

-- Place a rock. Enforces 500ms cooldown + spacing (2.0 units). Debits gold.
-- Returns the new player gold total.
drop function if exists public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint);
create or replace function public.place_rock(
  p_id uuid, p_x real, p_z real, p_rot real,
  p_rock_shape smallint, p_sx real, p_sy real, p_sz real, p_mat_idx smallint,
  p_cost integer default 5
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  last_at  timestamptz;
  crowded  int;
  rx int; rz int;
  new_gold int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select last_rock_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'rock cooldown';
  end if;

  -- Clamp cosmetic values
  p_rock_shape := greatest(0::smallint, least(2::smallint, coalesce(p_rock_shape, 2::smallint)));
  p_mat_idx    := greatest(0::smallint, least(2::smallint, coalesce(p_mat_idx,    0::smallint)));
  p_sx  := greatest(0.3::real, least(2.0::real, coalesce(p_sx, 1.0::real)));
  p_sy  := greatest(0.3::real, least(2.0::real, coalesce(p_sy, 1.0::real)));
  p_sz  := greatest(0.3::real, least(2.0::real, coalesce(p_sz, 1.0::real)));
  p_cost := greatest(0, least(50, coalesce(p_cost, 5)));

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  perform pg_advisory_xact_lock(rx, rz);

  -- Spacing: no rock within 2.0 units of requested spot
  select count(*) into crowded
    from public.rocks
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 4.0;
  if crowded > 0 then raise exception 'too crowded'; end if;

  insert into public.rocks (id, owner_id, region_x, region_z, x, z, rot, rock_shape, sx, sy, sz, mat_idx, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_rot, p_rock_shape, p_sx, p_sy, p_sz, p_mat_idx, now());

  update public.players
    set gold = gold - p_cost,
        last_rock_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= p_cost
    returning gold into new_gold;
  if new_gold is null then
    delete from public.rocks where id = p_id;
    raise exception 'not enough gold';
  end if;

  return new_gold;
end
$$;

-- Remove a rock the player owns. Credits +3 gold. Returns new gold total.
create or replace function public.remove_rock(p_rock_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare new_gold int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  delete from public.rocks
    where id = p_rock_id and owner_id = auth.uid();
  if not found then raise exception 'not your rock'; end if;

  update public.players
    set gold = gold + 3,
        updated_at = now()
    where id = auth.uid()
    returning gold into new_gold;

  return new_gold;
end
$$;

grant execute on function public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint, integer) to authenticated;
grant execute on function public.remove_rock(uuid) to authenticated;

-- ============================================================================
-- GOLD SINKS: teleport-to-landmark & set-spawn-point
-- ============================================================================

alter table public.players add column if not exists custom_spawn_x real;
alter table public.players add column if not exists custom_spawn_z real;

-- Teleport to a discovered landmark. Costs 15 gold. Returns new gold total.
create or replace function public.teleport_to_landmark(p_landmark_id text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_landmark_id is null or length(p_landmark_id) = 0 or length(p_landmark_id) > 64 then
    raise exception 'bad landmark id';
  end if;

  perform 1 from public.players
    where id = auth.uid() and p_landmark_id = any(discovered);
  if not found then raise exception 'not discovered'; end if;

  update public.players
    set gold = gold - 15,
        updated_at = now()
    where id = auth.uid() and gold >= 15
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;
  return g;
end
$$;

-- Set a custom spawn point. Costs 40 gold. Returns new gold total.
create or replace function public.set_spawn(p_x real, p_z real)
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  update public.players
    set gold = gold - 40,
        custom_spawn_x = p_x,
        custom_spawn_z = p_z,
        updated_at = now()
    where id = auth.uid() and gold >= 40
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;
  return g;
end
$$;

grant execute on function public.teleport_to_landmark(text) to authenticated;
grant execute on function public.set_spawn(real, real)      to authenticated;

-- ============================================================================
-- PERSONAL PLOTS — claim a circle of land (radius 10) others can't plant on.
-- ============================================================================

create table if not exists public.plots (
  id          uuid primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  region_x    integer     not null,
  region_z    integer     not null,
  x           real        not null,
  z           real        not null,
  radius      real        not null default 10,
  shape_type  smallint    not null default 0, -- 0=circle, 1=rectangle
  width       real        not null default 20,
  depth       real        not null default 20,
  placed_at   timestamptz not null default now()
);

create index if not exists plots_region_idx on public.plots (region_x, region_z);

alter table public.plots enable row level security;
drop policy if exists "plots readable" on public.plots;
create policy "plots readable" on public.plots for select using (true);
revoke insert, update, delete on public.plots from anon, authenticated;

drop function if exists public.buy_plot(uuid, real, real);
create or replace function public.buy_plot(p_id uuid, p_x real, p_z real)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  rx int; rz int;
  crowded int;
  new_gold int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  perform 1 from public.plots where owner_id = auth.uid();
  if found then raise exception 'already owned'; end if;

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  perform pg_advisory_xact_lock(rx, rz);

  select count(*) into crowded
    from public.plots
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 225.0; -- 15u spacing

  if crowded > 0 then raise exception 'too close to another plot'; end if;

  insert into public.plots (id, owner_id, region_x, region_z, x, z, radius, shape_type, width, depth, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, 10, 0, 20, 20, now());

  update public.players
    set gold = gold - 250,
        updated_at = now()
    where id = auth.uid() and gold >= 250
    returning gold into new_gold;
  if new_gold is null then
    delete from public.plots where id = p_id;
    raise exception 'not enough gold';
  end if;

  return new_gold;
end
$$;

grant execute on function public.buy_plot(uuid, real, real) to authenticated;

-- ============================================================================
-- SERVER-SIDE PROFANITY SANITIZATION
-- Mirrors the client-side word list. Applied in both chat RPCs so even a
-- modified client that skips maskProfanity() gets its text cleaned here.
-- Returns the sanitized text.
-- ============================================================================

-- Check whether a name contains profanity. Used by update_profile to reject
-- offensive names server-side before they propagate to other players.
create or replace function public.name_contains_profanity(p_name text)
returns boolean
language sql immutable security definer set search_path = public
as $$
  select exists (
    select 1 where p_name ~* '\m(fuck|shit|bitch|cunt|asshole|dick|pussy|nigger|nigga|faggot|retard|slut|whore)\M'
  );
$$;

grant execute on function public.name_contains_profanity(text) to authenticated;

create or replace function public.sanitize_chat(p_text text)
returns text
language sql immutable security definer set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(p_text,
                            '\mfuck\M',    '****',  'gi'),
                            '\mshit\M',    '****',  'gi'),
                            '\mbitch\M',   '*****', 'gi'),
                            '\mcunt\M',    '****',  'gi'),
                            '\masshole\M', '*******', 'gi'),
                            '\mdick\M',    '****',  'gi'),
                            '\mpussy\M',   '*****', 'gi'),
                            '\mnigger\M',  '******','gi'),
                            '\mnigga\M',   '*****', 'gi'),
                            '\mfaggot\M',  '******','gi'),
                            '\mretard\M',  '******','gi'),
                            '\mslut\M',    '****',  'gi'),
                            '\mwhore\M',   '*****', 'gi')
$$;

-- Re-create check_region_chat with server-side sanitization.
-- A previous version returned void; PostgreSQL requires dropping before a
-- return-type change. Safe to re-run because the final function is recreated
-- immediately below.
drop function if exists public.check_region_chat(text);
-- Returns the cleaned text so the client broadcasts the sanitized version.
create or replace function public.check_region_chat(p_text text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  last_at  timestamptz;
  clean    text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select last_chat_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '800 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  clean := public.sanitize_chat(btrim(p_text));
  update public.players set last_chat_at = now() where id = auth.uid();
  return clean;
end
$$;

-- Re-create send_world_chat with server-side sanitization.
-- Signature unchanged (text -> integer) so no drop needed.
create or replace function public.send_world_chat(p_text text)
returns integer
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
  g        int;
  last_at  timestamptz;
  p        public.players;
  mid      text;
  clean    text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_text is null then raise exception 'bad text'; end if;

  p_text := btrim(p_text);
  if length(p_text) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select * into p from public.players where id = auth.uid();
  if p.last_chat_at is not null and now() - p.last_chat_at < interval '1500 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  update public.players
    set gold = gold - 3,
        last_chat_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= 3
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;

  clean := public.sanitize_chat(p_text);
  mid   := encode(gen_random_bytes(8), 'hex');

  perform realtime.send(
    jsonb_build_object(
      'id',    auth.uid(),
      'mid',   mid,
      'name',  p.name,
      'color', p.color,
      'text',  clean
    ),
    'chat',
    'world',
    false
  );

  return g;
end
$$;

-- ============================================================================
-- TREE DYES — change leaf color on owned mature trees
-- ============================================================================

create or replace function public.dye_tree(p_tree_id uuid, p_color text, p_cost integer default 50)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  new_gold int;
  planted  timestamptz;
  owner    uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_color is null or length(p_color) = 0 or length(p_color) > 16 then
    raise exception 'bad color';
  end if;
  p_cost := greatest(0, least(500, coalesce(p_cost, 50)));

  select owner_id, planted_at into owner, planted
    from public.trees where id = p_tree_id;
  if owner is null then raise exception 'tree not found'; end if;
  if owner <> auth.uid() then raise exception 'not your tree'; end if;
  if now() - planted < interval '90 seconds' then raise exception 'tree too young'; end if;

  update public.trees set dye = p_color where id = p_tree_id;

  update public.players
    set gold = gold - p_cost,
        updated_at = now()
    where id = auth.uid() and gold >= p_cost
    returning gold into new_gold;
  if new_gold is null then
    update public.trees set dye = null where id = p_tree_id;
    raise exception 'not enough gold';
  end if;
  return new_gold;
end
$$;

grant execute on function public.dye_tree(uuid, text, integer) to authenticated;

grant execute on function public.sanitize_chat(text)          to authenticated;
grant execute on function public.check_region_chat(text)      to authenticated;
grant execute on function public.send_world_chat(text)        to authenticated;

drop function if exists public.buy_custom_plot(uuid, smallint, real, real, real, real);
create or replace function public.buy_custom_plot(p_id uuid, p_shape smallint, p_w real, p_d real, p_x real, p_z real)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  rx int; rz int;
  crowded int;
  new_gold int;
  cost int;
  my_plot_count int;
  my_total_area real := 0;
  new_area real := 0;
  max_area real := 1600;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  -- Validate dimensions and calculate cost
  if p_shape = 0 then
    -- circle: p_w = radius (5..20)
    if p_w < 5 or p_w > 20 then raise exception 'invalid radius'; end if;
    new_area := 3.14159 * p_w * p_w;
    cost := greatest(1, round(new_area * 0.8)::int);
  elsif p_shape = 1 then
    -- rectangle: p_w = half-width, p_d = half-depth (10..40)
    if p_w < 5 or p_w > 40 or p_d < 5 or p_d > 40 then raise exception 'invalid dimensions'; end if;
    new_area := (p_w * 2.0) * (p_d * 2.0);
    cost := greatest(1, round(new_area * 0.15)::int);
  else
    raise exception 'invalid shape';
  end if;

  -- Check plot count + area quota
  select count(*), coalesce(sum(
    case when shape_type = 0 then 3.14159 * width * width
         else (width * 2.0) * (depth * 2.0) end
  ), 0)
  into my_plot_count, my_total_area
  from public.plots where owner_id = auth.uid();

  if my_plot_count >= 5 then
    raise exception 'limit of 5 plots reached';
  end if;

  if (my_total_area + new_area) > max_area then
    raise exception 'exceeds maximum land quota (1600 sq meters)';
  end if;

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  -- Proximity check: ensure centers are at least (p_w + 5) units apart
  select count(*) into crowded
    from public.plots
    where region_x = rx and region_z = rz
      and sqrt((x - p_x)^2 + (z - p_z)^2) < (coalesce(width, 10) + p_w + 5.0);

  if crowded > 0 then raise exception 'too close to another plot'; end if;

  insert into public.plots (id, owner_id, region_x, region_z, x, z, radius, shape_type, width, depth, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_w, p_shape, p_w, p_d, now());

  update public.players
    set gold = gold - cost,
        updated_at = now()
    where id = auth.uid() and gold >= cost
    returning gold into new_gold;

  if new_gold is null then
    delete from public.plots where id = p_id;
    raise exception 'not enough gold';
  end if;

  return new_gold;
end;
$$;

grant execute on function public.buy_custom_plot(uuid, smallint, real, real, real, real) to authenticated;

-- --- friends & profiles ----------------------------------------------------

alter table public.players add column if not exists trees_planted int not null default 0;

-- Note: Assume function public.plant_tree is updated to include:
-- update public.players set trees_planted = trees_planted + 1 where id = auth.uid();

create table if not exists public.friends (
  user1_id uuid not null references public.players(id) on delete cascade,
  user2_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user1_id, user2_id),
  check (user1_id < user2_id) -- Ensures uniqueness and single row per pair
);

alter table public.friends enable row level security;
create policy "Friends readable by anyone" on public.friends for select using (true);
create policy "Users can delete their own friendships" on public.friends for delete using (auth.uid() = user1_id or auth.uid() = user2_id);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.players(id) on delete cascade,
  receiver_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;
create policy "Friend requests readable by involved parties" on public.friend_requests for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create or replace function public.send_friend_request(p_receiver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  is_friend int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if auth.uid() = p_receiver_id then raise exception 'cannot friend yourself'; end if;
  
  select count(*) into is_friend from public.friends where 
    (user1_id = least(auth.uid(), p_receiver_id) and user2_id = greatest(auth.uid(), p_receiver_id));
  if is_friend > 0 then raise exception 'already friends'; end if;
  
  insert into public.friend_requests (sender_id, receiver_id) values (auth.uid(), p_receiver_id) on conflict do nothing;
end;
$$;

create or replace function public.accept_friend_request(p_sender_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  
  delete from public.friend_requests where sender_id = p_sender_id and receiver_id = auth.uid();
  if found then
    insert into public.friends (user1_id, user2_id) 
      values (least(auth.uid(), p_sender_id), greatest(auth.uid(), p_sender_id)) 
      on conflict do nothing;
  end if;
end;
$$;

create or replace function public.decline_friend_request(p_sender_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.friend_requests where sender_id = p_sender_id and receiver_id = auth.uid();
end;
$$;

create or replace function public.unfriend(p_friend_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.friends where user1_id = least(auth.uid(), p_friend_id) and user2_id = greatest(auth.uid(), p_friend_id);
end;
$$;

create or replace function public.get_player_profile(p_id uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  prof json;
begin
  select json_build_object(
    'id', id,
    'name', name,
    'color', color,
    'head_color', head_color,
    'body_color', body_color,
    'leg_color', leg_color,
    'hat_id', hat_id,
    'created_at', created_at,
    'trees_planted', trees_planted,
    'landmarks_discovered', coalesce(array_length(discovered, 1), 0)
  ) into prof
  from public.players where id = p_id;
  
  return prof;
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.unfriend(uuid) to authenticated;
grant execute on function public.get_player_profile(uuid) to authenticated;

-- ============================================================================
-- MODERATION
-- ============================================================================

create or replace function public.toggle_block(target_id uuid)
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare
  curr_blocks uuid[];
  new_blocks uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  
  select blocked_users into curr_blocks from public.players where id = auth.uid();
  if curr_blocks is null then curr_blocks := '{}'::uuid[]; end if;
  
  if target_id = any(curr_blocks) then
    select array_agg(u) into new_blocks from unnest(curr_blocks) u where u <> target_id;
    if new_blocks is null then new_blocks := '{}'::uuid[]; end if;
  else
    new_blocks := array_append(curr_blocks, target_id);
  end if;
  
  update public.players set blocked_users = new_blocks where id = auth.uid();
  return new_blocks;
end
$$;
grant execute on function public.toggle_block(uuid) to authenticated;
