# Security & UI Audit — *a shared garden* (Meadow)

**Date:** 2026-07-14  
**Last updated:** 2026-07-15 — full session rollup (security 1–14, UX P0–P3, first-walk quest, modular schema)  
**Stack:** React 18 + Vite + Three.js + Supabase (Auth / Realtime / Postgres RPCs) + Zustand  

---

## Session status (all work in this chat)

| Area | Status |
|------|--------|
| Security issues **1–14** | **Fixed** in code + modular schema |
| Security **15–25** (medium/low residual) | Partially improved (see notes); not all closed |
| UI a11y + design tokens + Create hub | **Done** |
| Mobile action bar + top-bar declutter | **Done** |
| Chat UX, connection toasts, first-walk quest | **Done** |
| P0 / P1 / P2 / P3 roadmap | **Done** |
| Modular Supabase schema `01`–`04` | **Done**; legacy archived |

### Security #13 — Friend system RLS — **already fixed**

No further code change required. Confirmed in live modular files:

| Requirement | Implementation |
|-------------|----------------|
| No client DELETE on friendships | Policy `"Users can delete their own friendships"` **dropped** |
| No direct INSERT/UPDATE/DELETE | `REVOKE insert, update, delete` on `friends` + `friend_requests` from `anon`/`authenticated` |
| SELECT only for participants | Policy: `auth.uid() = user1_id OR user2_id` (friends); sender/receiver for requests |
| Mutations RPC-only | `send_*` / `accept` / `decline` / `unfriend` only |
| DEFINER + fixed search_path | All social RPCs: `security definer set search_path = public` |
| Rate limits | 5s between friend requests; max **25** pending outbound |

**Files:** `supabase/schema/03_social.sql`, `supabase/schema/04_security.sql`  
**Apply:** re-run `03_social.sql` then `04_security.sql` (or full `01`→`04`) on the live project if the DB was never updated.

---

## Database source of truth

```
supabase/schema/
  01_core.sql      # players, rate limits, position, profile, cosmetics, world tree
  02_world.sql     # trees/rocks/plots/craft/cuts + world RPCs
  03_social.sql    # friends, chat, reports, bans
  04_security.sql  # authoritative RLS, REVOKE, GRANT, realtime
```

Apply **01 → 02 → 03 → 04** in the Supabase SQL editor.  
Legacy: `archive/supabase-legacy/` (old `schema.sql` + `migrations/*`). Do not apply on new projects.

---

## Part 1 — Security issues

### Critical / High (1–14) — **FIXED**

| # | Issue | Resolution (where) |
|---|--------|-------------------|
| 1 | Free rocks via client `p_cost` | Server cost by `rock_shape` (5/8g); remove +2g; no client cost — `02_world.sql`, `Net.jsx` |
| 2 | Free craft via client wood/stone | Server catalog by `item_id`; partial refunds — `02_world.sql` |
| 3 | Fake procedural cut IDs | Format/chunk/type/index + near chunk — `02_world.sql` |
| 4 | Free trees print +5g | Free shapes bonus `0`; paid +5 — `02_world.sql`, `store.js` |
| 5 | Landmark gold without whitelist | Whitelist + proximity — `02_world.sql` |
| 6 | No server position | `update_position` + `require_near` — `01_core.sql`, `Net.jsx` |
| 7 | Captcha optional | Prod fail-closed — `captcha.js`, `Net.jsx` |
| 8 | Region chat client-broadcast | `send_region_chat` server emit — `03_social.sql`, `Net.jsx` |
| 9 | Client-trusted world mutations | Server `broadcast_chunk_event`; client dropped forge sends — `02_world.sql`, `Net.jsx` |
| 10 | Players world-readable | RLS self SELECT only — `04_security.sql` |
| 11 | Friends graph world-readable | Participant SELECT + DML revoke — `03`/`04` |
| 12 | `cut_resources` full scan | `.in(chunk_key).select(...).limit(500)` — `Net.jsx` |
| 13 | Friend RLS incomplete | See table above — **already fixed** |
| 14 | Schema drift | Modular `schema/01`–`04`; legacy archived |

**Residual (acceptable for now):** client-broadcast of `pos` / `dye` (session cosmetic only; DB is truth on reload).

### Medium residual (not fully closed)

