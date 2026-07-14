# Build Prompt: *a shared garden* (Meadow)

Use this document as a **complete build specification**. Recreate the full game described below from scratch: a warm, golden-hour 3D multiplayer social gardening experience. Do not invent a different genre, aesthetic, or economy model unless a section explicitly allows variation. Prefer **procedural geometry** over external 3D assets. The game must run **fully offline** without API keys, and optionally go multiplayer when Supabase is configured.

---

## 1. Product vision

**Title:** `a shared garden`  
**Package name:** `meadow`  
**Tone:** calm, cozy, pastoral, golden hour — not dark, not combat-heavy, not competitive PvP.

**One-line pitch:** Wander a procedurally generated endless meadow, plant trees, place rocks, water saplings, discover landmarks, claim personal plots, craft decorations, and meet other players in a shared multiplayer garden.

**Core fantasy:**
- You are a gentle gardener/wanderer in a soft, endless landscape.
- Actions are small and social: plant, water, cut, chat, wave, sit, discover places.
- Progress is soft economy (gold / wood / stone), not levels or combat.
- Online play is a “shared garden layer” on top of a solid offline single-player experience.

**Non-goals:**
- No combat, enemies, or death.
- No jump/platforming skill tree.
- No heavy UI chrome or sci-fi HUD.
- No mandatory account for offline play.

---

## 2. Tech stack (exact)

| Layer | Choice |
|---|---|
| Framework | React 18 + Vite 5 (ESM) |
| 3D | Three.js `0.169`, `@react-three/fiber` `8.17`, `@react-three/drei` `9.114`, `@react-three/postprocessing` `2.16` |
| State | Zustand `^4.5` |
| Backend (optional) | Supabase (Auth anonymous + optional email OTP, PostgreSQL, Realtime channels, SECURITY DEFINER RPCs) |
| Monitoring (optional) | `@sentry/react` |
| Audio | WebAudio API only (procedural wind + chimes; no required audio asset pack) |
| Styling | Single global `styles.css` (glass-pill HUD, no CSS-in-JS framework) |

