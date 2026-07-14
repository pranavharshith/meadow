# Full Audit — Vulnerabilities · Bad UI · Terrain / Water / Shop · Progression Loops

**Project:** *a shared garden* (Meadow)  
**Date:** 2026-07-15  
**Last updated:** 2026-07-15 — … + **E5, E6, F5** (Create naming, offline style, feedback)  
**Scope:** Live source under `src/`, modular schema under `supabase/schema/` (`01`–`04`), styles, catalogs.  
**Related:** `.agents/security-and-ui-audit.md` (earlier session).  

**Re-apply schema after pull:** run `01_core.sql` → `02_world.sql` → `03_social.sql` → `04_security.sql` in Supabase SQL editor.

---

## Fix status (this session)

| # | Issue | Status | Where |
|---|--------|--------|--------|
| **1** | Position spoof / proximity bypass | **Fixed** | `01_core.sql` `update_position` speed clamp; `teleport_to_landmark` sets `last_pos` |
| **2** | Procedural harvest inventable | **Fixed** | Seed-based `procedural_chunk_count` + index bounds + **40/day** cap; `proc_cuts_day*` columns |
| **3** | Water gold faucet | Open | Still +1 gold / 4s |
| **4** | Client `broadcast_chunk_event` | **Fixed** | `04_security.sql` REVOKE from clients |
| **5** | Rock remove gold vs stone | **Fixed** | Server +3 **stone**; bridge/store reconcile; offline remove animation |
| **6** | `claimOfflineGold` no-op | **Fixed** (bonus) | `store.js` adds `res.gold` to balance |
| **7** | Appearance spoof on Realtime | Open | |
| **8** | Open SELECT world tables | **Fixed** | `get_nearby_world` RPC; REVOKE client SELECT; `Net.jsx` uses RPC |
| **9** | Anon identity cycling (daily) | **Fixed** | Daily bonus requires account age ≥ **12h**; Turnstile already prod-required |
| **10** | `dye_tree` arbitrary colors | **Fixed** | Whitelist only; `unknown color` exception |
| 11–12 | Offline trust / soft rate limits | Open (by design / residual) | |

---

## Executive summary

| Area | Health | Headline |
|------|--------|----------|
| **Server economy RPCs** | Stronger | Position clamp, scoped world read, stone-aligned rock remove, dye whitelist |
| **Trust model** | Hardened | Speed-capped `update_position`; teleports update server pos; no client broadcast forge |
| **Offline progression** | **Restored** | Offline discovery + gold + map teleport work |
| **Resource loop** | **Aligned** | Rock remove → **+3 stone** client + server |
| **Terrain / water** | Playable but janky | Unchanged this pass |
| **Create hub / shop** | Usable but rough | Unchanged this pass |
| **Long-term goals** | Hollow | Unchanged this pass |

---

# Part A — Security & integrity

## A1. Critical / high

### 1. Client-trusted position spoofs all proximity gates — **FIXED**

**Was:** Arbitrary `update_position` → all `require_near` checks pass anywhere.

**Fix:**
- `update_position` rejects jumps faster than ~16 u/s while last pos is fresh (&lt;15s), with a 24u floor for jitter.
- First fix / stale (&gt;15s) reconnect may snap (intentional).
- `teleport_to_landmark` writes landmark coords into `last_pos_*` so the client can arrive without “move too fast”.

**Residual:** Long-idle snap after 15s can still jump; further harden with signed ticks if needed.

---

### 2. Procedural harvest inventable — **FIXED**

**Was:** Any index 0–16 per chunk awarded wood/stone.

**Fix:**
- `procedural_chunk_count(chunk_key, type)` mirrors client mulberry seed (`TreesField` / `Rocks.jsx`) → max n 3–5 trees / 2–5 rocks.
- Reject `idx >= n` as `invalid resource`.
- Per-player **40 procedural cuts/day** (`proc_cuts_day` / `proc_cuts_day_date` on `players`).

**Residual:** Rock indices that the client *skipped* via `clusterField` may still be cut if index &lt; n (smaller surface than before). Full sim of clusterField on server would close that.

---

### 3. Watering is still a gold faucet — **OPEN**

**Where:** `water_tree` → `gold + 1` every 4s.

**Improve:** Daily water-gold cap, own-trees-only, or growth-only rewards.

---

### 4. `broadcast_chunk_event` executable by clients — **FIXED**

**Fix:** `REVOKE ALL` on `broadcast_chunk_event` from `public` / `anon` / `authenticated`. Only other SECURITY DEFINER RPCs invoke it.

---

