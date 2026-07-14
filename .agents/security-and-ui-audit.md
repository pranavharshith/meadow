# Security & UI Audit — *a shared garden* (Meadow)

**Date:** 2026-07-14  
**Scope:** Full source scan (`src/`, `supabase/`, config, entry HTML). No code was changed.  
**Stack:** React 18 + Vite + Three.js + Supabase (Auth / Realtime / Postgres RPCs) + Zustand  

This report is **suggestions only**. Severity is relative to an online multiplayer game where gold, world state, and chat are shared.

---

## Executive summary

The project has a solid **intent**: mutations go through `SECURITY DEFINER` RPCs, table writes are largely revoked, and world chat is server-emitted. In practice, several **client-trusted parameters**, **open SELECT policies**, and **Realtime broadcast trust** break that model and enable economy exploits, spam, and privacy leaks.

On the UI side, the HUD is charming but cramped, inconsistent (heavy inline styles vs CSS), weak on accessibility, and has at least one **broken import** that will crash the main HUD.

---

# Part 1 — Security vulnerabilities

## Critical (economy / integrity)

### 1. Free rocks → free gold loop (`place_rock` trusts client cost)

**Where:** `supabase/schema.sql` → `place_rock(..., p_cost integer default 5)`  
**Code:** `p_cost := greatest(0, least(50, coalesce(p_cost, 5)));` then debits that amount.  
**Client:** `Net.jsx` passes `p_cost` from the client.

**Issue:** A modded client can call the RPC with `p_cost = 0`, place rocks for free, then `remove_rock` for **+3 gold** each time → infinite gold.

**Fix:**
- Derive cost **only on the server** from `rock_shape` / catalog (same pattern as `plant_tree` shape costs).
- Never accept `p_cost` from the client.
- Optionally make removal refund ≤ placement cost or award resources instead of net-positive gold.

---

### 2. Free crafted items → free wood/stone (`place_crafted_item` trusts costs)

**Where:** `supabase/migrations/crafting_update.sql` → `place_crafted_item(..., p_cost_wood, p_cost_stone)`  
**Client:** `bridge.placeCraftedItem(item, costWood, costStone)`.

**Issue:** Costs are `greatest(0, client_value)`. Client can pass `0, 0`, place anything, then `remove_crafted_item` refunds **+1 wood and +1 stone** → free economy.

**Fix:**
- Server maps `p_item_id` → fixed wood/stone cost from a server-side table or `CASE`.
- Reject unknown `item_id`.
- Refund based on known recipe, not a flat +1/+1.

---

### 3. Infinite wood/stone via fake procedural cuts

**Where:** `cut_procedural_resource(p_id, p_type, p_chunk_key)`  
**Issue:** No proof that `p_id` corresponds to a real world resource. Any unique string ID awards wood (3) or stone (2). Rate limit only slows the farm.

**Fix:**
- Server-side deterministic catalog: given `chunk_key` + seed, only allow IDs that exist in that chunk’s procedural set.
- Or HMAC/sign resource IDs issued when the client loads a chunk.
- Cap cuts per chunk / per day server-side beyond the token bucket.

---

### 4. Free trees print gold (`plant_tree`)

**Where:** `plant_tree` — shape `0` (and other free shapes) cost `0`, then  
`gold = gold - v_cost + 5` → **+5 gold per plant**.

**Issue:** Legitimate “reward for planting” becomes an AFK gold printer under cooldown (~500ms + rate limit). Combined with free watering gold (`water_tree` +1), economy inflation is trivial.

**Fix:**
- Do not award gold for free plant shapes, or award only once per day / with diminishing returns.
- Or charge a base cost ≥ reward.
- Watering: cap gold from watering per day, or only award XP/not gold.

---

### 5. Landmark discovery gold without whitelist

**Where:** `discover_landmark(p_landmark_id text)`  
**Issue:** Only checks non-empty length ≤ 64 and “not already in array”. Any invented id grants **+20 gold**. Unlimited unique strings → unlimited gold.

**Fix:**
- Maintain a server whitelist of landmark IDs (mirror `places.js`).
- Optionally require player proximity (see also missing position checks).

---

### 6. No server-side player position for placement / actions

**Where:** plant / rock / plot / craft / set_spawn / cut RPCs take coordinates from the client only.

**Issue:** Client can plant, place, cut, and claim plots **anywhere in the world** without being nearby. Enables remote griefing of popular areas, pre-seeding regions, and abusing spacing locks from afar.

**Fix:**
- Store last trusted position (or presence heartbeat) server-side and require actions within N units.
- Or pass signed position from a position RPC updated at limited Hz.
- Validate spawn and plot centers the same way.

---

## High (auth, chat, privacy, realtime)

### 7. Captcha is optional in code (bots can mint anonymous accounts)

