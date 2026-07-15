# Full Audit — Status (Meadow / *a shared garden*)

**Date:** 2026-07-15  
**Last updated:** 2026-07-15 — **P2 complete** (soft quests, World Tree UI, Create select→place, craft place fix)  
**Scope:** `src/`, `supabase/schema/` (`01`–`04`)  
**Deploy:** run `01_core.sql` → `02_world.sql` → `03_social.sql` → `04_security.sql` after pull.

---

## At a glance

| Area | Status |
|------|--------|
| Server economy RPCs | Hardened (position clamp, stone rocks, dye whitelist, nearby world, no client broadcast) |
| Offline loop | Discovery + gold + map teleport work |
| Terrain / plots / landmarks | **G1–G3 fixed** |
| Create hub | Select → Place, honest plot copy, craft placement works |
| Soft progression | Walk → plant → water → craft → plot |
| World Tree | Donate UI in **Settings → Progress** (online) |
| Residual risk | Water gold farm, appearance spoof on Realtime, offline localStorage trust |

---

## Security (Part A)

| # | Issue | Status |
|---|--------|--------|
| 1 | Position spoof / proximity bypass | **Fixed** — `update_position` speed clamp; teleport writes `last_pos` |
| 2 | Procedural harvest inventable | **Fixed** — seed counts + 40/day cap |
| 3 | Water gold faucet (+1 / 4s) | **Open** — optional daily cap later |
| 4 | Client `broadcast_chunk_event` | **Fixed** — REVOKE clients |
| 5 | Rock remove gold vs stone | **Fixed** — server +3 stone |
| 6 | `claimOfflineGold` no-op | **Fixed** |
| 7 | Appearance spoof on Realtime | **Open** — resolve from profile/presence |
| 8 | Open SELECT world tables | **Fixed** — `get_nearby_world` only |
| 9 | Anon daily cycling | **Fixed** — 12h account age + Turnstile |
| 10 | `dye_tree` arbitrary colors | **Fixed** — whitelist |
| 11 | Offline localStorage trust | Open by design |
| 12 | Soft rate limits | Residual |

**Files:** `supabase/schema/01_core.sql`, `02_world.sql`, `04_security.sql`, `src/net/Net.jsx`, `src/store.js`

---

## Progression (Part B)

Intended loop:

```
Welcome → First walk → Plant → Water → Craft → Plot
  → Discover (+20g) · Daily · Map teleport · Create · World Tree
```

| # | Issue | Status |
|---|--------|--------|
| B1 | Offline discovery dead | **Fixed** |
| B2 | Rock → stone desync | **Fixed** (+3 stone) |
| B3 | Early gold opaque | **Fixed** (discover offline, earn tip, first-walk tips) |
| B4 | Teleport undiscoverable | **Fixed** (map Guide + Teleport 15g, fog `???`) |
| B5 | No mid-game spine | **Fixed (P2)** — soft ladder after walk |
| B6 | Plot cost honesty | **Fixed (P2)** — “from ~60g”; live cost in PlotCustomizer |
| B7 | Daily bonus messaging | **Fixed** (Settings + calendar day) |
| B8 | Offline gold apply | **Fixed** |
| B9 | Cut tutorial gap | Open (low) |

### Soft quest ladder (P2)

Persisted as `firstWalkQuest` + `softQuest` in localStorage.

| Step | Trigger complete | UI |
|------|------------------|-----|
| 1 Walk | Near Lonely Oak / discover | Guide me |
| 2 Plant | Successful plant | Open Create |
| 3 Water | Successful water (R) | Tip only |
| 4 Craft | Place crafted item | Open Craft |
| 5 Plot | Claim plot | Open Land |

Legacy saves with walk already done and no `softQuest` key → ladder **skipped** (`done`).

**Files:** `src/ui/FirstWalkQuest.jsx`, `src/store.js` (`advanceSoftQuest`, finalize hooks)

### World Tree (P2)

- RPC `donate_to_world_tree` + Net bridge (existing)
- **Settings → Progress** donate amount, presets, shared total
- Chat donor badge after 500 lifetime wood (server)

**Files:** `src/ui/Settings.jsx`, `src/store.js` `donateToWorldTree`