| # | Topic | Status |
|---|--------|--------|
| 15 | Water any tree for gold | **Improved** — proximity via `require_near`; daily gold cap still optional |
| 16 | Weak profanity filter | **Improved** — report/ban tooling; filter itself still simple |
| 17 | Mute persistence | **Fixed** — `moderation.js` localStorage + server `blocked_users` |
| 18 | CSS injection via colors | **Improved** — hex validation on receive paths |
| 19 | CSP / headers | **Fixed** — `vercel.json`, `public/_headers`, Vite headers |
| 20 | Sentry scrubbing | Unchanged (OK defaults) |
| 21 | Offline localStorage trust | Online hydrate still authoritative |
| 22 | Welcome/Identity null supabase | **Fixed** |
| 23 | Debug logs | **Fixed** — DEV-gated |
| 24 | Rate limiter | Unchanged (token bucket OK) |
| 25 | `old_net.jsx` | **Fixed** — `archive/old_net.jsx` |

---

## Part 2 — UI / UX

| Item | Status | Notes |
|------|--------|--------|
| Compass missing import | **Fixed** | `Hud.jsx` |
| Inline styles / tokens | **Fixed** | `:root` tokens, utilities, `Modal.jsx` |
| Accessibility (focus, dialogs, OTP, reduced-motion) | **Fixed** | `a11y.js`, forms, teleport |
| Mobile action bar + top bar clutter | **Fixed** | `MobileActionBar.jsx`, resource pill |
| Create hub (shop+craft) | **Fixed** | `CreateHub.jsx` — Trees · Rocks · Craft · Land · Style; G/Q |
| Chat UX (mutes, errors, limits) | **Fixed** | Mutes panel, `chatError`, `CHAT_TEXT_MAX=160` |
| Guest email progress warning | **Fixed** | WelcomeScreen |
| Connection / offline feedback | **Fixed** | Status + typed toasts + `goOffline(reason)` |
| First-session landmark walk | **Fixed** | `FirstWalkQuest.jsx` → Lonely Oak |
| Loading fade non-blocking | **Fixed** | Unmount after fade |
| Chat re-renders | **Fixed** | Memo + selectors |

---

## Part 3 — Roadmap

| Phase | Status |
|-------|--------|
| **P0** Economy / captcha / compass | **Done** |
| **P1** Chat integrity, RLS, proximity, schema | **Done** |
| **P2** Modal, mobile bar, Create hub, toasts, a11y | **Done** |
| **P3** CSP, archive old_net, friend limits, report/ban, chat constants | **Done** |

---

## Key files (current)

| Area | Path |
|------|------|
| Schema modules | `supabase/schema/01_core.sql` … `04_security.sql` |
| Schema docs | `supabase/README.md` |
| Legacy SQL archive | `archive/supabase-legacy/` |
| Net / captcha | `src/net/Net.jsx`, `captcha.js`, `moderation.js`, `bridge.js` |
| Create hub | `src/ui/CreateHub.jsx`, `Modal.jsx` |
| Mobile dock | `src/ui/MobileActionBar.jsx` |
| First walk | `src/ui/FirstWalkQuest.jsx` |
| Store | `src/store.js` (`CHAT_TEXT_MAX`, connection notes, firstWalkQuest) |
| Headers | `vercel.json`, `public/_headers`, `vite.config.js` |

---

## Apply / ops checklist

- [ ] Run `supabase/schema/01` → `04` on the live Supabase project (required for #13 and all server fixes)
- [ ] Production: `VITE_TURNSTILE_SITE_KEY` + Supabase Auth CAPTCHA secret
- [ ] Host serves security headers (Vercel / Netlify headers files already present)
- [ ] Optional: JWT `app_metadata.role = admin` for `admin_set_ban`

### Quick verify for #13 (SQL editor)

```sql
-- Should show SELECT-only policies for friends (no DELETE/INSERT policies for clients)
select polname, polcmd from pg_policy
  join pg_class on pg_class.oid = polrelid
 where relname in ('friends', 'friend_requests');

-- Direct DML should fail for authenticated role (run as anon key client, not service role)
```

---

## Testing checklist (high level)

- [ ] Friend request works via UI; second request within 5s fails  
- [ ] Client cannot `DELETE` from `friends` with anon key  
- [ ] Free plant does not mint gold; free rock cost rejected  
- [ ] Region chat spoof without RPC not trusted  
- [ ] Create hub opens with G/Q; mobile bar on narrow width  
- [ ] First walk appears after new guest welcome  
- [ ] Offline shows connection reason toast/status  

---

*This document is the session rollup of security + UI work. Advisory history preserved as FIXED notes; implement live DB by applying modular schema files.*