**Where:** `src/net/captcha.js`  
Comment claims auth is refused without `VITE_TURNSTILE_SITE_KEY`; implementation **warns and returns `null`**, and `signInAnonymously` still proceeds.

**Impact:** Identity cycling for daily bonus (+10/day/account), friend-request spam, chat spam under many accounts (rate limit is per user, not per IP beyond Turnstile).

**Fix:**
- Fail closed in production when captcha is required.
- Enforce CAPTCHA in Supabase Auth dashboard with matching secret.
- Consider device/IP throttling and email-link for progression.

---

### 8. Region chat is client-broadcast (forgeable)

**Where:** `Net.jsx` `bridge.sendChat` for region scope:
1. Calls `check_region_chat` (rate limit + sanitize).
2. Client **broadcasts** payload (`id`, `name`, `color`, `text`).

**Issues:**
- Modded client can broadcast **without** calling the RPC (if channel ACL allows open broadcast).
- Even after RPC, client can broadcast **different text**, spoof **name/color**, or impersonate another `id`.
- World chat is correctly server-emitted via `realtime.send()`; region chat is not.

**Fix:**
- Mirror world chat: server RPC emits region channel message with server-side name/color/id.
- Or use Realtime authorization + private channels and only allow server sends.
- Never trust client-provided `id` / `name` on receive; resolve display from presence + auth.

---

### 9. All world mutation events over Realtime are client-trusted

**Where:** Chunk channels accept broadcast events: `pos`, `tree`, `cut`, `rock`, `plot`, `dye`, `crafted`, `cutprocedural`, etc.

**Issue:** Peers can inject ghost players, fake trees/rocks/plots, mass-delete visuals (cut/removerock for others’ views), dye spam, and cutprocedural fakes. Server DB remains truth on reload, but **session griefing / lag / confusion** is easy.

**Fix:**
- Prefer postgres_changes / server broadcast after successful RPC.
- On client receive: ignore object mutations unless confirmed by SELECT or a signed server event.
- Cap broadcast rate; disconnect abusive clients.

---

### 10. Players table is world-readable (`SELECT using (true)`)

**Where:** `create policy "players readable" on public.players for select using (true);`

**Exposed fields include:** `gold`, `wood`, `stone`, `blocked_users`, `custom_spawn_*`, rate-limit tokens, `discovered`, cosmetics, etc.

**Impact:** Cheaters map rich targets; stalkers see block lists and spawns; rate-limit state may help evade limits.

**Fix:**
- Restrict SELECT to public columns via a view (`id`, `name`, `color`, cosmetics, `trees_planted`, `created_at`).
- Full row only for `auth.uid() = id`.
- Hide `blocked_users`, economy fields, spawn, rate-limit internals.

---

### 11. Friends graph is world-readable

**Where:** `"Friends readable by anyone" ... using (true)`.

**Impact:** Full social graph enumeration.

**Fix:** Only readable if `auth.uid()` is one of the two users (or via `get_social_data` only).

---

### 12. `cut_resources` full-table SELECT

**Where:** `Net.jsx` `supabase.from('cut_resources').select('*')` with client-side filter.

**Impact:** As the table grows, every chunk load pulls the **entire** cut history → bandwidth DoS / latency. RLS allows all rows.

**Fix:**
- Query `.eq('chunk_key', ...)` or `.in('chunk_key', neededKeys)`.
- Periodic purge already exists (60 min); keep indexes and bound response size.

---

### 13. Friend system RLS incomplete

**Where:**
- `friends` has **DELETE** policy for participants (direct table delete, bypassing RPC auditing).
- No obvious `REVOKE INSERT/UPDATE` on `friends` / `friend_requests` in schema (rely on missing policies; fragile if a permissive policy is added later).
- `get_social_data` / `send_friend_request_by_name` are `SECURITY DEFINER` **without** `SET search_path = public` (search_path hijack risk if objects are planted in other schemas).

**Fix:**
- Revoke all direct DML; RPCs only.
- Always `security definer set search_path = public` (and fixed roles).
- Rate-limit friend requests hard; cap pending outbound.

---

### 14. Schema drift / dual definitions

**Where:** Root `schema.sql` vs migrations (`shop_system_fix.sql`, `crafting_update.sql`, `friend_system.sql`).

**Examples:**
- `buy_cosmetic` in base schema charges every time; migration adds `owned_cosmetics` and free re-equip.
- `cut_tree` / `remove_rock` return types and rewards differ (gold vs wood/stone).
- Client `update_profile` called with head/body/leg/hat args; base schema only has `(p_name, p_color)`.

**Impact:** Depending on which scripts were applied, production may run **weaker or broken** functions; hard to audit what is live.

**Fix:**
- Treat migrations as single source of truth; regenerate a “current” schema dump from prod.
- CI check that client RPC signatures match DB.
- Never re-run the plaza refund `DO $$ ... $$` block on every schema apply (it can **reprint gold** if re-executed carelessly).

