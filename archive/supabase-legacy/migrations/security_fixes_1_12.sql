-- ============================================================================
-- Security fixes 1–12 (audit Part 1)
-- Apply after schema.sql + earlier migrations.
-- Idempotent where practical.
-- ============================================================================

-- --- #6 position tracking ---------------------------------------------------
alter table public.players add column if not exists last_pos_x real;
alter table public.players add column if not exists last_pos_z real;
alter table public.players add column if not exists last_pos_at timestamptz;

-- Lightweight position heartbeat (throttled). Used for proximity checks.
create or replace function public.update_position(p_x real, p_z real)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_x is null or p_z is null then raise exception 'bad position'; end if;
  if abs(p_x) > 100000 or abs(p_z) > 100000 then raise exception 'bad position'; end if;

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
grant execute on function public.update_position(real, real) to authenticated;

-- Require player to be near (x,z). Stale positions (>30s) also fail.
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
  if now() - pat > interval '30 seconds' then
    raise exception 'position stale — move first';
  end if;

  d := sqrt((px - p_x) * (px - p_x) + (pz - p_z) * (pz - p_z));
  if d > p_max_dist then
    raise exception 'too far away';
  end if;
end;
$$;

-- --- #10 players SELECT: self only (public data via RPCs) --------------------
drop policy if exists "players readable" on public.players;
drop policy if exists "players read self" on public.players;
create policy "players read self" on public.players
  for select using (auth.uid() = id);

-- --- #11 friends SELECT: participants only; no direct DML --------------------
drop policy if exists "Friends readable by anyone" on public.friends;
drop policy if exists "Friends readable by participants" on public.friends;
create policy "Friends readable by participants" on public.friends
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

drop policy if exists "Users can delete their own friendships" on public.friends;
revoke insert, update, delete on public.friends from anon, authenticated;
revoke insert, update, delete on public.friend_requests from anon, authenticated;

-- Fix DEFINER search_path on social helpers
create or replace function public.get_social_data()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_friends jsonb;
  v_requests jsonb;
begin
  if v_user_id is null then raise exception 'not signed in'; end if;

  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into v_friends from (
    select p.id, p.name, p.color, true as is_friend
    from public.friends fr
    join public.players p on (p.id = fr.user1_id or p.id = fr.user2_id)
    where (fr.user1_id = v_user_id or fr.user2_id = v_user_id)
      and p.id <> v_user_id
  ) f;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_requests from (
    select freq.id as request_id, p.id as sender_id, p.name, p.color
    from public.friend_requests freq
    join public.players p on p.id = freq.sender_id
    where freq.receiver_id = v_user_id
  ) r;

  return jsonb_build_object('friends', v_friends, 'requests', v_requests);
end;
$$;
grant execute on function public.get_social_data() to authenticated;