### 5. Rock remove client vs server desync — **FIXED**

**Was:** Client +3 stone; server +2 gold; bridge returned `gold`.

**Fix:**
- Server `remove_rock` awards **+3 stone**, returns new stone total.
- Bridge: `{ ok, stone }`.
- Store reconciles stone; reverts on failure; offline path completes break animation.

---

### 6. `claimOfflineGold` does not apply gold — **FIXED** (bonus)

**Fix:** `set(gold + res.gold)` when claim succeeds.

---

## A2. Medium

### 7. Appearance / chat identity spoof on Realtime — **OPEN**

Position payloads still carry client-chosen name/color/hats.

**Improve:** Resolve display from `get_player_profile` / server presence metadata.

---

### 8. Open SELECT on world tables — **FIXED**

**Was:** `SELECT using (true)` on trees/rocks/plots/crafted/cuts → full-world dump.

**Fix:**
- New `get_nearby_world(p_cx, p_cz)` SECURITY DEFINER RPC (3×3 chunks, player must be near window).
- Client `Net.jsx` `loadChunksAround` uses RPC only.
- `04_security.sql`: drop open SELECT policies; `REVOKE SELECT` on entity tables from clients.
- `world_tree` / donors remain publicly readable (collaborative goal).

---

### 9. Anonymous identity cycling — **FIXED** (partial / practical)

**Was:** New anon accounts claim daily +10 immediately.

**Fix:**
- `claim_daily_bonus` requires `created_at` ≥ **12 hours** ago (`account too new for daily bonus`).
- Client toasts: “daily bonus unlocks after 12 hours online”.
- Turnstile already required in production (`captcha.js`).

**Residual:** Multi-account landmark gold still possible; captcha + delay raise cost.

---

### 10. `dye_tree` accepts arbitrary hex — **FIXED**

**Fix:** Catalog whitelist only (same hexes as `DYE_ITEMS`). Unknown → `unknown color`. No more `else 500` catch-all apply.

---

### 11. Offline localStorage is fully client-owned — OPEN (by design)

---

### 12. Rate limits are soft — OPEN (residual)

Procedural daily cap helps; water gold still soft-farmable.

---

## A3. Low / hygiene

- Profanity lists easily bypassed (leetspeak).
- `admin_set_ban` depends on JWT `app_metadata.role`.
- Presence counts can be inflated with multi-tab.

---

# Part B — Progression loop: where it breaks

Intended soft loop (inferred from code):

```
Welcome → First walk (Lonely Oak) → Discover landmarks (+20g)
  → Earn gold (discover / water / daily / plant paid)
  → Shop: better trees, rocks, dyes, hats
  → Cut trees → wood · break rocks → stone → Craft
  → Claim plot → decorate
  → Teleport / set spawn / world chat / world tree / social
```

## B1. Hard break — offline discovery is disabled — **FIXED** (with B3)

Offline `discoverLandmark` now awards local gold + `discovered[]`; online still RPCs and reconciles. First walk, map unlocks, and teleport work offline.

---

## B2. Hard break — rock → stone craft chain (online) — **FIXED**

Was: client +3 stone / server +2 gold.  
Now: both award **+3 stone**; craft material loop can refill online.  
(Server `remove_rock`, bridge, store reconcile — verified 2026-07-15.)

---

## B3. Soft break — gold economy after free plant nerf — **FIXED**

**Was:** Offline discovery dead; early gold opaque; free plant no longer prints gold.

**Fix (2026-07-15):**
- **Offline discovery works** — `discoverLandmark` awards local +20g and fills `discovered[]` offline; online still reconciles with server.
- **First-walk follow-up tip** — after quest complete: map / discover / free oaks.
- **Create hub earn tip** when gold &lt; 15 (places, water, daily, forage).
- Daily claim path remains +10 with clear Settings CTA (B7).

**Residual:** Water still +1 gold (optional future daily cap). Landmark gold still finite by design.

---

## B4. Soft break — teleport is undiscoverable — **FIXED**

**Was:** Teleport only on NavIndicator; map had no teleport; fog names leaked.

**Fix:**
- World map **Guide** + **Teleport (15g)** per landmark row.
- Canvas labels fogged as `???` until discovered; list shows “Unexplored place”.
- Header: places found · gold; shared `TELEPORT_GOLD_COST`.
- Offline discovery (B3) unlocks teleport offline after walking near places.

---

## B5. Soft break — no mid/late game spine

After first walk (`FirstWalkQuest`):