---

## Medium

### 15. Watering any tree for gold

`water_tree` does not require ownership or proximity. Any watered sapling grants +1 gold. Mild farm + griefing tool (force-grow others’ trees).

**Fix:** Optional ownership or “help others” without gold; proximity check; daily water gold cap.

---

### 16. Profanity filter is trivial to bypass

Client + server regex whole-word lists. Leetspeak, spacing, unicode confusables, and non-English slurs pass. Names and chat both affected.

**Fix:** Better moderation service, report/ban tools, server-side logging of raw chat for review, longer mute/block UX.

---

### 17. Mute list comments vs behavior

`moderation.js` defines `MUTE_KEY` but does not persist mutes to `localStorage` in the scanned code; server `blocked_users` is used when online. Chat UI comment claims localStorage mutes.

**Fix:** Align docs and implementation; persist offline mutes; sync with `toggle_block`.

---

### 18. CSS injection via free-form colors in chat/UI

Chat names use `style={{ color: m.color }}`. Profile/presence colors are not strictly validated on every path (server validates profile color as `#RRGGBB` on update, but presence/chat payload colors are client-set).

**Fix:** Sanitize colors with a strict hex regex before applying to styles; ignore invalid values.

---

### 19. Anonymous auth + session in localStorage

Expected for Supabase, but XSS would steal the session. No CSP in `index.html`.

**Fix:**
- Content-Security-Policy (default-src, script-src for Turnstile/Sentry only).
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Keep React text rendering (no `dangerouslySetInnerHTML` — good; keep it that way).

---

### 20. Sentry `beforeSend` UUID scrubbing

Scrubbing all UUIDs can hinder debugging; stringifying the whole event can drop structured context. Not a vulnerability, but PII strategy should allowlist fields rather than global replace.

---

### 21. Offline localStorage trust

Offline gold/trees are local-only (fine). Ensure **online hydrate always overwrites** economy fields (mostly done via `hydrateProfile`). Watch for code paths that re-persist optimistic gold after failed RPCs.

---

### 22. `WelcomeScreen` / `Identity` RPC without null guard

When `supabase` is null (offline), name availability effect still calls `supabase.rpc(...)` → runtime error if welcome opens offline with online-shaped code paths.

**Fix:** Guard `if (!supabase) { setIsValid(true); return }`.

---

### 23. Debug log with plot payload

`console.log('[buyCustomPlot] sending:', params)` in production builds leaks coordinates/ids to console (minor).

---

### 24. Rate limiter semantics

Token bucket regenerates with `elapsed` seconds and burst 5. Combined with free-economy bugs, still allows meaningful abuse over time. Consider IP-level limits at edge (Cloudflare) for auth and RPC.

---

### 25. `old_net.jsx` in repo root

Large legacy network file (~59KB). Risk of someone importing or deploying stale logic; noise for audits.

**Fix:** Remove or quarantine under `archive/` with a note.

---

## Security strengths (keep these)

- Mutations generally require `auth.uid()` and use `SECURITY DEFINER` + `search_path = public` on core RPCs.
- Direct INSERT/UPDATE/DELETE revoked on major tables (`players`, `trees`, `rocks`, `plots`, `crafted_items`, `cut_resources`).
- World chat pays gold, rate-limits, sanitizes, and **server-emits**.
- Spacing + plaza exclusion + advisory locks on some place operations.
- Gold not settable via identity bridge.
- Sentry `sendDefaultPii: false` and basic scrubbing.
- `.env` is gitignored; anon key is expected public with RLS (still: never ship service role).

---

# Part 2 — UI / UX issues (“shit UI”)

## Critical UI bug

### Missing `Compass` import in `Hud.jsx`

`Hud.jsx` renders `<Compass />` but **does not import** `./Compass`. This will throw `ReferenceError: Compass is not defined` when the HUD mounts and can blank the entire overlay UI.

**Fix:** `import Compass from './Compass'`.

---

## Layout & density

### 1. Top bar overcrowding

Brand title, name, Social badge, wood, stone, gold, status, minimap, and compass compete in one strip. On mid-width screens, `.who` wraps while minimap stays large → uneven, cluttered header.

**Suggestions:**
- Collapse resources into one pill (`🪵 n · 🪨 n · 🪙 n`) with tooltip breakdown.
- Move Social into a dedicated icon button with badge only.
- Hide title on mobile or shrink letter-spacing.

### 2. Bottom control cluster vs chat vs hints

Desktop: chat bottom-left, buttons bottom-right, hints floating middle. Mobile media queries stack buttons and push hints to `bottom: 200px`, but **shop/crafting/identity panels** still fight for the same vertical space as the joystick.

**Suggestions:**
- Single “dock” pattern: one expandable bottom sheet for actions on mobile.
- Auto-dismiss or shrink hint after first movement (partially there with `seen`).
- Ensure panels never cover the dual-zone joystick hit areas.

