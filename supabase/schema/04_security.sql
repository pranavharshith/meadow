-- ============================================================================
-- 04_security.sql — authoritative RLS, REVOKE direct DML, GRANT execute, realtime
-- Apply LAST (after 01_core, 02_world, 03_social).
-- Idempotent: safe to re-run.
--
-- Apply order: 01_core.sql → 02_world.sql → 03_social.sql → 04_security.sql
-- These four files under supabase/schema/ are the ONLY source of truth.
-- ============================================================================

-- ============================================================================
-- RLS: players — self-read only (public profile data via get_player_profile RPC)
-- ============================================================================

drop policy if exists "players readable"    on public.players;
drop policy if exists "players read self"   on public.players;
drop policy if exists "players insert self" on public.players;
drop policy if exists "players update self" on public.players;
create policy "players read self" on public.players
  for select using (auth.uid() = id);

-- ============================================================================
-- RLS: world tables — NO open SELECT (use get_nearby_world RPC)
-- ============================================================================

drop policy if exists "trees readable"    on public.trees;
drop policy if exists "trees insert self" on public.trees;
drop policy if exists "trees update self" on public.trees;
-- Intentionally no SELECT policy for clients

drop policy if exists "rocks readable" on public.rocks;
drop policy if exists "plots readable" on public.plots;
drop policy if exists "crafted_items readable" on public.crafted_items;
drop policy if exists "cut_resources readable" on public.cut_resources;

drop policy if exists "World tree readable by everyone" on public.world_tree;
create policy "World tree readable by everyone" on public.world_tree
  for select using (true);

drop policy if exists "Donors readable by everyone" on public.world_tree_donors;
create policy "Donors readable by everyone" on public.world_tree_donors
  for select using (true);

-- ============================================================================
-- RLS: social — participants / own reports only
-- ============================================================================

drop policy if exists "Friends readable by anyone" on public.friends;
drop policy if exists "Friends readable by participants" on public.friends;
drop policy if exists "Users can delete their own friendships" on public.friends;
create policy "Friends readable by participants" on public.friends
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

drop policy if exists "Friend requests readable by involved parties" on public.friend_requests;
create policy "Friend requests readable by involved parties" on public.friend_requests
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "reporters read own reports" on public.player_reports;
create policy "reporters read own reports" on public.player_reports
  for select using (auth.uid() = reporter_id);

-- ============================================================================
-- REVOKE all direct DML on mutable tables from clients
-- ============================================================================

revoke insert, update, delete on public.players          from anon, authenticated;
revoke insert, update, delete on public.trees            from anon, authenticated;
revoke insert, update, delete on public.rocks            from anon, authenticated;
revoke insert, update, delete on public.plots            from anon, authenticated;
revoke insert, update, delete on public.crafted_items    from anon, authenticated;
revoke insert, update, delete on public.cut_resources    from anon, authenticated;
revoke insert, update, delete on public.world_tree       from anon, authenticated;
revoke insert, update, delete on public.world_tree_donors from anon, authenticated;
revoke insert, update, delete on public.friends          from anon, authenticated;
revoke insert, update, delete on public.friend_requests  from anon, authenticated;
revoke insert, update, delete on public.player_reports   from anon, authenticated;

-- World entity tables: no client SELECT (scoped via get_nearby_world)
revoke select on public.trees          from anon, authenticated;
revoke select on public.rocks          from anon, authenticated;
revoke select on public.plots          from anon, authenticated;
revoke select on public.crafted_items  from anon, authenticated;
revoke select on public.cut_resources  from anon, authenticated;

-- Still readable where RLS allows
grant select on public.players           to anon, authenticated;
grant select on public.world_tree        to anon, authenticated;
grant select on public.world_tree_donors to anon, authenticated;
grant select on public.friends           to authenticated;
grant select on public.friend_requests   to authenticated;
grant select on public.player_reports    to authenticated;

-- ============================================================================
-- GRANT execute on RPCs (broadcast_chunk_event intentionally NOT granted to clients)
-- ============================================================================

