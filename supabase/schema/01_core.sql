-- ============================================================================
-- 01_core.sql — players, rate limits, profile, cosmetics, spawn, world tree
-- Apply FIRST in Supabase SQL editor.
-- Idempotent: safe to re-run.
-- ============================================================================

-- Needed for gen_random_bytes() used by trusted chat message ids.
create extension if not exists pgcrypto with schema extensions;

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

-- Columns added over migrations (all present on fresh and upgraded DBs)
alter table public.players add column if not exists discovered              text[]      not null default '{}';
alter table public.players add column if not exists trees_planted           integer     not null default 0;
alter table public.players add column if not exists last_bonus_date         date;
alter table public.players add column if not exists last_plant_at           timestamptz;
alter table public.players add column if not exists last_water_at           timestamptz;
alter table public.players add column if not exists last_chat_at            timestamptz;
alter table public.players add column if not exists last_profile_at         timestamptz;
alter table public.players add column if not exists blocked_users           uuid[]      not null default '{}';
alter table public.players add column if not exists head_color              text;
alter table public.players add column if not exists body_color              text;
alter table public.players add column if not exists leg_color               text;
alter table public.players add column if not exists hat_id                  text;
alter table public.players add column if not exists rate_limit_tokens       real        not null default 5.0;
alter table public.players add column if not exists last_action_at          timestamptz not null default now();
alter table public.players add column if not exists chat_rate_limit_tokens  real        not null default 5.0;
alter table public.players add column if not exists last_chat_action_at     timestamptz not null default now();
alter table public.players add column if not exists last_cut_at             timestamptz;
alter table public.players add column if not exists last_rock_at            timestamptz;
alter table public.players add column if not exists custom_spawn_x          real;
alter table public.players add column if not exists custom_spawn_z          real;
alter table public.players add column if not exists wood                    integer     not null default 0;
alter table public.players add column if not exists stone                   integer     not null default 0;
alter table public.players add column if not exists owned_cosmetics         text[]      not null default '{}';
alter table public.players add column if not exists offline_gold            integer     not null default 0;
alter table public.players add column if not exists wood_donated            integer     not null default 0;
alter table public.players add column if not exists last_pos_x              real;
alter table public.players add column if not exists last_pos_z              real;
alter table public.players add column if not exists last_pos_at             timestamptz;
alter table public.players add column if not exists last_friend_request_at  timestamptz;
alter table public.players add column if not exists is_banned               boolean     not null default false;
alter table public.players add column if not exists ban_reason              text;
alter table public.players add column if not exists proc_cuts_day           integer     not null default 0;
alter table public.players add column if not exists proc_cuts_day_date      date;

-- Case-insensitive unique names (default "wanderer" may be shared)
create unique index if not exists players_name_lower_idx
  on public.players (lower(name))
  where lower(name) <> 'wanderer';

alter table public.players enable row level security;

-- ============================================================================
-- Rate limit helpers (token bucket)
-- ============================================================================

drop table if exists public.user_action_logs cascade;

create or replace function public.check_rate_limit()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p public.players;
  now_ts timestamptz := now();
  elapsed real;
  new_tokens real;
begin
  if auth.uid() is null then return; end if;

  select * into p from public.players where id = auth.uid();
  if not found then return; end if;

  elapsed := extract(epoch from (now_ts - p.last_action_at));
  new_tokens := least(5.0::real, p.rate_limit_tokens + elapsed);

  if new_tokens < 1.0 then
    raise exception '429 Too Many Requests';
  end if;

  update public.players
    set rate_limit_tokens = new_tokens - 1.0,
        last_action_at = now_ts
    where id = auth.uid();
end;
$$;

create or replace function public.check_chat_rate_limit()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  p public.players;
  now_ts timestamptz := now();
  elapsed real;
  new_tokens real;
begin
  if auth.uid() is null then return; end if;

  select * into p from public.players where id = auth.uid();
  if not found then return; end if;

  elapsed := extract(epoch from (now_ts - p.last_chat_action_at));
  new_tokens := least(5.0::real, p.chat_rate_limit_tokens + elapsed);

  if new_tokens < 1.0 then
    raise exception '429 Too Many Requests';
  end if;

  update public.players
    set chat_rate_limit_tokens = new_tokens - 1.0,
        last_chat_action_at = now_ts
    where id = auth.uid();
end;
$$;

-- ============================================================================
-- Position tracking (proximity checks for world RPCs)
-- ============================================================================