### 3. Identity / Social panels under brand

Identity opens under the name tag (`width: 240px`) while Social is a second floating panel. Both use ad-hoc layout; Social hardcodes `style={{ width: 280 }}`. Easy to overflow off the left edge on small screens; no max-height strategy consistent with shop.

**Suggestions:**
- Shared modal shell: max-height 70vh, scroll body, sticky header, backdrop click to close.
- Escape closes all overlays consistently (shop/settings partially do; identity less so).

---

## Visual inconsistency

### 4. Inline styles everywhere

`Identity.jsx`, `Social.jsx`, `WelcomeScreen.jsx`, `Crafting.jsx`, `Hud` teleport flash, badges — large blocks of inline CSS instead of classes in `styles.css`.

**Effects:** Harder theming, inconsistent spacing/radius/blur, no dark-mode / reduced-motion hooks, harder review.

**Suggestion:** Extract shared tokens:

```text
--panel-bg, --panel-border, --radius, --text-muted, --danger, --focus-ring
```

Reuse `.panel`, `.row`, `.badge`, `.stat-grid` classes.

### 5. Glassmorphism over 3D

Frosted panels (`backdrop-filter`) over a bright golden meadow reduce text contrast, especially white-on-glass labels at 0.7 opacity.

**Suggestions:**
- Slightly darker panel base (`rgba(12,16,12,0.72)`).
- Ensure body text ≥ WCAG AA against actual blurred sample.
- Optional high-contrast setting next to graphics toggles.

### 6. Emoji-heavy affordances

Mute `⊘`, nav `⌖`, craft/shop emoji cards, resource emoji — cute but uneven sizes and poor screen-reader names (some `aria-label`s exist; many buttons only have emoji/title).

---

## Accessibility

### 7. Focus management

- Many controls set `outline: none` without a visible `:focus-visible` replacement (identity inputs, etc.).
- Shop focuses first tab on open (good); chat opens on Enter (good); identity/social less keyboard-complete.
- Social custom focus outline via inline style is inconsistent with system focus rings.

**Suggestions:**
- Global `:focus-visible { outline: 2px solid #b8e986; outline-offset: 2px; }`.
- Trap focus inside open modals; restore focus on close.
- `role="dialog"` + `aria-modal="true"` + labelled-by title on shop, crafting, welcome, identity, map.

### 8. Welcome / auth forms

- Guest vs email toggle is fine but error and success both use `.welcome-error` for auth notes (success styled as error).
- OTP field is free text without `inputMode="numeric"`, `autoComplete="one-time-code"`, or paste handling.
- No “resend code” or clear way back from OTP without toggling modes carefully.

### 9. Motion & vestibular

Teleport full-screen white flash (`opacity` 0→1, z-index 9999) with no `prefers-reduced-motion` respect. Weather/particles have settings; flash does not.

### 10. Touch targets

Settings gear and small chat mute/nav icons can fall under 44×44px. Social accept/decline `padding: '0 6px'` is tight.

### 11. Map / minimap

Minimap is pointer-events auto (good) but may lack keyboard alternative to open world map. World map close has aria-label (good).

### 12. Color-only state

Invalid name uses class `invalid` (need strong border/text, not only color). Affordability in shop uses `.cant-afford` — ensure non-color cue (opacity + “need Xg” text).

---

## Interaction & product UX

### 13. Control discoverability

Hint strip lists many keys; `hint-wide` hidden on narrow screens so mobile users lose plant/water/cut/chat hints. Joystick helps move/look but not actions.

**Suggestion:** Mobile action bar: Plant · Water · Cut · Chat · Menu.

### 14. Chat UX

- Unread badge is good.
- Mute/nav icons only appear per message; no muted-user management list in UI.
- World tab cost shown; failed send (not enough gold) relies on flash — easy to miss.
- Max length input 160 vs store `CHAT_MAX = 60` mismatch risk (confirm which is enforced).

### 15. Shop / crafting dual systems

Two large panels (G vs Q) with similar chrome. Players may not understand gold shop vs wood/stone crafting.

**Suggestion:** Unified “Create” hub with tabs: Nature · Craft · Cosmetics · Land.

### 16. Guest progress loss on email conflict

Identity conflict copy is clear (good). Welcome email login path should also warn if linking overwrites guest.

### 17. Connecting / offline feedback

`Status` is minimal. Failed captcha/sign-in sets offline silently (`setOnline(false)`). Users may not know why multiplayer is dead.

**Suggestion:** Explicit toast: “Could not connect — captcha/network/auth failed”.

### 18. Fatal error copy

Error boundary says “relay the error to the AI!” — fine for internal playtests, unprofessional for public users. Prefer “Reload” + optional “Copy error id” when Sentry is on.

### 19. Viewport lock