**Scripts:**
```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

**Environment variables** (all optional — offline without them):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile (gate anonymous sign-in abuse) |
| `VITE_SENTRY_DSN` | Error monitoring |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Trace sample rate |

---

## 3. Architecture principles

### 3.1 Dual state model

1. **High-frequency mutable singletons** (`player-state.js`) — **outside React**:
   - Player position, avatar yaw, emote, moving flag
   - Camera look (yaw, pitch, zoom)
   - Keyboard map (`keys[e.code]`)
   - Placement ghost state (`placement.x/z/yaw/valid/reason`)
   - Collision registries: trees, rocks, crafted items near player
   - Terrain deformation maps, water ripples
   - Current place name

   Updated every frame via `useFrame`. **Never** put these in Zustand — that would re-render the entire UI at 60 Hz.

2. **Persistent / UI game state** (Zustand `store.js`):
   - Gold, wood, stone, name, avatar colors, hats
   - Planted trees, placed rocks, plots, crafted items
   - Discovered landmarks, settings, UI open flags
   - Chat log, selection, placement mode, networking status
   - Debounced `localStorage` save (`meadow-save-v1`)

### 3.2 Offline-first network bridge

`src/net/bridge.js` exports a **mutable bridge object** with offline no-ops by default:

```js
bridge.online = false
bridge.plant = async () => ({ ok: false, error: 'offline' })
// ... every server mutation
```

When Supabase is configured, `<Net/>` replaces bridge methods with real RPC wrappers. The Zustand store always:
1. Applies **optimistic** local updates for snappy HUD feedback
2. Calls `bridge.*`
3. On success, reconciles authoritative gold/wood/stone
4. On failure, rolls back and shows a toast

### 3.3 Security model (online)

- Tables: SELECT open (or scoped), **direct INSERT/UPDATE/DELETE revoked** from `anon`/`authenticated`
- All mutations via **PostgreSQL `SECURITY DEFINER` RPCs** with:
  - `auth.uid()` checks
  - Token-bucket rate limits
  - Cooldowns, gold costs, spacing, ownership
- Chat: server-sanitized; world chat emitted via `realtime.send()` so clients cannot forge global messages

### 3.4 World streaming

- **Render chunks:** 100×100 units; player always keeps a **3×3** window of terrain/grass/trees/rocks
- **Network regions:** 120×120 units for chat/presence; hysteresis of 20 units before region switch
- Optional **shards** per region for position traffic (design for `SHARDS_PER_REGION`, default can be 1)
- Separate channels:
  - `region:rx:rz:s{shard}` — presence, positions, entity broadcasts
  - `region-chat:rx:rz` — region chat + headcount
  - `world` / world chat — global paid chat
  - Chunk channels for streamed world objects as needed

---

## 4. Target file structure

```
/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── README.md
├── supabase/
│   ├── schema.sql              # full idempotent schema + RPCs
│   └── migrations/             # incremental (crafting, friends, shop, auth fixes)
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── styles.css
    ├── store.js
    ├── player-state.js
    ├── catalog.js
    ├── catalog_crafting.js
    ├── Controls.jsx
    ├── Ambience.jsx
    ├── wind.js
    ├── monitoring/
    │   └── sentry.jsx
    ├── net/
    │   ├── supabase.js
    │   ├── bridge.js
    │   ├── Net.jsx
    │   ├── state.js
    │   ├── region.js
    │   ├── moderation.js
    │   └── captcha.js
    ├── world/
    │   ├── Environment.jsx
    │   ├── Terrain.jsx
    │   ├── GrassField.jsx
    │   ├── TreesField.jsx
    │   ├── Rocks.jsx
    │   ├── PlacedRocks.jsx
    │   ├── Plots.jsx
    │   ├── CraftedItems.jsx
    │   ├── PlacementPreview.jsx
    │   ├── Water.jsx
    │   ├── WaterEffect.jsx
    │   ├── Weather.jsx
    │   ├── Landmarks.jsx
    │   ├── SpawnPlaza.jsx
    │   ├── Player.jsx
    │   ├── AvatarMesh.jsx
    │   ├── RemotePlayers.jsx
    │   ├── CameraRig.jsx
    │   ├── NavPath.jsx
    │   ├── Birds.jsx
    │   ├── Butterflies.jsx
    │   ├── Fireflies.jsx
    │   ├── Petals.jsx
    │   ├── Effects.jsx
    │   ├── WindClock.jsx
    │   ├── ProceduralTree.js
    │   ├── tree-assets.js
    │   ├── rock-assets.js
    │   ├── mossy-material.js
    │   ├── noise.js
    │   ├── chunk.js
    │   ├── deform.js
    │   └── places.js
    └── ui/
        ├── Hud.jsx
        ├── WelcomeScreen.jsx
        ├── Shop.jsx
        ├── Crafting.jsx
        ├── Chat.jsx
        ├── Minimap.jsx
        ├── WorldMap.jsx
        ├── Identity.jsx
        ├── Social.jsx
        ├── Settings.jsx
        ├── Compass.jsx
        ├── NavIndicator.jsx
        ├── PlacementBanner.jsx
        ├── PlotCustomizer.jsx
        ├── ActionPill.jsx
        ├── PlaceLabel.jsx
        ├── Toast.jsx
        ├── Status.jsx
        ├── Screenshot.jsx
        └── TouchJoystick.jsx
