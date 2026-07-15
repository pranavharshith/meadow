-- ============================================================================
-- 02_world.sql — trees, rocks, plots, crafted items, cut resources, world RPCs
-- Apply AFTER 01_core.sql.
-- Idempotent: safe to re-run.
-- ============================================================================

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
create index if not exists trees_xz_idx on public.trees (x, z);
alter table public.trees enable row level security;

-- --- rocks -----------------------------------------------------------------
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
create index if not exists rocks_xz_idx on public.rocks (x, z);
alter table public.rocks enable row level security;

-- --- plots -----------------------------------------------------------------
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
create index if not exists plots_xz_idx on public.plots (x, z);
alter table public.plots enable row level security;

-- --- crafted items ---------------------------------------------------------
create table if not exists public.crafted_items (
  id          uuid primary key,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  region_x    integer     not null,
  region_z    integer     not null,
  x           real        not null,
  z           real        not null,
  rot         real        not null default 0,
  item_id     text        not null,
  placed_at   timestamptz not null default now()
);
create index if not exists crafted_items_region_idx on public.crafted_items (region_x, region_z);
create index if not exists crafted_items_xz_idx on public.crafted_items (x, z);
alter table public.crafted_items enable row level security;

-- --- cut procedural resources ----------------------------------------------
create table if not exists public.cut_resources (
  id          text primary key, -- '{cx},{cz}_{index}_{tree|rock}'
  type        text not null,    -- 'tree' or 'rock'
  chunk_key   text not null,
  cut_at      timestamptz not null default now()
);
create index if not exists cut_resources_chunk_idx on public.cut_resources (chunk_key);
alter table public.cut_resources enable row level security;

-- ============================================================================
-- Chunk broadcast helper (realtime.send; never fails the mutation)
-- ============================================================================

create or replace function public.broadcast_chunk_event(
  p_event text,
  p_x real,
  p_z real,
  p_payload jsonb
)
returns void
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
  cx int;
  cz int;
  topic text;
begin
  cx := floor(p_x / 100.0)::int;
  cz := floor(p_z / 100.0)::int;
  topic := 'chunk:' || cx::text || ':' || cz::text;
  perform realtime.send(p_payload, p_event, topic, false);
exception when others then
  null;
end;
$$;

-- ============================================================================
-- plant_tree — free shapes no +5 gold; proximity; server shape costs
-- ============================================================================

create or replace function public.plant_tree(
  p_id uuid, p_x real, p_z real,
  p_variant smallint, p_shape smallint, p_scale real
)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row   public.players;
  rx int; rz int;
  crowded int;
  last_at timestamptz;
  v_cost int;
  v_bonus int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  -- 18 units: plant ghost sits ahead of feet; 12 was too tight for laggy position heartbeats
  perform public.require_near(p_x, p_z, 18.0);

  select last_plant_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'plant cooldown';
  end if;

  p_scale   := greatest(0.8::real, least(2.4::real, coalesce(p_scale,   1.4::real)));
  p_variant := greatest(0::smallint, least(2::smallint, coalesce(p_variant, 0::smallint)));
  p_shape   := greatest(0::smallint, least(11::smallint, coalesce(p_shape,   0::smallint)));

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot plant in spawn plaza';
  end if;

  perform pg_advisory_xact_lock(rx, rz);

  select count(*) into crowded
    from public.trees
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 4.0;
  if crowded > 0 then raise exception 'too crowded'; end if;

  insert into public.trees (id, owner_id, region_x, region_z, x, z, variant, shape, scale, planted_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_variant, p_shape, p_scale, now());

  v_cost := case p_shape
    when 1 then 5
    when 2 then 5
    when 3 then 75
    when 4 then 50
    when 5 then 100
    when 10 then 500
    when 11 then 1000
    else 0
  end;
  -- Free shapes: no gold printer. Paid shapes: keep small +5 plant bonus.
  v_bonus := case when v_cost = 0 then 0 else 5 end;

  select * into row from public.players where id = auth.uid();
  if row.gold < v_cost then
    delete from public.trees where id = p_id;
    raise exception 'not enough gold';
  end if;

  update public.players
    set gold = gold - v_cost + v_bonus,
        trees_planted = trees_planted + 1,
        last_plant_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  perform public.broadcast_chunk_event(
    'tree', p_x, p_z,
    jsonb_build_object(
      'id', p_id, 'owner_id', auth.uid(),
      'x', p_x, 'z', p_z,
      'variant', p_variant, 'shape', p_shape, 'scale', p_scale,
      'planted_at', now()
    )
  );

  return row;