---

## Terrain · water · plots · landmarks

| Pass | Status | Notes |
|------|--------|--------|
| **C1–C4** Terrain perf / height SoT / stream path / uniform SEG | **Fixed** | White lines = mismatched LOD segs → one global SEG + skirts |
| **C5–C6 / G1** Plot pad + remesh + normalize | **Fixed** | `PlotPad`, `plotRev`, plots last in `terrainHeight`, foot lift |
| **G2** Walk surface, props vs water, plaza blend, grass plotRev | **Fixed** | `walkSurfaceHeight` |
| **G3** Landmark Grounded Y, colliders, cull 380u | **Fixed** | `Landmarks.jsx` |
| Water look (foam, shore) | Open polish | Gameplay path shared (`water-path.js`) |

**Key files:** `noise.js`, `Terrain.jsx`, `Plots.jsx`, `plot-utils.js`, `Player.jsx`, `Landmarks.jsx`, `water-path.js`, `Water.jsx`

---

## Create hub · shop UX (Parts E–F)

| # | Issue | Status |
|---|--------|--------|
| E1 | Instant place on card click | **Fixed (P2)** — select; **Place** / Enter / double-click |
| E2 | Misleading prices | **Fixed** rock stone; plot “from ~60g” |
| E3 | Tree dye vs avatar paint copy | **Fixed** (`TREE_DYES` / `AVATAR_COLORS`) |
| E4 | Craft afford feedback | **Fixed** |
| E5 | Shop/Crafting dead re-exports | **Fixed** — Create only (G / Q) |
| E6 | Cosmetics online-only messaging | **Fixed** |
| Craft placement broken | **Fixed (P2)** — `enterPlacement` + `_finalizeCraft` |
| F5 Feedback gaps | Mostly fixed | |
| F1 HUD density | Residual | |
| F3 Touch dye hover | Residual | |

**Files:** `CreateHub.jsx`, `catalog.js`, `catalog_crafting.js`, `store.js`

---

## Backlog (remaining only)

### Still open (low / later)

1. Water gold daily cap / own-trees-only (A3)
2. Appearance identity from server on Realtime (A7)
3. Water material / shore foam polish
4. Cut / forage tutorial (B9)
5. Map mobile size / G3.9 map fog of 3D set pieces (design)
6. Touch selection radius + dye without hover

### Done this program (do not re-open)

Security 1–2, 4–6, 8–10 · offline discovery · rock stone · claim offline gold · map teleport + fog · daily messaging · dye catalogs · Create rename · G1–G3 · soft quest ladder · World Tree donate UI · Create select→place · craft place · plot price copy

---

## File map

| Concern | Primary files |
|---------|----------------|
| Position / daily / world tree | `01_core.sql` |
| Plant / rock / craft / plot / water | `02_world.sql` |
| Grants / REVOKE / nearby world | `04_security.sql` |
| Net + RPCs | `src/net/Net.jsx`, `bridge.js` |
| Economy / quests / placement | `src/store.js` |
| Create UI | `src/ui/CreateHub.jsx` |
| Soft coach | `src/ui/FirstWalkQuest.jsx` |
| Settings / donate / daily | `src/ui/Settings.jsx` |
| Map | `src/ui/WorldMap.jsx` |
| Terrain height | `src/world/noise.js` |
| Plots | `src/world/Plots.jsx`, `plot-utils.js` |
| Catalogs | `src/catalog.js`, `catalog_crafting.js` |

---

## Deploy checklist

1. Apply `supabase/schema/01_core.sql`  
2. Apply `supabase/schema/02_world.sql`  
3. Apply `supabase/schema/03_social.sql`  
4. Apply `supabase/schema/04_security.sql`  
5. Ship client (`Net.jsx` / `store.js` must match RPC API)  
6. Production: Turnstile site key + Email provider if using email OTP  

---

## Bottom line

Critical security and loop breakers are closed. Render G1–G3 are fixed. **P2 progression & clarity** is in: soft quest ladder, World Tree donate, Create select-then-place, working craft placement, honest plot pricing copy.

**Optional next:** water gold cap, Realtime appearance trust, visual water polish.