create or replace function public.update_position(p_x real, p_z real)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  px real; pz real; pat timestamptz;
  elapsed real;
  dist real;
  max_dist real;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_x is null or p_z is null then raise exception 'bad position'; end if;
  if abs(p_x) > 100000 or abs(p_z) > 100000 then raise exception 'bad position'; end if;

  select last_pos_x, last_pos_z, last_pos_at
    into px, pz, pat
    from public.players where id = auth.uid();

  -- Anti-teleport: while position is fresh, reject jumps faster than ~run+lag.
  -- Stale / first fix may snap (reconnect). Legitimate teleports update last_pos in RPC.
  if px is not null and pz is not null and pat is not null
     and now() - pat < interval '15 seconds' then
    elapsed := greatest(extract(epoch from (now() - pat)), 0.05);
    dist := sqrt((p_x - px) * (p_x - px) + (p_z - pz) * (p_z - pz));
    -- Cap ~16 u/s (run is ~9) with a floor so small RTT jitter is ok
    max_dist := greatest(24.0, elapsed * 16.0);
    if dist > max_dist then
      raise exception 'move too fast';
    end if;
  end if;

  update public.players
    set last_pos_x = p_x,
        last_pos_z = p_z,
        last_pos_at = now()
    where id = auth.uid()
      and (
        last_pos_at is null
        or now() - last_pos_at >= interval '400 milliseconds'
        or last_pos_x is distinct from p_x
        or last_pos_z is distinct from p_z
      );
end;
$$;

create or replace function public.require_near(p_x real, p_z real, p_max_dist real)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  px real; pz real; pat timestamptz;
  d real;
begin
  select last_pos_x, last_pos_z, last_pos_at
    into px, pz, pat
    from public.players where id = auth.uid();

  if px is null or pz is null or pat is null then
    raise exception 'position unknown — move first';
  end if;
  -- 90s grace so a short tab-switch does not block planting
  if now() - pat > interval '90 seconds' then
    raise exception 'position stale — move first';
  end if;

  d := sqrt((px - p_x) * (px - p_x) + (pz - p_z) * (pz - p_z));
  if d > p_max_dist then
    raise exception 'too far away';
  end if;
end;
$$;

-- ============================================================================
-- Profanity / chat sanitization
-- ============================================================================

create or replace function public.name_contains_profanity(p_name text)
returns boolean
language sql immutable security definer set search_path = public
as $$
  select exists (
    select 1 where p_name ~* '\m(fuck|shit|bitch|cunt|asshole|dick|pussy|nigger|nigga|faggot|retard|slut|whore)\M'
  );
$$;

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

-- ============================================================================
-- Profile bootstrap & update
-- ============================================================================

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
  perform public.check_rate_limit();

  select * into row from public.players where id = auth.uid();
  if found then
    if row.is_banned then raise exception 'account banned'; end if;
    return row;
  end if;

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
  is_taken boolean;
begin
  p_name := btrim(p_name);
  if length(p_name) < 2 then return false; end if;
  p_name := left(p_name, 18);
  if public.name_contains_profanity(p_name) then return false; end if;

  select exists(
    select 1 from public.players
    where lower(name) = lower(p_name) and lower(name) <> 'wanderer'
  ) into is_taken;
  return not is_taken;
end
$$;

-- Client (Net.jsx) sends cosmetics: p_head_color, p_body_color, p_leg_color, p_hat_id
drop function if exists public.update_profile(text, text);
drop function if exists public.update_profile(text, text, text, text, text, text);
create or replace function public.update_profile(
  p_name text,
  p_color text,
  p_head_color text default null,
  p_body_color text default null,
  p_leg_color text default null,
  p_hat_id text default null
)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row     public.players;
  last_at timestamptz;
  v_head  text;
  v_body  text;
  v_leg   text;
  v_hat   text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  p_name := btrim(p_name);
  if length(p_name) < 2 then raise exception 'name too short'; end if;
  p_name := left(p_name, 18);

  if public.name_contains_profanity(p_name) then
    raise exception 'profanity in name';
  end if;

  if p_color is null or p_color !~ '^#[0-9a-fA-F]{6}$' then
    p_color := '#a9d98a';
  end if;
  p_color := left(p_color, 16);

  -- Optional appearance fields (validated hex or null to leave unchanged)
  if p_head_color is not null and p_head_color ~ '^#[0-9a-fA-F]{6}$' then
    v_head := left(p_head_color, 16);
  end if;
  if p_body_color is not null and p_body_color ~ '^#[0-9a-fA-F]{6}$' then
    v_body := left(p_body_color, 16);
  end if;
  if p_leg_color is not null and p_leg_color ~ '^#[0-9a-fA-F]{6}$' then
    v_leg := left(p_leg_color, 16);
  end if;
  if p_hat_id is not null then
    if p_hat_id = '' or lower(p_hat_id) = 'none' then
      v_hat := null; -- explicit unequip: stored as SQL NULL via separate branch
    else
      v_hat := left(p_hat_id, 32);
    end if;
  end if;

  select last_profile_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '5 seconds' then
    raise exception 'name change too fast';
  end if;

  update public.players
    set name = p_name,
        color = p_color,
        head_color = case
          when p_head_color is null then head_color
          when p_head_color ~ '^#[0-9a-fA-F]{6}$' then v_head
          else head_color
        end,
        body_color = case
          when p_body_color is null then body_color
          when p_body_color ~ '^#[0-9a-fA-F]{6}$' then v_body
          else body_color
        end,
        leg_color = case
          when p_leg_color is null then leg_color
          when p_leg_color ~ '^#[0-9a-fA-F]{6}$' then v_leg
          else leg_color
        end,
        hat_id = case
          when p_hat_id is null then hat_id
          when p_hat_id = '' or lower(p_hat_id) = 'none' then null
          else v_hat
        end,
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