- No quest 2/3 (plant 3 trees, craft a bench, claim land).
- **World Tree** donation exists in store/Net/chat badge — **no Create/Social/HUD donate UI**.
- Exotic trees 500/1000g with no earn-path communication.

**Loop falls off at:** *“I walked to a tree, now what?”*

**Improve:** 3–5 soft milestones; surface World Tree; “next unlock” in Create hub.

---

## B6. Soft break — plot cost story

- Catalog `PLOT_ITEM.cost = 60` (“Starts at 60g”).
- Offline finalize uses area formulas (circle `π w² * 0.8`, etc.).
- Server `buy_custom_plot` has its own pricing.

Players see 60g, place large plot, pay much more or get rejected → trust break.

**Improve:** Live price in PlotCustomizer + Create hub footer always.

---

## B7. Soft break — daily bonus messaging — **FIXED**

**Was:** Silent already-claimed online; offline used 24h playtime.

**Fix:**
- Offline uses **calendar day** (UTC date string) like online.
- Manual claim from **Settings → Progress** always explains outcome (`forceToast`).
- Auto-claim on connect is `quiet: true` (only celebrates real claim).
- Messages: claimed / already claimed · come back tomorrow / account too new (12h).
- Settings shows places found, gold, claim button state.

---

## B8. claimOfflineGold no-op — **FIXED**

Wallet now increments by claimed amount when server returns pending gold.  
(Verified still correct after B2–B7 work.)

---

## B9. Selection / cut tutorial gap

Cut requires click-select then X. Hint mentions it once; mobile Cut disabled until selection. No outline education for procedural harvest vs owned trees.

**Improve:** First owned tree prompt; explicit “forage” for world trees.

---

## Progression break map

```
[Welcome] ──ok──► [First walk]
                      │
          offline + online discover +20g
                      │
                      ▼
              map Guide + Teleport
                      │
                      ▼
              [Earn / Shop / Craft]
                 rock→stone aligned
                 daily claim in Settings
                      │
                      ▼
              [Plot / Exotic / Social]
                      │
                      ▼
              residual: no quest ladder (B5)
```

---

# Part C — Terrain system

## C1. Performance & hitching — **FIXED**

- Plot list cached via `syncTerrainPlots` (no `useStore` per height sample).
- Chunk remesh uses `plotSignatureForChunk` — only plots that touch a chunk force rebuild.
- Footstep deform no longer mutates meshes / `computeVertexNormals` (see C2).

---

## C2. Height source of truth split — **FIXED**

Single authority: `terrainHeight()` (noise + plaza + plots + ponds + **stream corridor**).  
Mesh footstep dents removed; water walk still gets ripples via `deformTerrain` → `addRipple`.

---

## C3. Stream vs ponds — **FIXED**

- Shared path in `water-path.js` (Catmull-Rom samples).
- Terrain carves stream bed (`STREAM_BED_DEPTH` + blend).
- Water ribbon / `isOverWater` / placement all use the same samples.

---

## C4. Chunk / LOD — **FIXED**

- Ring LOD: near 40 / mid 26 / far 16 segments.
- Scales further with grass density (`half` / `off` lower SEG).

---

## C5. Plot flatten side effects — **FIXED**

- Softer 8u plot blend.
- Trees/Rocks/Grass regen when `plotSignatureForChunk` changes for that chunk.

---

## C6. Spawn plaza — **FIXED**

- `PLAZA_GRASS_CLEAR_R` (15.6) clears grass past stone; terrain flat R = 15; plaza outer walk = 14.5 (aligned stack).

---

# Part D — Water system

## D1. Visual quality

- Single blue `MeshStandardMaterial`, opacity 0.55, DoubleSide — plastic disc, not pond.
- No depth fade, foam, shore wetness, or reflection; fights golden-hour lighting.

## D2. Collision / gameplay mismatch — **FIXED** (with C3)

Shared `isOverWater` / `STREAM_SAMPLE_POINTS` in `water-path.js` for Player, placement, and mesh.

## D3. Pond disks

- Y = center height + 0.35 while basin is center − 0.45 → mid-air or dry rings if radius/carve disagree.
- Hard circular edge, no soft shore.

## D4. Ripples

- Clever vertex ripples via `onBeforeCompile` (fragile across Three versions).
- Can look wrong if tab is backgrounded.

## D5. Gameplay clarity

- Watering is **R near sapling**, not “stand in water”. UI never explains the difference. Water is mostly scenery, so visual bugs hurt more.

---

# Part E — Shop / Create hub / economy UI

## E1. Instant commit on card click

`CreateHub` click → `activateItem` → close modal → `enterPlacement()` 10ms later.

