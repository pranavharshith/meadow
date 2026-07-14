-- ============================================================================
-- 03_social.sql — friends, reports, chat, moderation, admin ban
-- Apply AFTER 01_core.sql and 02_world.sql.
-- Idempotent: safe to re-run.
-- ============================================================================

-- --- friends ---------------------------------------------------------------
create table if not exists public.friends (
  user1_id uuid not null references public.players(id) on delete cascade,
  user2_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user1_id, user2_id),
  check (user1_id < user2_id)
);

alter table public.friends enable row level security;
alter table public.friends replica identity full;

drop policy if exists "Friends readable by anyone" on public.friends;
drop policy if exists "Friends readable by participants" on public.friends;
drop policy if exists "Users can delete their own friendships" on public.friends;
-- SELECT participants only; NO client delete policy (mutations via RPCs only)
create policy "Friends readable by participants" on public.friends
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

revoke insert, update, delete on public.friends from anon, authenticated;

-- --- friend_requests -------------------------------------------------------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.players(id) on delete cascade,
  receiver_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;
alter table public.friend_requests replica identity full;

drop policy if exists "Friend requests readable by involved parties" on public.friend_requests;
create policy "Friend requests readable by involved parties" on public.friend_requests
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

revoke insert, update, delete on public.friend_requests from anon, authenticated;

-- --- player_reports --------------------------------------------------------
create table if not exists public.player_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.players(id) on delete cascade,
  target_id   uuid not null references public.players(id) on delete cascade,
  reason      text not null,
  context     text,
  created_at  timestamptz not null default now(),
  check (reporter_id <> target_id),
  check (char_length(reason) between 3 and 200),
  check (context is null or char_length(context) <= 400)
);
create index if not exists player_reports_target_idx
  on public.player_reports (target_id, created_at desc);
create index if not exists player_reports_reporter_idx
  on public.player_reports (reporter_id, created_at desc);

alter table public.player_reports enable row level security;
drop policy if exists "reporters read own reports" on public.player_reports;
create policy "reporters read own reports" on public.player_reports
  for select using (auth.uid() = reporter_id);
revoke insert, update, delete on public.player_reports from anon, authenticated;

-- ============================================================================
-- Social graph RPC
-- ============================================================================

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

-- ============================================================================
-- Friend request RPCs (p3 rate limits)
-- ============================================================================