`user-scalable=no` hurts accessibility for low-vision users. Prefer allowing zoom if UI can reflow.

---

## Performance-adjacent UI

### 20. HUD re-renders

`Chat` maps messages and calls `useStore.getState().worldTreeDonors.has` per row; mute bump hacks force full list re-render. Prefer selector subscriptions.

### 21. Loading fade

Warm haze fade is polished; ensure it does not block pointer events after `gone` (it sets `pointer-events: none` always — good).

---

# Part 3 — Prioritized improvement roadmap

## P0 — Do first (breaks game / economy)

1. Fix `Compass` import in `Hud.jsx`.
2. Server-side costs for rocks and crafted items (ignore client prices).
3. Whitelist landmark IDs; fix free-tree gold printer and free rock remove loop.
4. Validate or sign procedural cut IDs.
5. Fail closed on captcha in production; enable Supabase CAPTCHA.

## P1 — Multiplayer integrity

6. Server-emit region chat; stop trusting client broadcasts for chat identity.
7. Prefer server-driven world deltas over raw client broadcast for trees/rocks/plots.
8. Restrict `players` / `friends` SELECT policies; view for public profile.
9. Proximity checks on place/cut/discover.
10. Reconcile schema.sql vs migrations; dump live schema.

## P2 — Product polish

11. Shared modal system + CSS tokens; purge inline style sprawl.
12. Mobile action bar; reduce top-bar clutter.
13. Focus rings, dialog roles, OTP autocomplete, reduced-motion teleport.
14. Clearer online/offline/error toasts.
15. Unified Create/Shop hub; muted users management.

## P3 — Hardening & hygiene

16. CSP + security headers on host.
17. Remove or archive `old_net.jsx`.
18. Bound `cut_resources` queries; friend-request rate limits.
19. Stronger moderation tooling (report, admin ban).
20. Align chat max length constants; remove debug `console.log`s.

---

# Part 4 — File map of notable risk areas

| Area | Path | Notes |
|------|------|--------|
| Auth / captcha | `src/net/captcha.js`, `Net.jsx` init | Optional captcha, anonymous sessions |
| Bridge / RPC | `src/net/bridge.js`, `Net.jsx` | Client costs, broadcast after RPC |
| Moderation | `src/net/moderation.js` | Weak filter; mute persistence unclear |
| Store / economy | `src/store.js` | Optimistic gold; chat length |
| DB core | `supabase/schema.sql` | Open SELECT, place_rock cost, plant rewards |
| Crafting economy | `supabase/migrations/crafting_update.sql` | Client wood/stone costs |
| Shop inventory | `supabase/migrations/shop_system_fix.sql` | Better buy_cosmetic — ensure applied |
| Friends | `supabase/migrations/friend_system.sql` | DEFINER without search_path |
| HUD | `src/ui/Hud.jsx` | Missing Compass import; clutter |
| Chat | `src/ui/Chat.jsx` | Good unread UX; forgeable backend |
| Identity / Welcome | `src/ui/Identity.jsx`, `WelcomeScreen.jsx` | Auth UX; null supabase |
| Social | `src/ui/Social.jsx` | Inline styles; dense list |
| Styles | `src/styles.css` | Solid base; needs tokens + a11y |
| Monitoring | `src/monitoring/sentry.jsx` | OK defaults |

---

# Part 5 — Testing checklist (when you implement fixes)

- [ ] Modded RPC: `place_rock` with cost 0 → must fail or charge catalog price  
- [ ] Modded RPC: `place_crafted_item` costs 0 → must fail  
- [ ] Modded RPC: random `cut_procedural_resource` ids → reject  
- [ ] Modded RPC: fake landmark ids → reject  
- [ ] Region chat inject without RPC → not shown / channel auth denies  
- [ ] Anonymous sign-in without captcha token in prod → fail  
- [ ] `SELECT` as user B cannot read user A gold / blocked_users  
- [ ] HUD loads without console error; compass visible  
- [ ] Keyboard-only: open shop, tab through cards, Esc closes  
- [ ] Mobile 390px width: joystick + chat + plant still usable  

---

# Part 6 — Extension: Game mechanics & progression (before → after)

This section is an **add-on** to the security/UI audit. It describes how the **gameplay loop** and **player progression** feel today, and how they could feel **after** the security, economy, UI, and design changes in this document are implemented.

**Legend**

| Label | Meaning |
|--------|---------|
| **Before** | Current live design (as the codebase behaves today) |
| **After** | Future design players can observe once this file’s fixes and progression ideas ship |

No code is specified here—only observable player-facing outcomes and simple linear flows.

---

## 6.1 Overall player journey

### Flow — first hour (linear)

**Before (current)**

```text
Open game
  → Pick name / colour (or email)
  → Drop at spawn plaza
  → Optional: dismiss key hints
  → Wander or plant free trees for gold
  → Maybe open shop / craft / chat
  → Daily +10g if online
  → No clear “next goal”
```