-- ============================================================================
-- Cosmetics shop (owned_cosmetics inventory)
-- ============================================================================

drop function if exists public.buy_cosmetic(text, text, text, integer);
drop function if exists public.buy_cosmetic(text, text, text);
create or replace function public.buy_cosmetic(p_type text, p_id text, p_color text)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
  v_cost int;
  v_item_key text;
  v_owned boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  if p_type = 'hat' then
    v_item_key := p_id;
    if p_id = 'none' then
      v_cost := 0;
    elsif p_id = 'wizard' then v_cost := 150;
    elsif p_id = 'tophat' then v_cost := 200;
    elsif p_id = 'crown' then v_cost := 500;
    else v_cost := 99999;
    end if;
  else
    v_item_key := p_color;
    if p_color = '#d46a2a' then v_cost := 50;
    elsif p_color = '#c44030' then v_cost := 50;
    elsif p_color = '#e8b830' then v_cost := 50;
    elsif p_color = '#5098d0' then v_cost := 100;
    elsif p_color = '#b080d0' then v_cost := 100;
    elsif p_color = '#e878a0' then v_cost := 100;
    elsif p_color = '#308a78' then v_cost := 150;
    elsif p_color = '#c8d8d0' then v_cost := 150;
    elsif p_color = '#222222' then v_cost := 200;
    elsif p_color = '#2e8b57' then v_cost := 150;
    else v_cost := 99999;
    end if;
  end if;

  select * into row from public.players where id = auth.uid();

  v_owned := v_item_key = any(row.owned_cosmetics) or v_item_key = 'none';

  if not v_owned then
    if row.gold < v_cost then raise exception 'not enough gold'; end if;
    row.gold := row.gold - v_cost;
    row.owned_cosmetics := array_append(row.owned_cosmetics, v_item_key);
  end if;

  if p_type = 'hat' then
    if p_id = 'none' then row.hat_id := null; else row.hat_id := p_id; end if;
  elsif p_type = 'head' then
    row.head_color := p_color;
  elsif p_type = 'body' then
    row.body_color := p_color;
  elsif p_type = 'legs' then
    row.leg_color := p_color;
  end if;

  update public.players
  set hat_id = row.hat_id,
      head_color = row.head_color,
      body_color = row.body_color,
      leg_color = row.leg_color,
      gold = row.gold,
      owned_cosmetics = row.owned_cosmetics,
      updated_at = now()
  where id = auth.uid()
  returning * into row;

  return row;
end
$$;

-- ============================================================================
-- Daily bonus & offline gold
-- ============================================================================

create or replace function public.claim_daily_bonus()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  g int;
  created timestamptz;
  today date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  -- Anti identity-cycling: brand-new accounts wait 12h before first daily
  select created_at into created from public.players where id = auth.uid();
  if created is not null and created > now() - interval '12 hours' then
    raise exception 'account too new for daily bonus';
  end if;

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

create or replace function public.claim_offline_gold()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  pending_gold int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select offline_gold into pending_gold from public.players where id = auth.uid();
  if pending_gold is null or pending_gold = 0 then return 0; end if;

  update public.players
    set gold = gold + pending_gold,
        offline_gold = 0,
        updated_at = now()
    where id = auth.uid();

  return pending_gold;
end;
$$;

-- ============================================================================
-- Teleport & custom spawn
-- ============================================================================

