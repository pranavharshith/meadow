# a shared garden

A 3D multiplayer social gardening game built with React Three Fiber and Supabase. Wander a procedurally generated meadow, plant trees, place rocks, water saplings, discover landmarks, and meet other players — all in a warm golden-hour world.

## Quick Start

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. Runs fully offline by default — no account or API keys needed.

## Commands

| Key | Action |
|---|---|
| WASD / Arrow keys | Walk |
| Drag | Look around |
| E | Plant selected item / confirm placement |
| R | Water nearest sapling |
| X | Cut selected tree or rock |
| G | Open nature shop |
| V | Cycle camera (third / first / top) |
| C | Sit / stand |
| F | Wave |
| M | Toggle sound |
| Esc | Cancel placement / deselect |

## Online Mode

The game runs single-player offline out of the box. To enable the shared multi-player layer:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Enable **Anonymous sign-ins** in Auth > Providers
3. Run the SQL from `supabase/schema.sql` in the SQL editor
4. Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

When these are set, the game starts in online mode — player positions, trees, rocks, and chat are shared with everyone in the same region.

### Optional: Cloudflare Turnstile

Gate anonymous sign-ins against scripted identity-cycling:

```env
VITE_TURNSTILE_SITE_KEY=0x...
```

Also enable CAPTCHA protection in Supabase Auth > Settings with the matching secret key.

### Optional: Sentry

```env
VITE_SENTRY_DSN=https://...
VITE_SENTRY_TRACES_SAMPLE_RATE=0.1
```

## Architecture

```
src/
├── main.jsx          Entry point
├── App.jsx           3D scene + UI composition
├── Controls.jsx       Keyboard + mouse input
├── Ambience.jsx      Procedural audio (WebAudio)
├── wind.js           Shared wind uniforms
├── store.js          Zustand store (game state)
├── player-state.js   Mutable high-frequency state
├── styles.css        All UI styles
├── net/              Network layer
│   ├── bridge.js     Offline/online indirection
│   ├── Net.jsx       Supabase RPC + Realtime wiring
│   ├── supabase.js   Client initialization
│   ├── state.js      Remote player + net status
│   ├── region.js     Region sharding logic
│   ├── moderation.js Client-side profanity + mute
│   └── captcha.js    Turnstile integration
├── world/            3D scene components
│   ├── Terrain.jsx   Procedural terrain chunks
│   ├── TreesField.jsx Decorative + planted trees
│   ├── Rocks.jsx     World-generated rocks
│   ├── PlacedRocks.jsx Player-placed rocks
│   ├── GrassField.jsx Instanced grass + flowers
│   ├── Water.jsx     Ponds + stream
│   ├── Weather.jsx   Clouds + rain system
│   ├── Player.jsx    Local player avatar
│   ├── RemotePlayers.jsx Other players
│   ├── CameraRig.jsx Camera smoothing
│   ├── Landmarks.jsx Discoverable places
│   ├── SpawnPlaza.jsx Meeting point at origin
│   ├── PlacementPreview.jsx Ghost preview
│   ├── Birds.jsx
│   ├── Butterflies.jsx
│   ├── Fireflies.jsx
│   ├── Petals.jsx
│   ├── NavPath.jsx   Navigation arrow path
│   ├── SelectionRing.jsx Ground highlight
│   ├── WaterEffect.jsx Water splash particles
│   ├── Environment.jsx Lighting + sky
│   ├── Effects.jsx    Bloom + outline + vignette
│   ├── WindClock.jsx  Wind animation driver
│   ├── noise.js       Value noise / terrain height
│   ├── chunk.js       Chunk seeding
│   ├── tree-assets.js Shared tree geometries
│   ├── mossy-material.js Moss shader
│   └── places.js      Landmark definitions
└── ui/               HTML overlay components
    ├── Hud.jsx       Main HUD layout
    ├── Shop.jsx      Tree/rock catalog
    ├── Chat.jsx      Region + world chat
    ├── Minimap.jsx   Top-down radar
    ├── WorldMap.jsx  Full-screen map
    ├── Identity.jsx  Name/color editor + email link
    ├── Settings.jsx  Graphics/sound toggles
    ├── Compass.jsx   Cardinal direction
    ├── NavIndicator.jsx Active nav target
    ├── PlacementBanner.jsx Placement mode UI
    ├── CutAction.jsx Cut confirmation pill
    ├── PlaceLabel.jsx Current landmark name
    ├── Toast.jsx     Transient notifications
    ├── Status.jsx    Online/offline indicator
    ├── Screenshot.jsx Camera capture + share
    └── TouchJoystick.jsx Mobile dual-zone controls
```

### State Philosophy

High-frequency data (player position, camera look, keyboard state) lives in mutable singleton objects in `player-state.js` — updated every frame without triggering React re-renders. Persistent game state (gold, inventory, trees, settings) lives in a Zustand store with localStorage persistence. The network layer uses a bridge pattern: offline no-ops are swapped for Supabase RPC calls when a session is active.

### Security Model

All mutations go through PostgreSQL SECURITY DEFINER RPCs. Direct table writes are revoked from anon/authenticated roles. RPCs enforce cooldowns, spacing rules, gold costs, ownership checks, and input clamping server-side. Chat is server-emitted via `realtime.send()` to prevent forged messages.

### World

The world is procedurally generated from seeded value noise — no external assets. A 3×3 chunk window (100-unit chunks) follows the player. The world is divided into 120-unit regions for networking, each split into 4 Realtime shards for presence/position broadcasts, plus one un-sharded chat channel.

## Tech Stack

- **Framework:** React 18 + Vite
- **3D:** Three.js, @react-three/fiber, @react-three/drei, @react-three/postprocessing
- **State:** Zustand
- **Backend:** Supabase (PostgreSQL, Realtime, Auth, RPCs)
- **Monitoring:** Sentry
- **Audio:** WebAudio API (procedural, no audio files)
- **Auth:** Supabase anonymous (optional email linking)

## Environment Variables

All variables are optional. Without them the game runs fully offline.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key |
| `VITE_SENTRY_DSN` | Sentry DSN for error monitoring |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Sentry trace sampling rate |

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # preview the build
```