**After (future)**

```text
Open game
  → Pick name / colour (or email)
  → Short welcome goal: “Walk to the Lonely Oak”
  → First discovery reward + tutorial toast
  → Guided first plant (paid or free once, no gold printer)
  → Unlock wood/stone by cutting nearby wild growth
  → Craft first bench or path
  → Daily login + small quest board (3 soft goals)
  → Visible progress: Explorer rank / garden score
```

### Table — first-session experience

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Onboarding | Name + colour, then open world | Name + colour + one guided walk-and-discover |
| First success | Easy free trees / accidental gold | Clear milestones: discover → plant → cut → craft |
| Confusion risk | Many systems at once (shop, craft, plots, social) | Systems unlock in order as soft gates |
| “What now?” | Player invents goals | Soft quest strip: Explore / Grow / Socialize |
| Retention hook | Daily gold only | Daily goals + streak flair (cosmetic, not pay-to-win) |

---

## 6.2 Core economy loop

### Flow — how resources move (linear)

**Before**

```text
Do almost anything that awards gold
  → Gold pile grows (including free plant +5, water +1, exploit paths)
  → Spend on shop trees, rocks, plots, cosmetics, teleport, world chat
  → Wood/stone from cuts (weakly validated)
  → Craft decorations or donate to World Tree
```

**After**

```text
Explore and play fair actions
  → Earn gold mainly from discoveries, dailies, helping, and limited plant rewards
  → Earn wood/stone only from real wild resources near you
  → Spend gold on beauty and travel (trees, dyes, hats, teleport, plots)
  → Spend wood/stone on craft furniture and garden structure
  → Optional: donate wood to shared World Tree for badge + global goal
```

### Table — currencies and sinks

| Piece | Before (current) | After (future) |
|--------|------------------|----------------|
| Gold sources | Plant (+5 even if free), water, daily, discover, rock remove, offline reclaim | Discover, daily, limited plant bonus, help-water (small), events; **no free-print loops** |
| Gold sinks | Shop, plots, teleport, spawn set, dyes, world chat, cosmetics | Same sinks, plus optional seasonal cosmetics; costs always server-truth |
| Wood / stone | Procedural cut + plant cut / rock remove (migration path) | Same fantasy, but cuts must match real world IDs; craft costs fixed server-side |
| Free starter | Free broadleaf can farm gold | One free starter sapling **or** free plant with **no gold payout** |
| Exploit feel | Economy can be trivialized offline from rules | Progression feels earned; cheats blocked by Part 1 fixes |
| Feedback | Numbers change; little framing | Toasts like “+20g · Landmark discovered (3/26)” |

---

## 6.3 Planting, growth, watering, cutting

### Flow — tree lifecycle (linear)

**Before**

```text
Select tree in shop
  → Place near self (client-side)
  → Server accepts coords + shape cost
  → Wait ~90s (or water to speed)
  → Water any young tree for +1g
  → Cut own tree for wood/gold reward
  → Optional dye when mature
```

**After**

```text
Unlock tree tier by rank or gold
  → Place only within reach of player
  → Server checks cost, spacing, plaza, proximity
  → Grow over ~90s with visible stage (sprout → young → full)
  → Water own or others: growth help; gold only within daily help budget
  → Cut own mature tree for wood (fair, not infinite gold)
  → Dye / care options as beauty sinks
  → After 2 days unattended: overgrown reclaim by others (already sketched)
```

### Table — gardening mechanics

| Mechanic | Before (current) | After (future) |
|----------|------------------|----------------|
| Free tree economy | Free shape can net +5g each plant | Free plant allowed once or never pays gold |
| Growth readability | Time-based; little stage UI | Clear stages + “ready to cut / dye” cues |
| Watering | +1g, any sapling, 4s cooldown | Help-focused; daily gold cap; proximity required |
| Cutting own trees | Ownership checked; rewards vary by schema drift | One clear reward table (wood first, gold rare) |
| Cutting wild trees | Any invented cut ID may work | Only valid chunk resources; regen timer visible |
| Spacing / plaza | Enforced for many place RPCs | Same, plus “too far from you” rejection toast |
| Emotional loop | Plant → leave | Plant → care → show friends → optional harvest |

---

## 6.4 Exploration & landmarks

### Flow — discovery (linear)

**Before**

```text
Walk the meadow
  → Enter discover range
  → One-time +20g + name revealed
  → Teleport later costs 15g if discovered
  → Identity panel shows “Landmarks x / 10” (count UI may not match full list)
```

**After**

```text
Open map with rings: Near / Mid / Far
  → Walk or navigate to a landmark
  → Discover in range → +reward + journal entry
  → Collection score rises; mid/far landmarks pay more
  → Teleport only to discovered places (cost scales with distance tier)
  → Optional: photo at landmark for soft daily
```