**Problems:**
- No “browse without committing”.
- Mis-tap on mobile starts expensive exotic placement.
- Select vs confirm collapsed into one gesture.

**Improve:** First click = select; footer “Place” / Enter; optional double-click shortcut.

---

## E2. Misleading prices

| Item | Shown | Actual |
|------|-------|--------|
| Plot | 60g | Area-based server/offline formula |
| Free tree | free | OK; watering gold still farmable |
| Rock remove | UI “+stone” | Server “+gold” |

---

## E3. Dual “dye” systems — **FIXED**

- `TREE_DYES` — leaf/canopy copy (ActionPill).
- `AVATAR_COLORS` — cloth/paint copy (Create → Style).
- Same hex/costs (server whitelist); `DYE_ITEMS` alias kept for compat.
- Style tab note: paints ≠ tree dyes.

---

## E4. Craft tab UX — **FIXED**

- Toast when materials short (`need N more wood…`).
- Craft footer preview with icon + have/need cost highlighting.
- Hint line about harvesting wood/stone.

---

## E5. Dead re-exports — **FIXED**

- Removed `Shop.jsx` / `Crafting.jsx` re-exports.
- Single name: **Create** (`CreateHub.jsx`); **G** nature · **Q** craft.
- Dropped legacy `shopOpen` / `craftingOpen` store flags.
- README + Hud aligned.

---

## E6. Cosmetics online-only — **FIXED**

- Style tab offline: banner + cards locked (`online` badge).
- Free **No Hat** still works offline; paid items toast with clear copy.
- Free pastels remain in profile (name button).

---

## E7. Expensive items without earn path

Star Tree 1000g / Crown 500g with no “how to earn” panel. Shop becomes a wall after landmark gold is spent.

---

# Part F — UI / UX problems (general)

## F1. Layout density & stacking

Layers fighting the same vertical band:

1. Top bar (title, name, social, resources, status, minimap, compass)
2. First-walk quest pill
3. Toasts
4. Placement banner + plot customizer
5. Action pill (cut/dye)
6. Place label
7. Hint strip
8. Desktop controls **or** mobile bar
9. Chat
10. Nav indicator (teleport)

On ≤720px, mobile bar + chat + quest + toast is cluttered.

**Improve:** Single coach stack (one card at a time); hide hint when first-walk active.

---

## F2. World map

- Fixed **520px** canvas — awkward on phones.
- **Undiscovered landmarks still show full names** — spoils exploration.
- No teleport, no set-spawn, no coords.
- Alt-click waypoint is undiscoverable power-user only.

**Improve:** Fog names until discovered; smaller map; Teleport CTA.

---

## F3. Mobile

- ActionPill dye swatches rely on **hover** — no hover on touch.
- Cut disabled until selection; 3D tap precision is hard.
- Joystick + mobile bar + chat focus fight.

**Improve:** Larger selection radius on touch; dye long-press; “nearest owned” soft select.

---

## F4. Accessibility residual

Progress made (Modal, focus trap, tokens, aria). Remaining:

- Dye swatches lack names for screen readers.
- Minimap is visual-only.
- Odd `role="listitem"` on buttons in map list.

---

## F5. Feedback gaps — **FIXED**

| Action | Status |
|--------|--------|
| Can’t afford craft | Toast + footer (E4) |
| Discover offline | Works + toast (B3) |
| Daily already claimed | Settings forceToast (B7) |
| Placement invalid | Stronger banner, shake, toast on bad Place/E; first-walk hides while placing |

---

## F6. Settings / identity scatter

- Set spawn (−40g) buried in Identity.
- No “Progress” panel (discovered count, trees planted, next goal).

---

## F7. Chat & social

- World Tree donor badge in chat with **no way to donate in UI**.
- Friend search by exact name — easy to fail silently.

---

## F8. Microcopy / hotkey drift

Hints: `G create · Q craft` — good. Older docs may still say Shop. Plant label “Place craft” is vague.

---

# Part G — System-specific player-facing issues

## Terrain

- Chunk pop-in when running.
- Plot claim flattens land; existing trees may look wrong.
- Steep slopes still placeable if slope probe is generous (`SLOPE_LIMIT` 1.8).

## Water

- Walking on river or dry footsteps in water visuals.
- Stream between Silver Brook and Crystal Pond is the weak visual link.

## Shop

- Create hub closes before ghost appears — can’t compare catalog to world.
- Prefer side drawer on desktop while placement is active.

## Selection / ActionPill

- Overgrown “Release” vs “Cut” is good; ensure X always matches.
- Non-owner young trees: select may clear with little explanation.