end;
$$;

-- ============================================================================
-- water_tree — proximity, cooldown, +1 gold
-- ============================================================================

drop function if exists public.water_tree(uuid);
create or replace function public.water_tree(p_tree_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  last_at   timestamptz;
  affected  int;
  new_gold  int;
  tx real; tz real;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select x, z into tx, tz from public.trees where id = p_tree_id;
  if tx is null then raise exception 'not waterable'; end if;
  perform public.require_near(tx, tz, 10.0);

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
end;
$$;

-- ============================================================================
-- cut_tree — returns players row, wood rewards, proximity, broadcast
-- ============================================================================

drop function if exists public.cut_tree(uuid);
create or replace function public.cut_tree(p_tree_id uuid)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  last_at   timestamptz;
  planted   timestamptz;
  reward    int;
  row       public.players;
  tx real; tz real;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select last_cut_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'cut cooldown';
  end if;

  select planted_at, x, z into planted, tx, tz
    from public.trees
    where id = p_tree_id and owner_id = auth.uid();
  if planted is null then raise exception 'not your tree'; end if;
  perform public.require_near(tx, tz, 8.0);

  if now() - planted >= interval '90 seconds' then
    reward := 8;
  else
    reward := 2;
  end if;

  delete from public.trees where id = p_tree_id and owner_id = auth.uid();

  update public.players
    set wood = wood + reward,
        last_cut_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  perform public.broadcast_chunk_event(
    'cut', tx, tz,
    jsonb_build_object('id', p_tree_id, 'owner_id', auth.uid())
  );

  return row;
end;
$$;

-- ============================================================================
-- place_rock / remove_rock — server costs, no client p_cost
-- ============================================================================

drop function if exists public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint, integer);
drop function if exists public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint);

