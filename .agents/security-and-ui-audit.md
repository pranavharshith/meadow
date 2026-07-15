# Opinion: Should Meadow stay fully open-world?

**Date:** 2026-07-15  
**Product:** *a shared garden* (Meadow) — multiplayer browser meadow, React + Three.js + Supabase  
**Question:** Keep an endless open plane, or change direction?  
**Bottom line:** **Do not keep “infinite open world” as the long-term product promise.** Keep the *feeling* of a wide meadow, but **bound the shared multiplayer world** and invest density over distance.

---

## 1. What you have today

Meadow already *behaves* like an open world:

- Procedural terrain and props in **100×100 chunks**, streamed in a 3×3 window around the player.
- Realtime presence/chat in **regions** (~120 units).
- Persistent placed stuff (trees, rocks, plots, crafts) via Supabase RPCs.
- Fixed **landmarks** out to ~400 units (Meadow Gate → mid/far rings).
- Anyone can walk forever; the mesh keeps generating.

So the design question is not “do we have open world tech?” — you do.  
It’s: **should the product stay unbounded, multiplayer, and free-roam forever?**

My answer: **no, not fully.** Soft bounds + denser “one garden” is the better product.

---

## 2. Why pure open world will hurt you

Your instinct that it will be problematic is right. Not because open world is bad in general — because **your stack, team size, and game fantasy** fight infinite space.

### A. Empty world is death for a social garden

The fantasy is *shared*: meeting people, seeing others’ trees, chat, friends, the World Tree.  

In an infinite plane:

| Effect | Why it hurts Meadow |
|--------|---------------------|
| Players scatter | Spawn at Gate → discover → plant far away → never meet again |
| Landmarks become a checklist | Far rings reward *distance*, not *presence* |
| Social features feel dead | Friends list, region chat, “N in zone” only matter if people share space |
| Content looks sparse | Same grass forever reads as unfinished, not vast |

Animal Crossing / shared-garden vibes win on **density and familiarity**, not on how far the map goes.

### B. Multiplayer cost scales with space, not with beauty

You already pay for:

- Chunk load RPCs (`get_nearby_world`)
- Per-chunk Realtime channels
- Region chat / presence
- Proximity checks, harvest caps, rate limits
- Position heartbeats

Infinite placement means:

- Tables grow without a natural ceiling (trees, rocks, plots, cuts).
- Griefing and spam move *outward* (harder to moderate, easier to abandon mess).
- “Who is near me?” gets worse as population thins.
- Support and ops stay firefighting **scale** instead of polishing **moments**.

You can engineer for scale later. You cannot easily re-teach players a new social contract after months of “walk forever and plant anywhere.”

### C. Browser 3D has a hard ceiling

Even with chunk streaming:

- GPU cost (grass, trees, postprocessing, shadows) is per-view, not per-map.
- You’ve already hit **WebGL / postprocessing / connect flap** issues — classic browser multiplayer pain.
- Open world multiplies edge cases: gate collision, climb ratios, chunk seams, stale position RPCs, channel resubscribe.

A smaller, denser world is **more playable on phones and low-end laptops** — which is exactly who a web garden should serve.

### D. Design and narrative get diluted

Landmarks to 400 units already sketch a “known meadow.” Infinite beyond that adds little story:

- No seasons-per-biome progression without huge work.
- No “our village” identity if everyone lives 2km apart.
- Economy (gold, wood, daily caps) is harder to balance when farm space is infinite.

### E. Security / moderation surface grows with the map

You closed a lot of exploit paths (RPC-only writes, captcha, proximity, harvest limits). Good.  

Unbounded world still means:

- More places to hide grief builds.
- Harder “report this place” UX.
- Harder to reason about fairness (who owns the good spots?).

A **bounded shared garden** is easier to police and easier to make feel fair.

---

## 3. What *is* worth keeping from open world

Do **not** throw away:

1. **Chunk streaming** — keep it; it’s the right way to render a large area.
2. **Deterministic terrain** — “meet at the Lonely Oak” is a real, shareable promise.
3. **Landmark discovery** — excellent onboarding and gold loop.
4. **Soft multiplayer** — anonymous + optional friends, not MMO login hell.
5. **The Meadow Gate as home** — best brand moment you have.

Open-world *technology* can serve a **large but finite** garden. The mistake is promising **infinite multiplayer frontier**.

---

## 4. Best direction I recommend

### Product model: **“One Shared Meadow”** (not infinite Earth)

Think **Animal Crossing island / public park / single valley**, not Minecraft infinite survival.