### Table — exploration progression

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Landmark set | ~26 fixed places in rings | Same places, clearer tier labels on map |
| Reward | Flat +20g each | Tiered: near smaller, far larger; first discovery bonus |
| Map role | Navigate + teleport | Explore journal, % complete, “next closest undiscoved” |
| HUD count | “Landmarks n / 10” style stats | Match real total or show “Near 8/8 · Mid · Far” |
| Cheat | Fake landmark IDs could mint gold | Server whitelist only (from security section) |
| Social | Meet at named places (good fantasy) | Shareable “meet pin” + friend online at place |

---

## 6.5 Crafting, plots, and home-building

### Flow — home / garden base (linear)

**Before**

```text
Earn gold
  → Buy plot (size rules, up to 5, area quota)
  → Cut wild for wood/stone
  → Craft fence / bench / lantern / path / sign
  → Place items (client costs today)
  → Decorate freely
```

**After**

```text
Reach “Settler” soft rank (e.g. 3 discoveries + 1 plant)
  → Claim first small plot with tutorial pricing
  → Gather wood/stone nearby
  → Craft starter set (path + bench)
  → Unlock fancier craft recipes by rank or World Tree donation
  → Expand plot area within quota
  → Friends visit and react to your garden
```

### Table — building progression

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Plot access | Gold + shop, up to 5, max area | Soft unlock then gold; same hard caps |
| Craft list | Short fixed catalog | Same items first; later recipes gated lightly |
| Cost authority | Client can underpay (bug) | Server catalog only; UI shows truth |
| Purpose of plots | Personal land claim | Visible “home” on map; visit list for friends |
| Removal | Refund-ish behavior | Clear refund rules; no free-profit remove |
| Fantasy | Decorate meadow | Build a place others remember |

---

## 6.6 Cosmetics, hats, dyes, expression

### Flow — looking cool (linear)

**Before**

```text
Earn gold
  → Shop → Cosmetics / dyes / hats
  → Buy (or re-buy if old schema) → equip
  → Presence shows colours/hat to others
```

**After**

```text
Earn gold + complete soft goals
  → Cosmetics shop shows Owned / Locked / Affordable
  → Buy once, re-equip free (inventory)
  → Seasonal or discovery cosmetics (optional)
  → Dyes for trees as garden flex
  → Profile modal shows title from rank (Explorer, Gardener, Host…)
```

### Table — personal progression (non-combat)

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Hats / body dyes | Gold shop | Gold shop + maybe earn one free from quests |
| Tree dyes | Gold sink on mature owned trees | Same; palette unlocks with rank |
| Titles | None (or weak) | Soft titles from trees planted / landmarks / donors |
| World Tree badge | Donor at 500 wood donated | Same badge + public goal bar always visible |
| Pay feeling | Buy if rich | Earn → express; whales still buy, not required |

---

## 6.7 Daily rhythm & long-term goals

### Flow — day-to-day (linear)

**Before**

```text
Login
  → Claim daily +10g
  → Optional offline gold claim
  → Free roam until bored
```

**After**

```text
Login
  → Claim daily care package (gold + small wood/stone)
  → See 3 daily soft quests (discover 1 · water 3 · craft 1 · chat once…)
  → Progress bar for weekly garden score
  → Logout with next-session teaser (“2 landmarks left in the mid ring”)
```

### Table — retention loops

| Loop | Before (current) | After (future) |
|------|------------------|----------------|
| Daily | +10g | Care package + 3 optional dailies |
| Weekly | None explicit | Soft weekly: plant N, visit friends, donate wood |
| Shared | World Tree total wood | World Tree stages unlock world flair (extra petals, plaza decor) |
| Social | Friends, chat, mute | Friend gardens, visit pin, co-water bonus (tiny) |
| Risk of FOMO | Low | Keep optional; never punish missing a day harshly |

---

## 6.8 Multiplayer presence & social progression

### Flow — meeting others (linear)

**Before**

```text
Join region
  → See some players (presence / shards)
  → Chat region (free) or world (3g)
  → Mute / navigate to player
  → Friend request by name or profile
```

**After**

```text
Join region
  → Trustworthy names/chat (server identity)
  → Wave / sit / emote as icebreakers
  → Friend request with rate limits
  → Visit friend’s plot from social list
  → Optional group goal: water the same sapling
```

### Table — social mechanics

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Trust in chat | Client can forge region messages | Server-authored region chat (security fix) |
| Friends | Request / accept / unfriend | Same + “visit garden” + online indicator reliability |
| Grief | Remote place/cut possible if no proximity | Must be near action; reclaim rules fair |
| New player safety | Spawn plaza clear | Same plaza + starter quests at gate |
| Mute / block | Present | Clear muted list UI + persists |

---

## 6.9 Difficulty, pacing, and “skill” (soft)