```

---

## 5. Visual & audio direction

### 5.1 Look

- **Golden hour forever:** sun ~7° elevation, azimuth ~165°
- Sky via `@react-three/drei` `Sky` (turbidity ~9, rayleigh ~2.2)
- Hemisphere light warm sky / green ground; warm directional sun with soft shadows
- Fog color `#e7d8b8`, near ~90 / far ~320 (push farther in top-down map view)
- ACES Filmic tone mapping, exposure ~1.05
- Soft **bloom** + **vignette** + warm gold **outline** on selected objects
- Loading fade: full-screen warm haze `#e7d8b8` that fades when assets ready

### 5.2 Avatar

Low-poly soft character:
- Sphere head, cylinder body, pelvis sphere, jointed limbs (cylinders hinged at joints)
- Eyes with small pupils
- Optional hats: wizard cone, top hat + brim, gold crown
- Per-part colors: head / body / legs (or single fallback color)
- Animations: walk cycle, run, idle breathing, sit/kneel, wave (timed ~1.6s)

### 5.3 World palette

- Rolling green-gold hills, mossy rocks, soft water ponds, meandering stream
- Instanced grass blades + flowers, wind-swayed via shared wind uniforms
- Fireflies (toggleable), butterflies, birds, cherry-blossom petals
- Weather: soft clouds, occasional rain that can dampen ambience feel

### 5.4 Audio

Procedural WebAudio:
- Brown-ish noise wind bed through LFO-modulated lowpass
- Occasional pentatonic sine chimes (e.g. C5–A5)
- Starts on first user gesture; respects mute toggle
- Optional tiny SFX (e.g. teleport plop) if present; never hard-require a large asset pack

### 5.5 UI chrome

- Fixed overlay HUD, `pointer-events: none` on root; interactive bits use `.no-look` and `pointer-events: auto`
- Glass-dark pills: `rgba(24, 28, 22, 0.32)`, blur, white borders, soft shadows
- Title: small uppercase tracked letters “a shared garden”
- Toast notifications ~2.7s
- Mobile: dual-zone touch joystick + look zone; auto-enable when `maxTouchPoints > 0`

---

## 6. Controls

| Input | Action |
|---|---|
| WASD / Arrows (rebindable) | Walk |
| Shift | Run |
| Drag / pointer lock on canvas | Look |
| Mouse wheel | Zoom (third person) |
| **E** | Enter placement / confirm placement |
| **R** | Water nearest young sapling |
| **X** | Cut/break currently selected owned tree or rock |
| **G** | Toggle Nature Shop |
| **Q** | Toggle Crafting |
| **V** | Cycle camera: third → first → top (drone used during plot placement) |
| **C** | Sit / stand |
| **F** | Wave |
| **M** | Toggle world map |
| **Esc** | Cancel placement / deselect / exit pointer lock |
| **Enter** | Focus chat |
| Click tree/rock (owned) | Select for cut / dye / release |
| Click empty world | Clear selection |

**Input contexts:** `GAME` | `UI` | `CHAT` — block movement/hotkeys appropriately when shop/map/chat open.

**Movement constants:**
- Walk speed ~4.2, run ~9
- Soft collision push-out vs tree trunks, rocks, spawn obelisk
- Snap Y to terrain height or plaza floor height
- Footstep terrain deformation (subtle) + water ripples when over water

---

## 7. Economy & progression constants

| Constant | Value | Notes |
|---|---|---|
| Tree grow time | **90 seconds** | Sapling → mature |
| Water cooldown | 4s client pre-check | Server also enforces |
| Water growth boost | 18s worth of growth | Subtract from `plantedAt` |
| Water reward | +1 gold | |
| Plant reward | +5 gold | Even free trees give +5 online — document carefully |
| Cut mature tree | +8 wood | |
| Cut sapling | +2 wood | |
| Cut range | ~4 world units | Selection-based primarily |
| Rock remove reward | +3 stone | |
| Procedural tree cut | +3 wood | |
| Procedural rock cut | +2 stone | Cuts expire ~60 min (regrow) |
| Landmark discover | +20 gold | One-time per landmark id |
| Daily bonus | +10 gold | Server date / offline playtime |
| World chat cost | **3 gold** | |
| Teleport cost | **15 gold** | Must have discovered landmark |
| Set custom spawn | **40 gold** | |
| Plot claim | Area-based / ~60g+ | Max 5 plots, max ~1600 m² total area |
| Free tree plant | Broadleaf shape 0 cost 0 | |
| Pine / bushy | 5 gold | |
| Cherry blossom | 50 | |
| Willow | 75 | |
| Mushroom | 100 | |
| Golden tree | 500 | Exotic |
| Star tree | 1000 | Exotic |
| Rocks | 5–8 gold | Round / boulder / standing |
| Tree dyes | 50–200 gold | Permanent leaf recolor when mature |
| Hats | 0 / 150 / 200 / 500 | none / wizard / tophat / crown |