---

# Part H — Prioritized improvement backlog

## P0 — Fix loop breakers

1. ~~Offline landmark discovery~~ **done** (B1/B3).
2. ~~Unify rock remove reward~~ **done** (B2).
3. ~~Fix `claimOfflineGold`~~ **done** (B8).
4. ~~Revoke client `broadcast_chunk_event`~~ **done**.
5. **Show live plot price**; don’t advertise flat 60g as full cost — still open.
6. ~~Map teleport CTA~~ **done** (B4).
7. ~~Daily bonus messaging~~ **done** (B7).

## P1 — Security hardening

6. ~~Anti-teleport on `update_position`~~ **done** (residual: 15s snap).
7. ~~Procedural resource validation / daily cap~~ **done**.
8. Water gold daily cap / own-trees-only — still open.
9. ~~Region-scoped world reads~~ **done** (`get_nearby_world`).

## P2 — Progression & clarity

10. Second/third soft quests (plant, water, craft, claim plot).
11. World map: fog names + Teleport button.
12. Surface World Tree donate UI.
13. Create hub: select vs place; affordance toasts.
14. Split avatar colors vs tree dyes catalogs.

## P3 — Terrain / water / juice

15. Carve stream corridor; sync collision to curve.
16. Water material pass (shore foam, less plastic).
17. Plot remesh only affected chunks; cheaper `terrainHeight` plots.
18. Throttle / fade terrain deform.
19. Touch selection + dye without hover.

## P4 — Polish

20. Progress panel (discovered N/25, wood goals).
21. Daily bonus “already claimed” toast.
22. Rename Shop/Crafting leftovers to Create everywhere.
23. Map responsive sizing; reduce HUD stack conflicts.

---

# Part I — File reference

| Concern | Primary files |
|---------|----------------|
| Offline discovery break | `src/store.js` `discoverLandmark` |
| Rock reward desync | `src/store.js` `cutSelection`, `src/net/Net.jsx` `removeRock`, `02_world.sql` `remove_rock` |
| Offline gold claim | `src/store.js` `claimOfflineGold` |
| Position trust | `01_core.sql` `update_position` / `require_near` |
| Procedural farm | `02_world.sql` `cut_procedural_resource` |
| Water gold | `02_world.sql` `water_tree` |
| Broadcast forge | `02_world.sql` `broadcast_chunk_event`, `04_security.sql` grants |
| Terrain height / plots | `src/world/noise.js`, `Terrain.jsx`, `deform.js` |
| Water path / stream | `src/world/water-path.js`, `Water.jsx` |
| Tree vs avatar dyes | `src/catalog.js` `TREE_DYES` / `AVATAR_COLORS` |
| Placement validity | `src/world/PlacementPreview.jsx` |
| Create / shop UX | `src/ui/CreateHub.jsx`, `catalog.js`, `catalog_crafting.js` |
| First walk | `src/ui/FirstWalkQuest.jsx`, `store.js` welcome |
| Teleport UX | `src/ui/NavIndicator.jsx`, `WorldMap.jsx` (missing CTA) |
| HUD density | `src/ui/Hud.jsx`, `MobileActionBar.jsx`, `styles.css` |
| Discovery trigger | `src/world/Landmarks.jsx` |

---

# Part J — What’s in good shape

- Modular schema + server catalogs for plant/rock/craft/dye costs.
- Landmark whitelist + discover proximity on server.
- Create hub unification better than split shop/craft.
- Design tokens, Modal, focus trap, mobile bar.
- Free plant gold printer on shape 0 closed.
- First-walk quest is the right *idea* (blocked by offline discovery).
- Optimistic store + bridge pattern is sound if reconcile bugs are fixed.

---

## Bottom line

**This session closed** security items **1, 2, 4, 5, 8, 9, 10** (and offline-gold apply). Re-run modular schema `01`→`04` on Supabase to deploy.

**Still open for later:**
1. Soft quest ladder after first walk (B5)
2. Live plot price honesty (catalog 60g vs area cost)
3. Water gold farm, appearance spoof, terrain/water polish (Parts C–F)

---

## Deploy checklist

1. Apply `supabase/schema/01_core.sql`
2. Apply `supabase/schema/02_world.sql`
3. Apply `supabase/schema/03_social.sql`
4. Apply `supabase/schema/04_security.sql`
5. Ship client with updated `Net.jsx` / `store.js` (must match RPC API)

---

*End of audit. Updated after implementing critical fixes 1, 2, 4, 5, 8, 9, 10.*