This is a cozy game—progression should feel **calm competence**, not hardcore skill.

| Topic | Before (current) | After (future) |
|--------|------------------|----------------|
| Skill ceiling | Mostly knowledge of keys + economy quirks | Knowledge of map rings + garden design + social hosting |
| Failure states | “Not enough gold”, cooldowns, crowded plant | Clear why + what to do next (“Cut 2 pines for wood”) |
| Time to first pride moment | Immediate free tree | First discovery + first decorated plot within 15–20 min |
| Time to “rich” | Can be minutes via exploits | Hours of play / days of logins |
| Boredom mid-game | Endless meadow, thin goals | Mid-ring landmarks + craft unlocks + friend visits |
| End-game | Cosmetics + World Tree | Titles, full landmark journal, host popular plot, donor flair |

---

## 6.10 Unified progression ladder (proposed after)

Simple ranks players can **see** in the identity / social UI. Soft gates only—never hard-lock walking.

| Rank | How you get there (after) | What you notice |
|------|---------------------------|-----------------|
| Visitor | Finish welcome | Guided first discovery |
| Wanderer | 3 landmarks | Map mid-ring tips; small daily upgrade |
| Planter | 10 trees planted (lifetime) | Free re-equip cosmetics; craft bench recipe flair |
| Settler | Own 1 plot | Plot name on map; visit from friends list |
| Gardener | 5 crafts placed + 10 landmarks | Extra dye unlock / title |
| Host | 3 friends + plot decorated | “Popular garden” soft badge |
| Elder | Far-ring complete or World Tree donor | Plaza recognition / chat badge |

**Before:** no ladder—only raw gold, counts, and cosmetics.  
**After:** same actions, but framed as a readable path.

---

## 6.11 End-to-end “good session” comparison

### Flow — a satisfying 20-minute session

**Before**

```text
Login → claim daily → plant free trees for gold → buy a hat or plot → wander → leave
```

**After**

```text
Login
  → claim daily + see 3 soft quests
  → finish one explore quest (new landmark)
  → water two trees (growth + tiny help budget)
  → cut wild wood, craft a path on your plot
  → wave at a friend / send a region hello
  → optional donate to World Tree
  → leave with rank bar + “next closest landmark” teaser
```

### Table — session quality

| Signal | Before (current) | After (future) |
|--------|------------------|----------------|
| Start | Fast but aimless | Fast with a suggested path |
| Middle | Systems compete for attention | One primary goal + free roam |
| End | Stop when bored | Stop after a clear micro-win |
| Economy feel | Can feel broken or trivial | Feels fair and cozy |
| Social feel | Optional and brittle trust | Optional and trustworthy |
| UI feel | Busy overlays | Clearer goals + less clutter (from UI section) |

---

## 6.12 Mapping: which earlier fixes unlock which “after” gameplay

| After gameplay outcome | Depends on (from earlier parts) |
|------------------------|----------------------------------|
| Fair gold / no printers | P0 economy RPC fixes (costs, landmarks, plants, cuts) |
| Trustworthy multiplayer gardens | P1 proximity + server events + chat integrity |
| Readable goals and ranks | New progression UX (this part) + identity stats fix |
| Comfortable long sessions | P2 UI dock / mobile actions / modals |
| Safe public launch | P0 captcha + P3 headers / moderation |

---

## 6.13 What players should notice after implementation (checklist)

Observable changes—not implementation detail:

- [ ] Free trees no longer print unlimited gold  
- [ ] Discovering places is the main early gold rush, and fake discoveries do nothing  
- [ ] Cutting wild growth only works on real trees/rocks you can see  
- [ ] Craft and rock prices always match the shop card  
- [ ] You must be near something to plant, cut, or claim it  
- [ ] Region chat names match real players  
- [ ] First session suggests a landmark walk  
- [ ] Daily login offers more than a silent +10g  
- [ ] Identity/stats show real exploration progress (not “/ 10” confusion)  
- [ ] Soft rank or title appears after meaningful play  
- [ ] HUD no longer crashes (compass import) and feels less crowded  
- [ ] Mobile players can plant/water/cut without memorizing a keyboard  

---

## 6.14 One-page summary diagram

```text
BEFORE                          AFTER
------                          -----
Open world, weak goals    →     Open world + soft ladder
Gold easy / exploitable   →     Gold earned, sinks meaningful
Wood/stone loosely gated  →     Gather near you, craft with truth
Discover flat +20g        →     Tiered exploration journal
Shop / craft / plots dump →     Unlock in a gentle order
Social optional, forgeable→     Social optional, trusted
Daily = +10g only         →     Daily = package + 3 soft quests
Session ends on boredom   →     Session ends on a micro-win
```

---

*End of Part 6 extension (game mechanics & progression). Still advisory only—no application code was modified in this document update.*

*End of full audit document.*