**Resources:**
- **Gold** — primary currency (discover, plant rewards, daily, sinks)
- **Wood** — from cutting trees / procedural harvest; used in crafting
- **Stone** — from rocks / procedural harvest; used in crafting

**Crafting catalog:**
| Item | Wood | Stone |
|---|---|---|
| Wooden Fence | 2 | 0 |
| Wooden Bench | 5 | 0 |
| Stone Lantern | 0 | 5 |
| Stone Path | 0 | 1 |
| Wooden Sign | 3 | 0 |

---

## 8. Catalogs (shop items)

### Trees (`TREE_ITEMS` + `EXOTIC_TREE_ITEMS`)

| id | name | shape | cost | notes |
|---|---|---|---|---|
| broadleaf | Broadleaf Oak | 0 | 0 | Classic rounded canopy |
| pine | Pine | 1 | 5 | Tall conifer |
| bushy | Bushy Shrub | 2 | 5 | Low dense |
| willow | Weeping Willow | 3 | 75 | Drooping boughs |
| cherry_blossom | Cherry Blossom | 4 | 50 | Pink petals effect |
| mushroom | Bioluminescent Mushroom | 5 | 100 | Soft glow |
| golden_tree | Golden Tree | 10 | 500 | Metallic gold leaves |
| star_tree | Star Tree | 11 | 1000 | Celestial glow |

### Rocks
| id | rockShape | cost |
|---|---|---|
| round | 2 | 5 |
| boulder | 0 | 8 |
| standing | 1 | 8 |

### Dyes (leaf color hexes + costs 50–200)
Autumn, Sunset, Golden, Sky, Lavender, Blush, Teal, Moonlight, Onyx, Emerald.

### Personal plot item
Type `plot`, starts ~60g, custom shape (circle vs rectangle) and width/depth via plot customizer UI while in drone placement mode.

### Avatar palette pastels
`#e79aa0`, `#8fb7e8`, `#a9d98a`, `#efd694`, `#c8a2e0`, `#7fd8c0`, `#f0a875`

---

## 9. World systems (detailed)

### 9.1 Noise & terrain

- Deterministic **value noise** + 4-octave fractal for height (~±7.5 units scale)
- `terrainHeight(x,z)` used for **mesh displacement AND all prop placement** so everything sits on the surface
- Flatten a **crater** around origin for Spawn Plaza (radius ~15, blend width ~10)
- Flatten known **pond** basins to flat water surfaces
- Terrain slope helper for placement validity
- Chunked mesh streaming (100-unit chunks), 3×3 around player
- Optional soft **deformation** under player footsteps

### 9.2 Spawn Plaza (“The Meadow Gate”)

- World origin landmark / meeting place
- Stone plaza slab, decorative elements, central **obelisk** (collision)
- Outer radius ~14.5; floor height helper overrides terrain when on plaza
- Players default spawn random ring radius 4–10 around origin, facing center
- Custom spawn point overrides if set (paid)

### 9.3 Grass, trees, rocks (procedural decoration)