create or replace function public.send_friend_request(p_receiver_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  is_friend int;
  pending_out int;
  last_at timestamptz;
  banned boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select is_banned into banned from public.players where id = auth.uid();
  if banned then raise exception 'account banned'; end if;

  if auth.uid() = p_receiver_id then raise exception 'cannot friend yourself'; end if;

  select last_friend_request_at into last_at from public.players where id = auth.uid();
  if last_at is not null and now() - last_at < interval '5 seconds' then
    raise exception 'friend request too fast';
  end if;

  select count(*) into pending_out
    from public.friend_requests
    where sender_id = auth.uid();
  if pending_out >= 25 then
    raise exception 'too many pending friend requests';
  end if;

  select count(*) into is_friend from public.friends where
    (user1_id = least(auth.uid(), p_receiver_id)
     and user2_id = greatest(auth.uid(), p_receiver_id));
  if is_friend > 0 then raise exception 'already friends'; end if;

  if exists (
    select 1 from public.friend_requests
    where sender_id = auth.uid() and receiver_id = p_receiver_id
  ) then
    raise exception 'request already sent';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
    values (auth.uid(), p_receiver_id)
    on conflict do nothing;

  update public.players
    set last_friend_request_at = now()
    where id = auth.uid();
end;
$$;

create or replace function public.send_friend_request_by_name(p_target_name text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_target_id uuid;
  pending_out int;
  last_at timestamptz;
  banned boolean;
begin
  if v_sender_id is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select is_banned into banned from public.players where id = v_sender_id;
  if banned then raise exception 'account banned'; end if;

  select last_friend_request_at into last_at from public.players where id = v_sender_id;
  if last_at is not null and now() - last_at < interval '5 seconds' then
    return 'TOO_FAST';
  end if;

  select count(*) into pending_out
    from public.friend_requests where sender_id = v_sender_id;
  if pending_out >= 25 then
    return 'TOO_MANY_PENDING';
  end if;

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

  if exists (
    select 1 from public.friend_requests
    where sender_id = v_sender_id and receiver_id = v_target_id
  ) then
    return 'ALREADY_SENT';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
    values (v_sender_id, v_target_id)
    on conflict do nothing;

  update public.players
    set last_friend_request_at = now()
    where id = v_sender_id;

  return 'SUCCESS';
end;
$$;

create or replace function public.accept_friend_request(p_sender_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  delete from public.friend_requests
    where sender_id = p_sender_id and receiver_id = auth.uid();
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
  perform public.check_rate_limit();
  delete from public.friend_requests
    where sender_id = p_sender_id and receiver_id = auth.uid();
end;
$$;

create or replace function public.unfriend(p_friend_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();
  delete from public.friends
    where user1_id = least(auth.uid(), p_friend_id)
      and user2_id = greatest(auth.uid(), p_friend_id);
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

create or replace function public.toggle_block(target_id uuid)
returns uuid[]
language plpgsql security definer set search_path = public
as $$
declare
  curr_blocks uuid[];
  new_blocks uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

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

-- ============================================================================
-- Chat: region (server-emitted) + world (paid, server-emitted)
-- ============================================================================

-- Legacy gate kept for backward compatibility; prefer send_region_chat.
drop function if exists public.check_region_chat(text);
create or replace function public.check_region_chat(p_text text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  last_at  timestamptz;
  clean    text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_chat_rate_limit();
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

drop function if exists public.send_region_chat(text);
create or replace function public.send_region_chat(p_text text)
returns text
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
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

create or replace function public.send_world_chat(p_text text)
returns integer
language plpgsql security definer set search_path = public, extensions, realtime
as $$
declare
  g        int;
  p        public.players;
  mid      text;
  clean    text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_chat_rate_limit();
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
-- Reports & admin ban
-- ============================================================================

create or replace function public.report_player(
  p_target_id uuid,
  p_reason text,
  p_context text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  recent int;
  banned boolean;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform public.check_rate_limit();

  select is_banned into banned from public.players where id = auth.uid();
  if banned then raise exception 'account banned'; end if;

  if p_target_id is null or p_target_id = auth.uid() then
    raise exception 'invalid target';
  end if;

  p_reason := btrim(coalesce(p_reason, ''));
  if char_length(p_reason) < 3 or char_length(p_reason) > 200 then
    raise exception 'bad reason';
  end if;
  if p_context is not null then
    p_context := left(btrim(p_context), 400);
  end if;

  select count(*) into recent
    from public.player_reports
    where reporter_id = auth.uid()
      and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'report rate limit';
  end if;

  if exists (
    select 1 from public.player_reports
    where reporter_id = auth.uid()
      and target_id = p_target_id
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'already reported recently';
  end if;

  if not exists (select 1 from public.players where id = p_target_id) then
    raise exception 'player not found';
  end if;

  insert into public.player_reports (reporter_id, target_id, reason, context)
    values (auth.uid(), p_target_id, p_reason, p_context);
end;
$$;

create or replace function public.admin_set_ban(
  p_target_id uuid,
  p_banned boolean,
  p_reason text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  claims jsonb;
  role text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  claims := coalesce(auth.jwt(), '{}'::jsonb);
  role := coalesce(claims->'app_metadata'->>'role', claims->>'role', '');
  if role is distinct from 'admin' then
    raise exception 'admin only';
  end if;

  update public.players
    set is_banned = coalesce(p_banned, true),
        ban_reason = case
          when coalesce(p_banned, true) then left(coalesce(p_reason, 'banned'), 200)
          else null
        end,
        updated_at = now()
    where id = p_target_id;

  if not found then raise exception 'player not found'; end if;
end;
$$;
