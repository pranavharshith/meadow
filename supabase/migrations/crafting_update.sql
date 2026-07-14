-- Add wood and stone resources to players
alter table public.players add column if not exists wood integer not null default 0;
alter table public.players add column if not exists stone integer not null default 0;

-- Table to track cut procedural resources (trees, rocks)
create table if not exists public.cut_resources (
  id          text primary key, -- formatted as 'chunkKey_localIndex_type'
  type        text not null,    -- 'tree' or 'rock'
  chunk_key   text not null,
  cut_at      timestamptz not null default now()
);
create index if not exists cut_resources_chunk_idx on public.cut_resources (chunk_key);

alter table public.cut_resources enable row level security;
drop policy if exists "cut_resources readable" on public.cut_resources;
create policy "cut_resources readable" on public.cut_resources for select using (true);
revoke insert, update, delete on public.cut_resources from anon, authenticated;

-- RPC to cut a procedural resource (tree or rock)
create or replace function public.cut_procedural_resource(p_id text, p_type text, p_chunk_key text)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare
  row public.players;
  already_cut boolean;
  reward int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  -- Clean up expired cuts (e.g. older than 60 minutes) to keep the table small
  -- This effectively acts as the regeneration system.
  delete from public.cut_resources where cut_at < now() - interval '60 minutes';

  -- Check if already cut
  select exists(select 1 from public.cut_resources where id = p_id) into already_cut;
  if already_cut then raise exception 'already cut'; end if;

  insert into public.cut_resources (id, type, chunk_key, cut_at) values (p_id, p_type, p_chunk_key, now());

  if p_type = 'tree' then
    reward := 3;
    update public.players set wood = wood + reward, updated_at = now() where id = auth.uid() returning * into row;
  elsif p_type = 'rock' then
    reward := 2;
    update public.players set stone = stone + reward, updated_at = now() where id = auth.uid() returning * into row;
  end if;

  return row;
end
$$;
grant execute on function public.cut_procedural_resource(text, text, text) to authenticated;

-- Modify cut_tree to return the player row and award Wood instead of Gold
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

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
    set wood = wood + reward,
        last_cut_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  return row;
end
$$;
grant execute on function public.cut_tree(uuid) to authenticated;

-- Modify remove_rock to return player row and award Stone instead of Gold
drop function if exists public.remove_rock(uuid);
create or replace function public.remove_rock(p_rock_id uuid)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare row public.players;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  delete from public.rocks
    where id = p_rock_id and owner_id = auth.uid();
  if not found then raise exception 'not your rock'; end if;

  update public.players
    set stone = stone + 3,
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  return row;
end
$$;
grant execute on function public.remove_rock(uuid) to authenticated;


-- ============================================================================
-- CRAFTED ITEMS (Fences, Benches, Lanterns, Pathways, Signs)
-- ============================================================================
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
drop policy if exists "crafted_items readable" on public.crafted_items;
create policy "crafted_items readable" on public.crafted_items for select using (true);
revoke insert, update, delete on public.crafted_items from anon, authenticated;

-- Place a crafted item. Enforces 500ms cooldown + spacing (1.5 units). Debits Wood/Stone.
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
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select last_rock_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '500 milliseconds' then
    raise exception 'placement cooldown';
  end if;

  p_cost_wood := greatest(0, p_cost_wood);
  p_cost_stone := greatest(0, p_cost_stone);

  rx := floor(p_x / 120.0)::int;
  rz := floor(p_z / 120.0)::int;

  if (p_x * p_x + p_z * p_z) <= 225.0 then
    raise exception 'cannot place in spawn plaza';
  end if;

  perform pg_advisory_xact_lock(rx, rz);

  -- Spacing: no crafted item within 1.5 units of requested spot
  select count(*) into crowded
    from public.crafted_items
    where region_x = rx and region_z = rz
      and (x - p_x) * (x - p_x) + (z - p_z) * (z - p_z) < 2.25;
  if crowded > 0 then raise exception 'too crowded'; end if;

  select * into row from public.players where id = auth.uid();
  if row.wood < p_cost_wood then raise exception 'not enough wood'; end if;
  if row.stone < p_cost_stone then raise exception 'not enough stone'; end if;

  insert into public.crafted_items (id, owner_id, region_x, region_z, x, z, rot, item_id, placed_at)
    values (p_id, auth.uid(), rx, rz, p_x, p_z, p_rot, p_item_id, now());

  update public.players
    set wood = wood - p_cost_wood,
        stone = stone - p_cost_stone,
        last_rock_at = now(),
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  return row;
end
$$;
grant execute on function public.place_crafted_item(uuid, text, real, real, real, integer, integer) to authenticated;

-- Remove a crafted item the player owns. Credits a small fraction of resources. Returns new player row.
create or replace function public.remove_crafted_item(p_id uuid)
returns public.players
language plpgsql security definer set search_path = public
as $$
declare row public.players;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  delete from public.crafted_items
    where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'not your item'; end if;

  -- We could look up the item cost and refund half, but for simplicity, refund 1 of each resource.
  update public.players
    set wood = wood + 1,
        stone = stone + 1,
        updated_at = now()
    where id = auth.uid()
    returning * into row;

  return row;
end
$$;
grant execute on function public.remove_crafted_item(uuid) to authenticated;