- Per-chunk **mulberry32** RNG from `seedFor(cx, cz)`
- Instanced grass + flower clusters driven by noise density fields
- Procedural decorative trees and rocks that always regenerate identically for a chunk
- Player can **harvest** decorative trees/rocks → wood/stone; cuts stored by deterministic id (`chunkKey_localIndex_type`); regenerate after ~60 minutes online
- Grass density setting: full / reduced / off for performance

### 9.4 Planted trees (player content)

- Data: `{ id, x, z, plantedAt, scale, variant, shape, dye?, owner }`
- Growth stages: sprout → sapling → full tree over 90s (visual geometries differ)
- Shape-specific meshes (broadleaf, pine, bushy, willow, cherry, mushroom, golden, star)
- Cut animation (~0.85s fall) before removal
- Dye permanent leaf recolor when mature
- **Release to nature:** other players’ aged items (≥2 days) can be released for +1 gold (online RPC)

### 9.5 Placed rocks

- Data: `{ id, x, z, rockShape, rot, sx, sy, sz, matIdx, placedAt, owner }`
- Mossy materials; break animation ~0.5s
- Server-persisted and region-broadcast online

### 9.6 Plots

- Personal land claim: circle or rectangle footprint
- Limits: max **5 plots**, total area ≤ **1600 m²**
- Placement uses **drone camera**; live size/shape customizer
- Spacing: min distance from other plots and landmarks
- Cost scales with area (offline formula example: circle `π*w*w*0.8`, rect `(2w)*(2d)*0.15`)
- Show owner name on plot surface

### 9.7 Crafted items

- Fence, bench, lantern, path, sign — simple procedural meshes from primitives
- Placed like rocks; wood/stone cost; removable for refund/reward per server rules
- Collision registry for placement spacing

### 9.8 Placement mode

1. Press **E** or Plant button with selected shop item → enter placement
2. Ghost follows **1.8 units** in front of player, green/red validity
3. Second **E** confirms if valid; **Esc** cancels
4. Validity rules:
   - Not too close to trees / rocks / crafted items (shape-aware radii + buffer)
   - Not on steep slope (max Δh ~1.8 over 1-unit probe)
   - Not over water (ponds + stream segments) with margin
   - Plots: landmark distance, plot-plot distance, quota checks
5. Snapshot selected item at entry so shop switches mid-mode don’t change subject

### 9.9 Water

- Static ponds at fixed landmark-aligned coordinates
- Meandering stream polyline with constant width (~3.5)
- Reflective/transparent water materials + ripple effects when walking/watering
- Watering action targets nearest **young** sapling within range

### 9.10 Landmarks

Fixed shareable places (deterministic coordinates). Discover by walking near; one-time +20 gold; unlock teleport destination.

**Include all of these (ids + approximate positions):**

**Spawn / near ring:**
- `spawn-plaza` — The Meadow Gate (0,0) — nearRange 30, discoverRange 18
- `lonely-oak` (62, -48)
- `crystal-pond` (-74, 40)
- `whispering-hill` (120, 96)
- `windmill-meadow` (-110, -92)
- `seven-sisters` (24, 150)
- `sun-stone` (-150, 130)
- `mossy-arch` (45, 80)
- `firefly-hollow` (-30, -60)

**Mid ring:**
- `broken-bridge` (180, -140)
- `elderwood` (-200, -50)
- `flower-terrace` (90, -220)
- `starfall-clearing` (-160, 210)
- `echo-stones` (240, 30)
- `willow-bend` (-60, 240)
- `amber-ridge` (200, 200)
- `foxglove-path` (-240, -180)

**Far ring:**
- `ancient-lighthouse` (340, -100)
- `silver-brook` (-300, 280)
- `canyon-edge` (280, -300)
- `twin-peaks` (-350, -260)
- `forgotten-shrine` (100, -380)
- `dawn-meadow` (-380, 60)
- `coral-stones` (360, 250)
- `cloud-overlook` (-50, -400)

Default discover range ~14, near (name HUD) ~26.

