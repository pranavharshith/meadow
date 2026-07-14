-- ============================================================================
-- P3 hardening: friend-request limits, player reports, ban check, admin ban
-- Apply after security_fixes_1_12.sql
-- ============================================================================

-- --- friend request rate limits ---------------------------------------------
alter table public.players add column if not exists last_friend_request_at timestamptz;
alter table public.players add column if not exists is_banned boolean not null default false;
alter table public.players add column if not exists ban_reason text;

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
    (user1_id = least(auth.uid(), p_receiver_id) and user2_id = greatest(auth.uid(), p_receiver_id));
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
grant execute on function public.send_friend_request(uuid) to authenticated;

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
grant execute on function public.send_friend_request_by_name(text) to authenticated;

-- Block banned accounts from bootstrapping a profile
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
grant execute on function public.ensure_profile(text, text) to authenticated;

-- --- player reports ---------------------------------------------------------
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
create index if not exists player_reports_target_idx on public.player_reports (target_id, created_at desc);
create index if not exists player_reports_reporter_idx on public.player_reports (reporter_id, created_at desc);

alter table public.player_reports enable row level security;
drop policy if exists "reporters read own reports" on public.player_reports;
create policy "reporters read own reports" on public.player_reports
  for select using (auth.uid() = reporter_id);
revoke insert, update, delete on public.player_reports from anon, authenticated;

create or replace function public.report_player(p_target_id uuid, p_reason text, p_context text default null)
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

  -- Max 5 reports per hour per reporter
  select count(*) into recent
    from public.player_reports
    where reporter_id = auth.uid()
      and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'report rate limit';
  end if;

  -- Don't spam-report the same target more than once per 24h
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
grant execute on function public.report_player(uuid, text, text) to authenticated;

-- Admin ban via JWT app_metadata.role = 'admin' (set in Supabase Auth)
create or replace function public.admin_set_ban(p_target_id uuid, p_banned boolean, p_reason text default null)
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
        ban_reason = case when coalesce(p_banned, true) then left(coalesce(p_reason, 'banned'), 200) else null end,
        updated_at = now()
    where id = p_target_id;

  if not found then raise exception 'player not found'; end if;
end;
$$;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