create or replace function public.teleport_to_landmark(p_landmark_id text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  g int;
  lx real; lz real;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  if p_landmark_id is null or length(p_landmark_id) = 0 or length(p_landmark_id) > 64 then
    raise exception 'bad landmark id';
  end if;

  perform 1 from public.players
    where id = auth.uid() and p_landmark_id = any(discovered);
  if not found then raise exception 'not discovered'; end if;

  -- Landmark coords (must match places.js) so update_position anti-teleport allows arrival
  select x, z into lx, lz from (values
    ('spawn-plaza', 0::real, 0::real),
    ('lonely-oak', 62::real, -48::real),
    ('crystal-pond', -74::real, 40::real),
    ('whispering-hill', 120::real, 96::real),
    ('windmill-meadow', -110::real, -92::real),
    ('seven-sisters', 24::real, 150::real),
    ('sun-stone', -150::real, 130::real),
    ('mossy-arch', 45::real, 80::real),
    ('firefly-hollow', -30::real, -60::real),
    ('broken-bridge', 180::real, -140::real),
    ('elderwood', -200::real, -50::real),
    ('flower-terrace', 90::real, -220::real),
    ('starfall-clearing', -160::real, 210::real),
    ('echo-stones', 240::real, 30::real),
    ('willow-bend', -60::real, 240::real),
    ('amber-ridge', 200::real, 200::real),
    ('foxglove-path', -240::real, -180::real),
    ('ancient-lighthouse', 340::real, -100::real),
    ('silver-brook', -300::real, 280::real),
    ('canyon-edge', 280::real, -300::real),
    ('twin-peaks', -350::real, -260::real),
    ('forgotten-shrine', 100::real, -380::real),
    ('dawn-meadow', -380::real, 60::real),
    ('coral-stones', 360::real, 250::real),
    ('cloud-overlook', -50::real, -400::real)
  ) as l(id, x, z) where id = p_landmark_id;
  if lx is null then raise exception 'unknown landmark'; end if;

  update public.players
    set gold = gold - 15,
        last_pos_x = lx,
        last_pos_z = lz,
        last_pos_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= 15
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;
  return g;
end
$$;

create or replace function public.set_spawn(p_x real, p_z real)
returns integer
language plpgsql security definer set search_path = public
as $$
declare g int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  perform public.require_near(p_x, p_z, 8.0);

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot set spawn inside the plaza';
  end if;

  update public.players
    set gold = gold - 40,
        custom_spawn_x = p_x,
        custom_spawn_z = p_z,
        updated_at = now()
    where id = auth.uid() and gold >= 40
    returning gold into g;
  if g is null then raise exception 'not enough gold'; end if;
  return g;
end;
$$;

-- ============================================================================
-- Clean player name trigger
-- ============================================================================

create or replace function public.enforce_clean_player_name()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT' or new.name is distinct from old.name) then
    if public.name_contains_profanity(new.name) then
      new.name := 'wanderer';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_clean_player_name on public.players;
create trigger trigger_clean_player_name
  before insert or update on public.players
  for each row
  execute function public.enforce_clean_player_name();

-- ============================================================================
-- World tree (global meta-goal)
-- ============================================================================

create table if not exists public.world_tree (
  id int primary key,
  total_wood int not null default 0
);
insert into public.world_tree (id, total_wood) values (1, 0) on conflict do nothing;
alter table public.world_tree enable row level security;
drop policy if exists "World tree readable by everyone" on public.world_tree;
create policy "World tree readable by everyone" on public.world_tree
  for select using (true);

create table if not exists public.world_tree_donors (
  user_id uuid primary key,
  reached_at timestamptz not null default now()
);
alter table public.world_tree_donors enable row level security;
drop policy if exists "Donors readable by everyone" on public.world_tree_donors;
create policy "Donors readable by everyone" on public.world_tree_donors
  for select using (true);

create or replace function public.donate_to_world_tree(amount int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  player_wood int;
  new_donated int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  if amount <= 0 then raise exception 'invalid amount'; end if;

  select wood into player_wood from public.players where id = auth.uid();
  if player_wood < amount then raise exception 'not enough wood'; end if;

  update public.players
    set wood = wood - amount,
        wood_donated = wood_donated + amount,
        updated_at = now()
    where id = auth.uid()
    returning wood_donated into new_donated;

  update public.world_tree set total_wood = total_wood + amount where id = 1;

  if new_donated >= 500 then
    insert into public.world_tree_donors (user_id) values (auth.uid()) on conflict do nothing;
  end if;
end;
$$;