Each landmark has a **visual set piece** built from primitives (oak, pond, hill, windmill, grove, standing stones, ruins, hollow, bridge, flowers, clearing, willow, lighthouse, stream, canyon, shrine, etc.).

### 9.11 Navigation

- World map overlay lists landmarks; undiscovered appear locked
- Set nav target → ground **NavPath** arrows / path + compass / nav indicator
- Teleport to discovered landmarks for 15 gold (white flash + brief wait)

### 9.12 Camera modes

- **Third:** orbit behind player, pitch/yaw/zoom, soft damp
- **First:** head-mounted, wider pitch range
- **Top:** high map view (~80 height), look locked down; fog pushed out
- **Drone:** elevated free-ish view during plot placement
- Smooth damping on switch (~0.5s slower ease)

### 9.13 Wildlife & VFX

- Birds: flock/curve flight
- Butterflies: local flutter near flowers
- Fireflies: dusk-glow particles (settings toggle)
- Petals: from cherry trees / wind
- Weather clouds + rain
- Shared `wind.js` time uniforms for grass/leaves sway (`WindClock` advances them)

### 9.14 Remote players

- Interpolate toward broadcast target pos/yaw at ~10 Hz send rate
- Show name tag, color, hat, emotes, ephemeral chat bubble above head (~6s)
- Respect mute list (still may track presence but don’t render chat/avatar if muted)

---

## 10. UI modules

Build HTML overlay components (not in the Canvas):

| Component | Role |
|---|---|
| `WelcomeScreen` | First-run: pick name (2–18 chars, not “wanderer”), color; guest or email OTP login; name availability RPC when online |
| `Hud` | Top bar (brand, name, social, wood/stone/gold, status, minimap, compass), bottom buttons, hints |
| `Shop` | Nature shop: trees, rocks, plot, dyes, cosmetics; select item for placement |
| `Crafting` | Crafting catalog; place crafted items |
| `Chat` | Region vs World scope toggle; history; world chat gold cost; donor badge 🌳 |
| `Minimap` | Top-down radar of player, nearby trees/players |
| `WorldMap` | Full map, landmark list, teleport / navigate |
| `Identity` | Edit name/colors/hat; buy cosmetics; optional email link to account |
| `Social` | Friends online/offline, pending requests, search by name, remote profiles, block/mute |
| `Settings` | Mute, fireflies, shadows, grass density, effects, particles, joystick, keybinds, view |
| `Compass` | Cardinal direction from camera yaw |
| `NavIndicator` | Active nav target distance |
| `PlacementBanner` | Placement mode instructions + invalid reason |
| `PlotCustomizer` | Shape/size controls during plot drone mode |
| `ActionPill` | When selection active: Cut / Dye / Release actions |
| `PlaceLabel` | Current landmark name when near |
| `Toast` | Transient messages |
| `Status` | Online / connecting / offline + player count |
| `Screenshot` | Capture canvas (`preserveDrawingBuffer: true`) and share/download |
| `TouchJoystick` | Mobile dual stick |

---

## 11. Networking (online mode)

### 11.1 Auth

- Prefer **anonymous sign-in** when keys present
- Optional Cloudflare Turnstile captcha token on sign-in
- Optional **email OTP** on welcome/identity for durable accounts
- `ensure_profile` creates player row with unique name (case-insensitive unique except default “wanderer”)

### 11.2 Session bootstrap (`Net.jsx`)

1. If no Supabase env → offline path: local daily bonus, bridge stays no-op
2. Else sign in → ensure profile → hydrate gold/wood/stone/name/colors/discovered/spawn/cosmetics
3. Wire bridge methods to RPCs
4. Subscribe region channels based on player position; switch region with hysteresis
5. Stream trees/rocks/plots/crafted for region/chunks; merge into store
6. Broadcast position ~10 Hz with id, x, z, yaw, emote, appearance
7. Listen for tree/rock/plot/craft/cut/dye/chat events; ignore own echoes
8. Hydrate social graph + world tree total wood + donors
9. Claim daily bonus + offline gold reclaim if applicable