create or replace function public.send_friend_request_by_name(p_target_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_target_id uuid;
begin
  if v_sender_id is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select id into v_target_id
    from public.players
    where lower(trim(name)) = lower(trim(p_target_name))
    limit 1;

  if v_target_id is null then return 'PLAYER_NOT_FOUND'; end if;
  if v_target_id = v_sender_id then return 'CANNOT_ADD_SELF'; end if;

  if exists (
    select 1 from public.friends
    where user1_id = least(v_sender_id, v_target_id)
      and user2_id = greatest(v_sender_id, v_target_id)
  ) then
    return 'ALREADY_FRIENDS';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
    values (v_sender_id, v_target_id)
    on conflict do nothing;

  return 'SUCCESS';
end;
$$;
grant execute on function public.send_friend_request_by_name(text) to authenticated;

-- --- helpers: chunk broadcast after mutations (#9) ---------------------------
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
  -- Realtime may be unavailable in local SQL runs; never fail the mutation.
  null;
end;
$$;

-- --- #1 place_rock: server-side cost from shape ------------------------------
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
  perform public.require_near(p_x, p_z, 12.0);

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
grant execute on function public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint) to authenticated;

-- remove_rock: refund less than min place cost (no profit loop); broadcast
create or replace function public.remove_rock(p_rock_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  new_gold int;
  rx real; rz real;
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
    set gold = gold + 2,
        updated_at = now()
    where id = auth.uid()
    returning gold into new_gold;

  perform public.broadcast_chunk_event(
    'removerock', rx, rz,
    jsonb_build_object('id', p_rock_id, 'owner_id', auth.uid())
  );

  return new_gold;
end;
$$;
grant execute on function public.remove_rock(uuid) to authenticated;

-- --- #2 place_crafted_item: server costs from item_id ------------------------
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
  perform public.require_near(p_x, p_z, 12.0);

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
grant execute on function public.place_crafted_item(uuid, text, real, real, real, integer, integer) to authenticated;

-- remove_crafted: partial refund from catalog; no free profit
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
grant execute on function public.remove_crafted_item(uuid) to authenticated;

-- --- #3 cut_procedural_resource: format + chunk + proximity ------------------
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  if p_type is null or p_type not in ('tree', 'rock') then
    raise exception 'invalid type';
  end if;
  if p_id is null or length(p_id) > 64 then raise exception 'bad id'; end if;
  if p_chunk_key is null or length(p_chunk_key) > 32 then raise exception 'bad chunk'; end if;

  -- Expected: "{cx},{cz}_{index}_{tree|rock}" (decorative chunk keys use commas)
  if p_id !~ '^-?[0-9]+,-?[0-9]+_[0-9]+_(tree|rock)$' then
    raise exception 'bad id format';
  end if;

  parts := regexp_match(p_id, '^(-?[0-9]+,-?[0-9]+)_([0-9]+)_(tree|rock)$');
  id_chunk := parts[1];
  idx := parts[2]::int;
  suffix := parts[3];

  if id_chunk is distinct from p_chunk_key then raise exception 'chunk mismatch'; end if;
  if suffix is distinct from p_type then raise exception 'type mismatch'; end if;
  if idx < 0 or idx > 16 then raise exception 'bad index'; end if;

  -- Player must be in/near this chunk (chunk size 100)
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
  -- Allow standing within chunk expanded by 20 units
  if px < cx * 100.0 - 20.0 or px >= (cx + 1) * 100.0 + 20.0
     or pz < cz * 100.0 - 20.0 or pz >= (cz + 1) * 100.0 + 20.0 then
    raise exception 'too far away';
  end if;

  delete from public.cut_resources where cut_at < now() - interval '60 minutes';

  select exists(select 1 from public.cut_resources where id = p_id) into already_cut;
  if already_cut then raise exception 'already cut'; end if;

  insert into public.cut_resources (id, type, chunk_key, cut_at)
    values (p_id, p_type, p_chunk_key, now());

  if p_type = 'tree' then
    reward := 3;
    update public.players set wood = wood + reward, updated_at = now()
      where id = auth.uid() returning * into row;
  else
    reward := 2;
    update public.players set stone = stone + reward, updated_at = now()
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
grant execute on function public.cut_procedural_resource(text, text, text) to authenticated;

-- --- #4 plant_tree: free plants award no gold; proximity ----------------------
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
  perform public.require_near(p_x, p_z, 12.0);

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
grant execute on function public.plant_tree(uuid, real, real, smallint, smallint, real) to authenticated;

-- --- #5 discover_landmark: whitelist + proximity ------------------------------
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
grant execute on function public.discover_landmark(text) to authenticated;

-- set_spawn / buy_custom_plot proximity
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
grant execute on function public.set_spawn(real, real) to authenticated;

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
grant execute on function public.buy_custom_plot(uuid, smallint, real, real, real, real) to authenticated;

-- water_tree: proximity to tree; daily gold from watering soft-capped via rate limit only
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
grant execute on function public.water_tree(uuid) to authenticated;

-- --- #8 region chat: server-emitted (like world chat) -------------------------
drop function if exists public.send_region_chat(text);
create or replace function public.send_region_chat(p_text text)
returns text
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
  last_at  timestamptz;
  clean    text;
  p        public.players;
  mid      text;
  rx int; rz int;
  topic text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_chat_rate_limit();
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 160 then
    raise exception 'bad text';
  end if;

  select * into p from public.players where id = auth.uid();
  if p.last_pos_x is null or p.last_pos_z is null or p.last_pos_at is null
     or now() - p.last_pos_at > interval '30 seconds' then
    raise exception 'position unknown — move first';
  end if;

  if p.last_chat_at is not null and now() - p.last_chat_at < interval '800 milliseconds' then
    raise exception 'chat cooldown';
  end if;

  clean := public.sanitize_chat(btrim(p_text));
  mid   := encode(gen_random_bytes(8), 'hex');
  rx := floor(p.last_pos_x / 120.0)::int;
  rz := floor(p.last_pos_z / 120.0)::int;
  topic := 'region-chat:' || rx::text || ':' || rz::text;

  update public.players set last_chat_at = now() where id = auth.uid();

  perform realtime.send(
    jsonb_build_object(
      'id',    auth.uid(),
      'mid',   mid,
      'name',  p.name,
      'color', p.color,
      'text',  clean
    ),
    'chat',
    topic,
    false
  );

  return clean;
end;
$$;
grant execute on function public.send_region_chat(text) to authenticated;

-- Keep check_region_chat for backward compat but make it call send path's sanitize only
-- (clients should use send_region_chat). Deprecate client broadcast.

-- cut_tree: broadcast cut
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
grant execute on function public.cut_tree(uuid) to authenticated;