create or replace function public.place_rock(
  p_id uuid, p_x real, p_z real, p_rot real,
  p_rock_shape smallint, p_sx real, p_sy real, p_sz real, p_mat_idx smallint
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  last_at  timestamptz;
  crowded  int;
  rx int; rz int;
  new_gold int;
  v_cost int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  perform public.require_near(p_x, p_z, 18.0);

  select last_rock_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'rock cooldown';
  end if;

  p_rock_shape := greatest(0::smallint, least(2::smallint, coalesce(p_rock_shape, 2::smallint)));
  p_mat_idx    := greatest(0::smallint, least(2::smallint, coalesce(p_mat_idx,    0::smallint)));
  p_sx  := greatest(0.3::real, least(2.0::real, coalesce(p_sx, 1.0::real)));
  p_sy  := greatest(0.3::real, least(2.0::real, coalesce(p_sy, 1.0::real)));
  p_sz  := greatest(0.3::real, least(2.0::real, coalesce(p_sz, 1.0::real)));

  v_cost := case p_rock_shape
    when 0 then 8
    when 1 then 8
    else 5
  end;

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot place in spawn plaza';
  end if;

  perform pg_advisory_xact_lock(rx, rz);

  select count(*) into crowded
    from public.rocks
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 4.0;
  if crowded > 0 then raise exception 'too crowded'; end if;

  insert into public.rocks (id, owner_id, region_x, region_z, x, z, rot, rock_shape, sx, sy, sz, mat_idx, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_rot, p_rock_shape, p_sx, p_sy, p_sz, p_mat_idx, now());

  update public.players
    set gold = gold - v_cost,
        last_rock_at = now(),
        updated_at = now()
    where id = auth.uid() and gold >= v_cost
    returning gold into new_gold;
  if new_gold is null then
    delete from public.rocks where id = p_id;
    raise exception 'not enough gold';
  end if;

  perform public.broadcast_chunk_event(
    'rock', p_x, p_z,
    jsonb_build_object(
      'id', p_id, 'owner_id', auth.uid(),
      'x', p_x, 'z', p_z, 'rot', p_rot,
      'rock_shape', p_rock_shape,
      'sx', p_sx, 'sy', p_sy, 'sz', p_sz,
      'mat_idx', p_mat_idx
    )
  );

  return new_gold;
end;
$$;

drop function if exists public.remove_rock(uuid);
create or replace function public.remove_rock(p_rock_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  new_stone int;
  rx real; rz real;
  reward int := 3; -- stone (matches client; not gold — no gold profit loop)
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select x, z into rx, rz from public.rocks
    where id = p_rock_id and owner_id = auth.uid();
  if rx is null then raise exception 'not your rock'; end if;
  perform public.require_near(rx, rz, 12.0);

  delete from public.rocks where id = p_rock_id and owner_id = auth.uid();
  if not found then raise exception 'not your rock'; end if;

  update public.players
    set stone = stone + reward,
        updated_at = now()
    where id = auth.uid()
    returning stone into new_stone;

  perform public.broadcast_chunk_event(
    'removerock', rx, rz,
    jsonb_build_object('id', p_rock_id, 'owner_id', auth.uid())
  );

  return new_stone;
end;
$$;

-- ============================================================================
-- place_crafted_item / remove_crafted_item — server catalog costs
-- Client may still send p_cost_wood / p_cost_stone; they are ignored.
-- ============================================================================

drop function if exists public.place_crafted_item(uuid, text, real, real, real, integer, integer);
create or replace function public.place_crafted_item(
  p_id uuid, p_item_id text, p_x real, p_z real, p_rot real,
  p_cost_wood integer default 0, p_cost_stone integer default 0
)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  last_at  timestamptz;
  crowded  int;
  rx int; rz int;
  row public.players;
  v_wood int;
  v_stone int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  perform public.require_near(p_x, p_z, 18.0);

  -- Ignore client costs; catalog is authoritative
  v_wood := case p_item_id
    when 'fence_wood' then 2
    when 'bench_wood' then 5
    when 'sign_wood' then 3
    when 'lantern_stone' then 0
    when 'path_stone' then 0
    else -1
  end;
  v_stone := case p_item_id
    when 'fence_wood' then 0
    when 'bench_wood' then 0
    when 'sign_wood' then 0
    when 'lantern_stone' then 5
    when 'path_stone' then 1
    else -1
  end;
  if v_wood < 0 or v_stone < 0 then raise exception 'unknown item'; end if;

  select last_rock_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'placement cooldown';
  end if;

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot place in spawn plaza';
  end if;

  perform pg_advisory_xact_lock(rx, rz);

  select count(*) into crowded
    from public.crafted_items
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 2.25;
  if crowded > 0 then raise exception 'too crowded'; end if;

  select * into row from public.players where id = auth.uid();
  if row.wood < v_wood then raise exception 'not enough wood'; end if;
  if row.stone < v_stone then raise exception 'not enough stone'; end if;

  insert into public.crafted_items (id, owner_id, region_x, region_z, x, z, rot, item_id, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_rot, p_item_id, now());

  update public.players
    set wood = wood - v_wood,
        stone = stone - v_stone,
        last_rock_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  perform public.broadcast_chunk_event(
    'crafted', p_x, p_z,
    jsonb_build_object(
      'id', p_id, 'owner_id', auth.uid(),
      'item_id', p_item_id,
      'x', p_x, 'z', p_z, 'rot', p_rot
    )
  );

  return row;
end;
$$;

drop function if exists public.remove_crafted_item(uuid);
create or replace function public.remove_crafted_item(p_id uuid)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
  item text;
  ix real; iz real;
  rw int := 0;
  rs int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select item_id, x, z into item, ix, iz
    from public.crafted_items
    where id = p_id and owner_id = auth.uid();
  if item is null then raise exception 'not your item'; end if;
  perform public.require_near(ix, iz, 12.0);

  rw := case item
    when 'fence_wood' then 1
    when 'bench_wood' then 2
    when 'sign_wood' then 1
    else 0
  end;
  rs := case item
    when 'lantern_stone' then 2
    when 'path_stone' then 0
    else 0
  end;

  delete from public.crafted_items where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'not your item'; end if;

  update public.players
    set wood = wood + rw,
        stone = stone + rs,
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  perform public.broadcast_chunk_event(
    'removecrafted', ix, iz,
    jsonb_build_object('id', p_id, 'owner_id', auth.uid())
  );

  return row;
end;
$$;

-- ============================================================================
-- cut_procedural_resource — seed-based index bounds + proximity + daily cap
-- Client spawns: trees n=3..5 (seed ^ 0x7), rocks n=2..5 (seed ^ 0x5c)
-- ============================================================================

-- Signed 32-bit helpers matching JS |0 / Math.imul / >>> 0
create or replace function public.as_i32(x bigint)
returns integer
language sql immutable parallel safe
as $$
  select case
    when (x & 4294967295) >= 2147483648
      then ((x & 4294967295) - 4294967296)::integer
    else (x & 4294967295)::integer
  end;
$$;

create or replace function public.imul32(a integer, b integer)
returns integer
language sql immutable parallel safe
as $$
  select public.as_i32((a::bigint * b::bigint));
$$;

create or replace function public.mulberry32_next(state integer, out new_state integer, out rand double precision)
language plpgsql immutable parallel safe
as $$
declare
  a integer;
  t integer;
  au bigint;
  tu bigint;
  u bigint;
begin
  -- a = (state + 0x6d2b79f5) | 0
  a := public.as_i32(state::bigint + 1831565813);
  au := a::bigint & 4294967295;
  -- t = Math.imul(a ^ (a >>> 15), 1 | a)  — >>> is unsigned
  t := public.imul32(public.as_i32(au # (au >> 15)), 1 | a);
  tu := t::bigint & 4294967295;
  -- t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  t := public.as_i32(t::bigint + public.imul32(public.as_i32(tu # (tu >> 7)), 61 | t)) # t;
  new_state := a;
  u := (t::bigint # ((t::bigint & 4294967295) >> 14)) & 4294967295;
  rand := u::double precision / 4294967296.0;
end;
$$;

-- Deterministic max spawn count for a chunk (mirrors TreesField / Rocks.jsx).
-- Trees: n = 3 + floor(rng()*3) after seed ^ 0x7  → 3..5
-- Rocks: n = 2 + floor(rng()*4) after seed ^ 0x5c → 2..5
create or replace function public.procedural_chunk_count(p_chunk_key text, p_type text)
returns integer
language plpgsql immutable parallel safe set search_path = public
as $$
declare
  cx int; cz int;
  st integer;
  ns integer;
  r double precision;
  n int;
begin
  if p_chunk_key is null or p_chunk_key !~ '^-?[0-9]+,-?[0-9]+$' then
    return 0;
  end if;
  cx := split_part(p_chunk_key, ',', 1)::int;
  cz := split_part(p_chunk_key, ',', 2)::int;
  -- seedFor(cx,cz) >>> 0 then |0 for mulberry init
  st := public.as_i32((cx::bigint * 73856093) # (cz::bigint * 19349663));

  if p_type = 'tree' then
    st := st # 7;
  elsif p_type = 'rock' then
    st := st # 92; -- 0x5c
  else
    return 0;
  end if;

  select new_state, rand into ns, r from public.mulberry32_next(st);

  if p_type = 'tree' then
    n := 3 + floor(r * 3)::int;
  else
    n := 2 + floor(r * 4)::int;
  end if;
  return greatest(0, least(n, 6));
end;
$$;

create or replace function public.cut_procedural_resource(p_id text, p_type text, p_chunk_key text)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
  already_cut boolean;
  reward int;
  cx int; cz int; idx int; suffix text;
  parts text[];
  id_chunk text;
  px real; pz real; pat timestamptz;
  max_n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  if p_type is null or p_type not in ('tree', 'rock') then
    raise exception 'invalid type';
  end if;
  if p_id is null or length(p_id) > 64 then raise exception 'bad id'; end if;
  if p_chunk_key is null or length(p_chunk_key) > 32 then raise exception 'bad chunk'; end if;

  -- Expected: "{cx},{cz}_{index}_{tree|rock}"
  if p_id !~ '^-?[0-9]+,-?[0-9]+_[0-9]+_(tree|rock)$' then
    raise exception 'bad id format';
  end if;

  parts := regexp_match(p_id, '^(-?[0-9]+,-?[0-9]+)_([0-9]+)_(tree|rock)$');
  id_chunk := parts[1];
  idx := parts[2]::int;
  suffix := parts[3];

  if id_chunk is distinct from p_chunk_key then raise exception 'chunk mismatch'; end if;
  if suffix is distinct from p_type then raise exception 'type mismatch'; end if;

  max_n := public.procedural_chunk_count(p_chunk_key, p_type);
  if max_n <= 0 or idx < 0 or idx >= max_n then
    raise exception 'invalid resource';
  end if;

  cx := split_part(id_chunk, ',', 1)::int;
  cz := split_part(id_chunk, ',', 2)::int;

  select last_pos_x, last_pos_z, last_pos_at into px, pz, pat
    from public.players where id = auth.uid();
  if px is null or pz is null or pat is null then
    raise exception 'position unknown — move first';
  end if;
  if now() - pat > interval '30 seconds' then
    raise exception 'position stale — move first';
  end if;
  if px < cx * 100.0 - 20.0 or px >= (cx + 1) * 100.0 + 20.0
     or pz < cz * 100.0 - 20.0 or pz >= (cz + 1) * 100.0 + 20.0 then
    raise exception 'too far away';
  end if;

  delete from public.cut_resources where cut_at < now() - interval '60 minutes';

  -- Daily per-player cap (anti mass-farm)
  select * into row from public.players where id = auth.uid();
  if row.proc_cuts_day_date is not distinct from (now() at time zone 'utc')::date
     and coalesce(row.proc_cuts_day, 0) >= 40 then
    raise exception 'daily harvest limit';
  end if;

  select exists(select 1 from public.cut_resources where id = p_id) into already_cut;
  if already_cut then raise exception 'already cut'; end if;

  insert into public.cut_resources (id, type, chunk_key, cut_at)
    values (p_id, p_type, p_chunk_key, now());

  if p_type = 'tree' then
    reward := 3;
    update public.players
      set wood = wood + reward,
          proc_cuts_day = case
            when proc_cuts_day_date is distinct from (now() at time zone 'utc')::date then 1
            else coalesce(proc_cuts_day, 0) + 1
          end,
          proc_cuts_day_date = (now() at time zone 'utc')::date,
          updated_at = now()
      where id = auth.uid() returning * into row;
  else
    reward := 2;
    update public.players
      set stone = stone + reward,
          proc_cuts_day = case
            when proc_cuts_day_date is distinct from (now() at time zone 'utc')::date then 1
            else coalesce(proc_cuts_day, 0) + 1
          end,
          proc_cuts_day_date = (now() at time zone 'utc')::date,
          updated_at = now()
      where id = auth.uid() returning * into row;
  end if;

  perform public.broadcast_chunk_event(
    'cutprocedural',
    px, pz,
    jsonb_build_object(
      'id', p_id, 'type', p_type, 'chunk_key', p_chunk_key,
      'user_id', auth.uid()
    )
  );

  return row;
end;
$$;

-- ============================================================================
-- dye_tree — server color catalog costs
-- ============================================================================

drop function if exists public.dye_tree(uuid, text, integer);
drop function if exists public.dye_tree(uuid, text);
create or replace function public.dye_tree(p_tree_id uuid, p_color text, p_cost integer default 50)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  new_gold int;
  planted  timestamptz;
  owner    uuid;
  v_cost   int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  if p_color is null or length(p_color) = 0 or length(p_color) > 16 then
    raise exception 'bad color';
  end if;

  -- Whitelist only (matches catalog.js DYE_ITEMS). Reject unknown colours.
  p_color := lower(trim(p_color));
  v_cost := case p_color
    when '#d46a2a' then 50
    when '#c44030' then 50
    when '#e8b830' then 50
    when '#5098d0' then 100
    when '#b080d0' then 100
    when '#e878a0' then 100
    when '#308a78' then 150
    when '#c8d8d0' then 150
    when '#2e8b57' then 150
    when '#222222' then 200
    else null
  end;
  if v_cost is null then raise exception 'unknown color'; end if;

  select owner_id, planted_at into owner, planted
    from public.trees where id = p_tree_id;
  if owner is null then raise exception 'tree not found'; end if;
  if owner <> auth.uid() then raise exception 'not your tree'; end if;
  if now() - planted < interval '90 seconds' then raise exception 'tree too young'; end if;

  update public.trees set dye = p_color where id = p_tree_id;

  update public.players
    set gold = gold - v_cost,
        updated_at = now()
    where id = auth.uid() and gold >= v_cost
    returning gold into new_gold;
  if new_gold is null then
    update public.trees set dye = null where id = p_tree_id;
    raise exception 'not enough gold';
  end if;
  return new_gold;
end
$$;

-- ============================================================================
-- buy_custom_plot — area quotas, proximity
-- ============================================================================

drop function if exists public.buy_plot(uuid, real, real);
drop function if exists public.buy_custom_plot(uuid, smallint, real, real, real, real);
create or replace function public.buy_custom_plot(
  p_id uuid, p_shape smallint, p_w real, p_d real, p_x real, p_z real
)
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
  perform public.check_rate_limit();
  perform public.require_near(p_x, p_z, 16.0);

  if p_shape = 0 then
    if p_w < 5 or p_w > 20 then raise exception 'invalid radius'; end if;
    new_area := 3.14159 * p_w * p_w;
    cost := greatest(1, round(new_area * 0.8)::int);
  elsif p_shape = 1 then
    if p_w < 5 or p_w > 40 or p_d < 5 or p_d > 40 then raise exception 'invalid dimensions'; end if;
    new_area := (p_w * 2.0) * (p_d * 2.0);
    cost := greatest(1, round(new_area * 0.15)::int);
  else
    raise exception 'invalid shape';
  end if;

  select count(*), coalesce(sum(
    case when shape_type = 0 then 3.14159 * width * width
         else (width * 2.0) * (depth * 2.0) end
  ), 0)
  into my_plot_count, my_total_area
  from public.plots where owner_id = auth.uid();

  if my_plot_count >= 5 then raise exception 'limit of 5 plots reached'; end if;
  if (my_total_area + new_area) > max_area then
    raise exception 'exceeds maximum land quota (1600 sq meters)';
  end if;

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot buy a plot in the spawn plaza';
  end if;

  select count(*) into crowded
    from public.plots
    where region_x = rx and region_z = rz
      and sqrt((x - p_x)^2 + (z - p_z)^2) < (coalesce(width, 10) + p_w + 5.0);
  if crowded > 0 then raise exception 'too close to another plot'; end if;

  insert into public.plots (id, owner_id, region_x, region_z, x, z, radius, shape_type, width, depth, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_w, p_shape, p_w, p_d, now());

  update public.players
    set gold = gold - cost, updated_at = now()
    where id = auth.uid() and gold >= cost
    returning gold into new_gold;

  if new_gold is null then
    delete from public.plots where id = p_id;
    raise exception 'not enough gold';
  end if;

  perform public.broadcast_chunk_event(
    'plot', p_x, p_z,
    jsonb_build_object(
      'id', p_id, 'owner_id', auth.uid(),
      'x', p_x, 'z', p_z,
      'radius', p_w, 'shape_type', p_shape,
      'width', p_w, 'depth', p_d
    )
  );

  return new_gold;
end;
$$;

-- ============================================================================
-- discover_landmark — whitelist + proximity
-- ============================================================================

create or replace function public.discover_landmark(p_landmark_id text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  g int;
  lx real; lz real; dr real;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  if p_landmark_id is null or length(p_landmark_id) = 0 or length(p_landmark_id) > 64 then
    raise exception 'bad landmark id';
  end if;

  -- Whitelist (mirrors src/world/places.js)
  select x, z, discover_range into lx, lz, dr from (values
    ('spawn-plaza', 0::real, 0::real, 18::real),
    ('lonely-oak', 62::real, -48::real, 14::real),
    ('crystal-pond', -74::real, 40::real, 14::real),
    ('whispering-hill', 120::real, 96::real, 14::real),
    ('windmill-meadow', -110::real, -92::real, 14::real),
    ('seven-sisters', 24::real, 150::real, 14::real),
    ('sun-stone', -150::real, 130::real, 14::real),
    ('mossy-arch', 45::real, 80::real, 14::real),
    ('firefly-hollow', -30::real, -60::real, 14::real),
    ('broken-bridge', 180::real, -140::real, 14::real),
    ('elderwood', -200::real, -50::real, 14::real),
    ('flower-terrace', 90::real, -220::real, 14::real),
    ('starfall-clearing', -160::real, 210::real, 14::real),
    ('echo-stones', 240::real, 30::real, 14::real),
    ('willow-bend', -60::real, 240::real, 14::real),
    ('amber-ridge', 200::real, 200::real, 14::real),
    ('foxglove-path', -240::real, -180::real, 14::real),
    ('ancient-lighthouse', 340::real, -100::real, 14::real),
    ('silver-brook', -300::real, 280::real, 14::real),
    ('canyon-edge', 280::real, -300::real, 14::real),
    ('twin-peaks', -350::real, -260::real, 14::real),
    ('forgotten-shrine', 100::real, -380::real, 14::real),
    ('dawn-meadow', -380::real, 60::real, 14::real),
    ('coral-stones', 360::real, 250::real, 14::real),
    ('cloud-overlook', -50::real, -400::real, 14::real)
  ) as l(id, x, z, discover_range)
  where id = p_landmark_id;

  if lx is null then raise exception 'unknown landmark'; end if;
  perform public.require_near(lx, lz, greatest(dr, 18.0));

  update public.players
    set discovered = array_append(discovered, p_landmark_id),
        gold = gold + 20,
        updated_at = now()
    where id = auth.uid() and not (p_landmark_id = any(discovered))
    returning gold into g;

  if g is null then
    select gold into g from public.players where id = auth.uid();
  end if;

  return g;
end;
$$;

-- ============================================================================
-- release_overgrown_item — wild reclamation after 2 days
-- ============================================================================

create or replace function public.release_overgrown_item(p_id uuid, p_type text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  owner_uid uuid;
  planted timestamptz;
  new_gold int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  if p_type = 'tree' then
    select owner_id, planted_at into owner_uid, planted from public.trees where id = p_id;
  elsif p_type = 'rock' then
    select owner_id, placed_at into owner_uid, planted from public.rocks where id = p_id;
  else
    raise exception 'invalid type';
  end if;

  if owner_uid is null then raise exception 'item not found'; end if;
  if now() - planted < interval '2 days' then raise exception 'item is not overgrown yet'; end if;

  if p_type = 'tree' then
    delete from public.trees where id = p_id;
  else
    delete from public.rocks where id = p_id;
  end if;

  update public.players set offline_gold = offline_gold + 3 where id = owner_uid;

  update public.players
    set gold = gold + 1,
        updated_at = now()
    where id = auth.uid()
    returning gold into new_gold;

  return new_gold;
end;
$$;

-- ============================================================================
-- get_nearby_world — scoped world state for client (replaces open table SELECT)
-- Loads a 3×3 chunk window around (p_cx, p_cz). Player must be near that window.
-- ============================================================================

create or replace function public.get_nearby_world(p_cx integer, p_cz integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  px real; pz real; pat timestamptz;
  min_x real; max_x real; min_z real; max_z real;
  cut_keys text[];
  result jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_cx is null or p_cz is null then raise exception 'bad chunk'; end if;
  if abs(p_cx) > 10000 or abs(p_cz) > 10000 then raise exception 'bad chunk'; end if;

  select last_pos_x, last_pos_z, last_pos_at into px, pz, pat
    from public.players where id = auth.uid();
  if px is null or pz is null or pat is null then
    raise exception 'position unknown — move first';
  end if;
  if now() - pat > interval '30 seconds' then
    raise exception 'position stale — move first';
  end if;

  -- Player must be within the requested 3×3 (with small margin)
  if px < (p_cx - 1) * 100.0 - 40.0 or px >= (p_cx + 2) * 100.0 + 40.0
     or pz < (p_cz - 1) * 100.0 - 40.0 or pz >= (p_cz + 2) * 100.0 + 40.0 then
    raise exception 'too far away';
  end if;

  min_x := (p_cx - 1) * 100.0;
  max_x := (p_cx + 2) * 100.0;
  min_z := (p_cz - 1) * 100.0;
  max_z := (p_cz + 2) * 100.0;

  cut_keys := array[
    (p_cx-1)::text || ',' || (p_cz-1)::text,
    (p_cx-1)::text || ',' || p_cz::text,
    (p_cx-1)::text || ',' || (p_cz+1)::text,
    p_cx::text || ',' || (p_cz-1)::text,
    p_cx::text || ',' || p_cz::text,
    p_cx::text || ',' || (p_cz+1)::text,
    (p_cx+1)::text || ',' || (p_cz-1)::text,
    (p_cx+1)::text || ',' || p_cz::text,
    (p_cx+1)::text || ',' || (p_cz+1)::text
  ];

  select jsonb_build_object(
    'trees', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select id, owner_id, x, z, variant, shape, scale, dye, planted_at
        from public.trees
        where x >= min_x and x < max_x and z >= min_z and z < max_z
        limit 1000
      ) t
    ), '[]'::jsonb),
    'rocks', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select id, owner_id, x, z, rot, rock_shape, sx, sy, sz, mat_idx, placed_at
        from public.rocks
        where x >= min_x and x < max_x and z >= min_z and z < max_z
        limit 500
      ) r
    ), '[]'::jsonb),
    'plots', coalesce((
      select jsonb_agg(to_jsonb(p))
      from (
        select pl.id, pl.owner_id, pl.x, pl.z, pl.radius, pl.shape_type, pl.width, pl.depth,
               pr.name as owner_name
        from public.plots pl
        left join public.players pr on pr.id = pl.owner_id
        where pl.x >= min_x and pl.x < max_x and pl.z >= min_z and pl.z < max_z
        limit 100
      ) p
    ), '[]'::jsonb),
    'crafted_items', coalesce((
      select jsonb_agg(to_jsonb(c))
      from (
        select id, owner_id, x, z, rot, item_id, placed_at
        from public.crafted_items
        where x >= min_x and x < max_x and z >= min_z and z < max_z
        limit 500
      ) c
    ), '[]'::jsonb),
    'cut_resources', coalesce((
      select jsonb_agg(to_jsonb(cr))
      from (
        select id, type, chunk_key, cut_at
        from public.cut_resources
        where chunk_key = any(cut_keys)
        limit 500
      ) cr
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;