### 11.3 Core RPCs (implement server-side)

At minimum:

- `check_rate_limit` / `check_chat_rate_limit` (token bucket)
- `ensure_profile`, `update_profile`, `check_name_available`, `buy_cosmetic`
- `plant_tree`, `water_tree`, `cut_tree`, `dye_tree`
- `place_rock`, `remove_rock`
- `buy_custom_plot`
- `place_crafted_item`, `remove_crafted_item`
- `cut_procedural_resource`
- `discover_landmark`, `teleport_to_landmark`, `set_spawn`
- `claim_daily_bonus`, `claim_offline_gold`, `release_overgrown_item`
- `check_region_chat` / `send_world_chat` (sanitize + rate limit + gold for world)
- `send_friend_request`, `send_friend_request_by_name`, `accept_friend_request`, `decline_friend_request`, `unfriend`, `get_social_data`, `get_player_profile`, `toggle_block`
- `donate_to_world_tree`

### 11.4 Tables (core)

- `players` — identity, gold, wood, stone, discovered[], cooldowns, cosmetics, rate limit tokens, blocked_users, custom spawn fields as needed
- `trees` — id, owner_id, region_x/z, x, z, variant, shape, scale, planted_at, dye
- `rocks` — similar ownership + shape/scale/rot
- `plots` — shape, dimensions, position, owner
- `crafted_items` — item_id, position, rot, owner
- `cut_resources` — procedural harvest ids with expiry
- `friends`, `friend_requests`
- `world_tree`, `world_tree_donors` — collaborative wood donation goal

### 11.5 Chat

- Scopes: **region** (free, local channel) and **world** (3 gold, global)
- Client masks profanity; server sanitizes + rate limits
- Max message length ~160; keep last ~60 messages in UI
- Client pre-cooldown ~800ms region / 1500ms world

### 11.6 World Tree

- Global collaborative goal: players donate wood
- Show donor badge in chat for donors
- Realtime sync of total wood and new donors

---

## 12. App composition

`App.jsx` structure:

```
Canvas (shadows, dpr [1,1.75], ACES, fog, pointerMissed clears selection)
  WindClock
  Selection (postprocessing outline context)
    Suspense
      Environment, Terrain, GrassField
      Rocks, PlacedRocks, Plots, TreesField, CraftedItems
      PlacementPreview, Water, Landmarks
      optional particles: Birds, Butterflies, Petals
      Fireflies, Weather, RemotePlayers
    Player, CameraRig, NavPath, WaterEffect, Net, Effects
Controls, Ambience, Hud, WelcomeScreen, LoadingFade
```

`main.jsx`: React root + Sentry error boundary + styles.

---

## 13. Persistence

**localStorage key:** `meadow-save-v1`

Always cache: name, colors, viewMode, graphics prefs, joystick, keybinds, customSpawn, playtimeSeconds, welcome flag.

**Offline only:** also cache gold, wood, stone, trees, discovered, rocks, plots, crafted, cutResources, lastBonus.

**Online:** server is source of truth for economy and world objects; local cache is preferences + identity fallback.

Debounce saves ~1s after state changes.

---

## 14. Implementation order (recommended)

Build in this order so each milestone is playable:

1. **Scaffold** Vite + React + R3F canvas, fog, Environment, basic Terrain plane with noise height
2. **Player + Controls + CameraRig** — walk, look, third/first person, terrain snap
3. **Chunk streaming** 3×3 terrain + grass
4. **Procedural rocks & trees** decoration + collision registries
5. **Zustand store + local save** + HUD gold/name
6. **Planting placement flow** + sapling growth visuals + water + cut
7. **Shop catalog** trees/rocks + selection
8. **Spawn Plaza + landmarks** discovery + place labels + world map/nav
9. **Water ponds/stream** + water effects
10. **Postprocessing, wildlife, wind, ambience**
11. **Settings, minimap, compass, toast, screenshot, touch joystick**
12. **Plots + crafting + dyes + cosmetics**
13. **Supabase schema + bridge + Net** multiplayer positions/chat/entities
14. **Social/friends, world chat, world tree, daily bonus**
15. **Polish:** welcome screen, loading fade, emotes, release-to-nature, offline gold reclaim
16. **Hardening:** rate limits, optimistic rollbacks, name uniqueness, mute/block

---

## 15. Quality bar & constraints

- Runs at interactive framerate on mid-range laptops with shadows + grass density options
- Offline play requires **zero** network calls
- Online play must not crash if Realtime disconnects; show status and degrade gracefully
- No direct client table writes for economy-critical fields
- Prefer shared geometries/materials and instancing for grass/decorative props
- Keep UI accessible enough: large hit targets on mobile, keyboard paths for shop/social where reasonable
- Title branding: **“a shared garden”** (lowercase lettering in HUD)
- Theme color / meta: `#e7d8b8`

---

## 16. Acceptance checklist

The game is “complete” when:

- [ ] Offline: walk endless meadow, plant/water/cut trees, place rocks, craft items, claim plots, discover landmarks, teleport (local gold), daily bonus via playtime
- [ ] Visual: golden-hour sky, fog, grass, water, landmarks, postprocessing outline on selection
- [ ] Avatar: walk/run/sit/wave, color parts + hats
- [ ] UI: welcome, shop, craft, map, chat, settings, social, toast, minimap, compass
- [ ] Mobile: joystick works; UI doesn’t steal camera look (`.no-look`)
- [ ] Online (with Supabase): anonymous auth, profile hydrate, region presence, see remote players, shared trees/rocks/plots, region + world chat, friends, world tree
- [ ] Mutations optimistic + server-reconciled with error toasts
- [ ] Settings persist; offline save persists world edits

---

## 17. Copy & microcopy style

Toasts and UI text are **lowercase-friendly, short, cozy**:

- `planted a sapling · +5 gold`
- `watered a sapling · +1 gold`
- `discovered Crystal Pond · +20 gold`
- `need 15 gold to teleport`
- `too crowded here`
- `placement cancelled`
- `released to nature · +1 gold`
- `world chat costs 3 gold`
- `slow down — one message at a time`

Avoid corporate or military language.

---

## 18. What NOT to overbuild

- Do not add combat, inventory grids of hundreds of items, or quest NPCs unless later requested
- Do not depend on large paid asset stores; procedural primitives + simple shaders are the aesthetic
- Do not require GraphQL/Firebase/custom game servers; Supabase is the intended backend
- Do not put high-frequency position into React state

---

## 19. Deliverables

1. Working Vite app matching this design
2. `README.md` with offline quick start + online Supabase setup
3. `.env.example`
4. `supabase/schema.sql` (idempotent) + migrations for crafting/friends/shop as needed
5. Complete `src/` tree as specified
6. `npm run build` succeeds

---

## 20. One-shot instruction to the implementer

> Create the complete multiplayer social gardening game **“a shared garden”** (package `meadow`) exactly as specified in this document. Use React 18, Vite, Three.js / React Three Fiber / Drei / postprocessing, Zustand, and optional Supabase. Implement offline-first play with localStorage, high-frequency state outside React, placement-based gardening, soft economy (gold/wood/stone), procedural golden-hour meadow with landmarks, full HUD, and a bridge-pattern network layer with SECURITY DEFINER RPCs for online multiplayer. Prefer procedural geometry. Match controls, catalogs, landmark list, economy constants, visual tone, and architecture principles above. Ship a playable offline game first, then wire online multiplayer without breaking offline mode.

---

*End of build prompt.*