-- Core / profile
grant execute on function public.check_rate_limit()                                    to authenticated;
grant execute on function public.check_chat_rate_limit()                               to authenticated;
grant execute on function public.update_position(real, real)                           to authenticated;
grant execute on function public.require_near(real, real, real)                        to authenticated;
grant execute on function public.name_contains_profanity(text)                         to authenticated;
grant execute on function public.sanitize_chat(text)                                   to authenticated;
grant execute on function public.ensure_profile(text, text)                            to authenticated;
grant execute on function public.check_name_available(text)                            to anon, authenticated;
grant execute on function public.update_profile(text, text, text, text, text, text)    to authenticated;
grant execute on function public.buy_cosmetic(text, text, text)                        to authenticated;
grant execute on function public.claim_daily_bonus()                                   to authenticated;
grant execute on function public.claim_offline_gold()                                  to authenticated;
grant execute on function public.teleport_to_landmark(text)                            to authenticated;
grant execute on function public.set_spawn(real, real)                                 to authenticated;
grant execute on function public.donate_to_world_tree(int)                             to authenticated;

-- World
-- broadcast_chunk_event: SECURITY DEFINER only, called by other RPCs — not for clients
revoke all on function public.broadcast_chunk_event(text, real, real, jsonb) from public, anon, authenticated;
grant execute on function public.plant_tree(uuid, real, real, smallint, smallint, real) to authenticated;
grant execute on function public.water_tree(uuid)                                      to authenticated;
grant execute on function public.cut_tree(uuid)                                        to authenticated;
grant execute on function public.place_rock(uuid, real, real, real, smallint, real, real, real, smallint) to authenticated;
grant execute on function public.remove_rock(uuid)                                     to authenticated;
grant execute on function public.place_crafted_item(uuid, text, real, real, real, integer, integer) to authenticated;
grant execute on function public.remove_crafted_item(uuid)                             to authenticated;
grant execute on function public.cut_procedural_resource(text, text, text)             to authenticated;
grant execute on function public.dye_tree(uuid, text, integer)                         to authenticated;
grant execute on function public.buy_custom_plot(uuid, smallint, real, real, real, real) to authenticated;
grant execute on function public.discover_landmark(text)                               to authenticated;
grant execute on function public.release_overgrown_item(uuid, text)                    to authenticated;
grant execute on function public.get_nearby_world(integer, integer)                    to authenticated;
grant execute on function public.procedural_chunk_count(text, text)                    to authenticated;

-- Social / chat / moderation
grant execute on function public.get_social_data()                                     to authenticated;
grant execute on function public.send_friend_request(uuid)                             to authenticated;
grant execute on function public.send_friend_request_by_name(text)                     to authenticated;
grant execute on function public.accept_friend_request(uuid)                           to authenticated;
grant execute on function public.decline_friend_request(uuid)                          to authenticated;
grant execute on function public.unfriend(uuid)                                        to authenticated;
grant execute on function public.get_player_profile(uuid)                              to authenticated;
grant execute on function public.toggle_block(uuid)                                    to authenticated;
grant execute on function public.check_region_chat(text)                               to authenticated;
grant execute on function public.send_region_chat(text)                                to authenticated;
grant execute on function public.send_world_chat(text)                                 to authenticated;
grant execute on function public.report_player(uuid, text, text)                       to authenticated;
grant execute on function public.admin_set_ban(uuid, boolean, text)                    to authenticated;

-- ============================================================================
-- Realtime publication (add tables if missing; do not drop whole publication)
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_tree'
  ) then
    alter publication supabase_realtime add table public.world_tree;
  end if;
exception when others then null;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'world_tree_donors'
  ) then
    alter publication supabase_realtime add table public.world_tree_donors;
  end if;
exception when others then null;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friends'
  ) then
    alter publication supabase_realtime add table public.friends;
  end if;
exception when others then null;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
exception when others then null;
end
$$;

-- ============================================================================
-- End of consolidated schema.
-- Apply order reminder: 01_core → 02_world → 03_social → 04_security
-- ============================================================================