| Layer | Recommendation |
|-------|----------------|
| **Playable multiplayer radius** | Finite. Roughly **current far-landmark ring** (on the order of **±400–600** from origin), with a soft edge. |
| **Feel of space** | Still “wide meadow” — hills, landmarks, long walks — but you eventually **loop, soft-wall, or fog-and-turn-back**, not endless empty grass. |
| **Where people live** | Strong **pull back to Gate + near ring** (social gravity). Far landmarks = day trips, not permanent exile. |
| **Persistence** | Prefer denser plots near home; optional stricter caps far out (or no permanent builds past a ring). |
| **New content** | **Vertical / systems** (events, seasons, World Tree goals, garden contests) over **new distant biomes**. |

### Soft edge (preferred over hard wall)

At the rim of the shared meadow:

- Visual: haze, wind, “the wild grows thick here…”
- Gameplay: slow move, gentle push inward, or “the path turns back toward the Gate”
- Optional: one-time discovery “Edge of the Meadow” landmark so it feels intentional, not broken

Hard invisible walls feel cheap; **narrative soft bounds** feel designed.

### Social gravity (more important than map size)

Design so the default session is *near other people*:

1. **Meadow Gate** = always warm (spawn, daily, World Tree, notices).
2. **Near ring landmarks** = primary destinations (already good).
3. **Far landmarks** = optional pilgrimage, weaker permanent build rights if needed.
4. **Region chat + “N nearby”** stay meaningful because population isn’t diluted to zero.
5. **First-walk quest** already points at landmarks — extend that into “return home / share the Gate” loops.

### Build rules that match the fantasy

| Zone | Builds | Intent |
|------|--------|--------|
| Gate plaza | Limited / curated | Public commons, not junkyard |
| Near meadow | Full plant/place with soft caps | “Our neighborhood” |
| Mid ring | OK, maybe higher cost / lower density | Adventure + light settlement |
| Far / edge | Discover + harvest, little or no permanent plot spam | Keeps world readable |

Exact numbers can wait; the **policy** matters now.

### What to stop optimizing for

- Infinite chunk channels “just in case”
- Far-out farm meta that empties the Gate
- New systems that only make sense if the map is infinite

### What to optimize for instead

- **First 10 minutes:** beautiful, clear, social, one good loop (walk → discover → plant → see someone else’s tree).
- **Return visit:** Gate feels alive; something changed (World Tree, friends, weather, daily).
- **Stability:** connection, collision, harvest, plant — the stuff that already burned time.
- **One strong multiplayer moment** per session beats 2km of empty grass.

---

## 5. Directions I would *not* pick (for this project)

| Direction | Why not (for you now) |
|-----------|------------------------|
| **True infinite MMO open world** | Ops, moderation, emptiness, browser limits |
| **Tiny single room only** | Throws away your terrain/landmark strength |
| **Instanced private islands only** | Kills “shared garden”; maybe a *later* mode, not the core |
| **Procedural multiplayer shards with no center** | No home, no culture, weak brand |

**Later (optional):** private plots / “my corner” as a *mode*, while the default world stays one public meadow. Not the first bet.

---

## 6. Practical roadmap (opinionated order)

### Now (direction, not a big rewrite)

1. **Decide the shared radius** (e.g. soft edge past farthest landmark).
2. **Document it** in-game (“This meadow has an edge — the Gate is home”).
3. **Stop adding far systems** until near-ring density feels good.
4. Keep fixing reliability (connect, harvest, collision) — those matter more than map size.

### Next

5. Soft edge implementation (move damp + message + optional landmark).
6. Placement policy by zone (if grief/emptiness shows up).
7. Social pull: Gate events, World Tree goals, “someone planted near you” moments.
8. Cap or decay abandoned far builds if tables grow.

### Later (only if product is healthy)

9. Seasons / weather stories on the **same** map.
10. Optional private garden instance.
11. Larger map **only** if concurrent players and retention prove the center is crowded.

---

## 7. Decision framework (if you argue with yourself later)

Ask:

1. Does this feature make **two strangers more likely to meet**?
2. Does it make the **Gate feel more like home**?
3. Does it add **density / meaning**, or only **distance**?
4. Can a phone browser run it without another WebGL war?
5. Can one person moderate it?

If the answer to 1–3 is “only distance,” skip it.

---

## 8. Final recommendation

**Keep:** streaming chunks, landmarks, multiplayer RPCs, the open *feel*.  
**Drop (as a product goal):** infinite unbounded shared world.  
**Build:** one finite, dense, soft-edged **Shared Meadow** centered on the Meadow Gate, with far land as pilgrimage not suburb.

You are right that full open world will be problematic — not as a tech demo, but as a **social garden**. The best path is a **bounded commons with room to wander**, not an endless frontier.

That direction matches your stack, your brand, and the features you’ve already invested in. Infinite space can wait until (if ever) the center is too full of people — and that’s a good problem to have.
