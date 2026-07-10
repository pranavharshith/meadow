import { create } from 'zustand'
import { P, placement } from './player-state'
import { LANDMARKS } from './world/places'
import { bridge } from './net/bridge'
import { maskProfanity, clientChatCooldown } from './net/moderation'
import { terrainHeight } from './world/noise'
import { plazaFloorHeight } from './world/SpawnPlaza'

const LS_KEY = 'meadow-save-v1'
const GROW_SECONDS = 90
const WATER_COOLDOWN = 4000 // ms between watering (client-side pre-check)
const WATER_BOOST = 18000 // ms of growth granted per watering (mirrors server)
const WORLD_CHAT_COST = 3
const CHAT_MAX = 60

// Gold sink costs
const TELEPORT_COST = 15
const SET_SPAWN_COST = 40
const PLOT_COST = 250

// Cut reward gold
const CUT_GROWN_REWARD = 8
const CUT_SAPLING_REWARD = 2
const CUT_RANGE = 4.0 // world units

// Rock reward on removal
const ROCK_REMOVE_REWARD = 3

function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'x' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {}
  } catch {
    return {}
  }
}

const PASTELS = ['#e79aa0', '#8fb7e8', '#a9d98a', '#efd694', '#c8a2e0', '#7fd8c0', '#f0a875']
function randomColor() {
  return PASTELS[(Math.random() * PASTELS.length) | 0]
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const saved = loadSave()
let lastWaterAt = 0

// FIX #9 — guard in-flight discoveries so a server rejection mid-async
// cannot re-trigger discoverLandmark and spam the flash / gold update.
const _pendingDiscover = new Set()

export const PALETTE = PASTELS

export const useStore = create((set, get) => ({
  // camera + a/v
  viewMode: saved.viewMode ?? 'third',
  muted: saved.muted ?? false,
  fireflies: saved.fireflies ?? true,
  shadows: saved.shadows ?? true,
  grassDensity: saved.grassDensity ?? 'full',
  effects: saved.effects ?? true,
  particles: saved.particles ?? true,
  settingsOpen: false,

  // touch joystick — auto-enable on touch devices, else off
  joystickEnabled: saved.joystickEnabled ?? (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0),

  // progression (server-owned when online; localStorage fallback offline)
  gold: saved.gold ?? 0,
  color: saved.color ?? randomColor(),
  headColor: saved.headColor ?? null,
  bodyColor: saved.bodyColor ?? null,
  legColor: saved.legColor ?? null,
  hatId: saved.hatId ?? null,
  name: saved.name ?? '',
  trees: saved.trees ?? [],
  discovered: saved.discovered ?? [],
  lastBonus: saved.lastBonus ?? '', // only used offline; server tracks per-day online
  // rocks are server-owned when online (like trees). localStorage for offline.
  placedRocks: saved.placedRocks ?? [],

  // custom spawn point set by the player (null = default spawn at origin)
  customSpawn: saved.customSpawn ?? null,

  // personal plots (server-owned when online; localStorage for offline)
  plots: saved.plots ?? [],

  // shop
  shopOpen: false,
  selectedItem: { type: 'tree', id: 'broadleaf', shape: 0, cost: 0 },

  // social & profile
  joinDate: saved.joinDate ?? null,
  treesPlanted: saved.treesPlanted ?? 0,
  friends: [],
  friendRequests: [],
  socialOpen: false,
  profileModal: null, // { id: string } or null

  // playtime (offline only)
  playtimeSeconds: saved.playtimeSeconds ?? 0,

  // transient UI
  toast: null,
  mapOpen: false,
  navTarget: null,
  waterEvent: null,
  inputContext: 'GAME', // 'GAME', 'UI', 'CHAT'
  
  // Interactive selection in the world: which user-planted tree / placed rock
  // is currently picked (for cutting or future actions). Null when nothing
  // is selected. `kind` is 'tree' or 'rock'.
  selection: null, // { kind: 'tree' | 'rock', id: string }
  cuttingId: null, // tree id currently playing cut animation
  breakingId: null, // rock id currently playing break animation
  dyeingTreeId: null, // tree id being dyed, or null
  previewColor: null,  // hex string during swatch hover, or null

  // Placement mode. While set, a ghost of the object being placed follows
  // the player and validity is checked every frame. Actual placement only
  // happens on confirmPlacement() when the ghost is green.
  //   placementMode:    'tree' | 'rock' | null
  //   placementSubject: snapshot of selectedItem taken at entry time
  placementMode: null,
  placementSubject: null,

  // networking status
  online: false,
  connectionStatus: 'offline',
  playerCount: 1,
  renderedCount: 0,
  chat: [],

  chatScope: 'region',

  setView: (v) => set({ viewMode: v }),
  cycleView: () =>
    set((s) => ({
      viewMode: s.viewMode === 'third' ? 'first' : s.viewMode === 'first' ? 'top' : 'third',
    })),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleFireflies: () => set((s) => ({ fireflies: !s.fireflies })),
  toggleShadows: () => set((s) => ({ shadows: !s.shadows })),
  setGrassDensity: (v) => set({ grassDensity: v }),
  toggleEffects: () => set((s) => ({ effects: !s.effects })),
  toggleParticles: () => set((s) => ({ particles: !s.particles })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setMapOpen: (v) => set({ mapOpen: v }),
  setNavTarget: (target) => set({ navTarget: target }),
  clearNav: () => set({ navTarget: null }),
  setShopOpen: (v) => set({ shopOpen: v, inputContext: v ? 'UI' : 'GAME' }),
  setSocialOpen: (v) => set({ socialOpen: v, inputContext: v ? 'UI' : 'GAME' }),
  setProfileModal: (v) => set({ profileModal: v, inputContext: v ? 'UI' : 'GAME' }),
  setFriends: (friends) => set({ friends }),
  setFriendRequests: (friendRequests) => set({ friendRequests }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: null }),
  setDyeingTreeId: (id) => set({ dyeingTreeId: id, previewColor: null }),
  setPreviewColor: (color) => set({ previewColor: color }),
  cancelDyeing: () => set({ dyeingTreeId: null, previewColor: null }),
  setJoystickEnabled: (v) => set({ joystickEnabled: v }),
  setInputContext: (ctx) => set({ inputContext: ctx }),

  setName: (name) => {
    const state = get()
    const cleaned = (name || '').trim().slice(0, 18)
    if (cleaned === state.name) return
    if (!bridge.online) set({ name: cleaned })
    bridge.saveIdentity(cleaned, state.color, state.headColor, state.bodyColor, state.legColor, state.hatId)
  },
  setColor: (color) => {
    const state = get()
    if (!bridge.online) set({ color })
    bridge.saveIdentity(state.name, color, state.headColor, state.bodyColor, state.legColor, state.hatId)
  },
  buyCosmetic: async (type, id, colorVal, cost) => {
    const state = get()
    if (state.gold < cost) {
      state.flash(`need ${cost} gold`)
      return false
    }
    
    if (!bridge.online) {
      state.flash('must be online to buy')
      return false
    }
    
    const res = await bridge.buyCosmetic(type, id, colorVal, cost)
    if (!res.ok) {
      get().flash(res.error || 'purchase failed')
      return false
    }
    
    get().flash(`customised avatar · -${cost} gold`)
    return true
  },
  setChatScope: (chatScope) => set({ chatScope }),

  flash: (msg) => {
    set({ toast: { msg, at: Date.now() } })
    setTimeout(() => {
      if (get().toast && Date.now() - get().toast.at >= 2600) set({ toast: null })
    }, 2700)
  },

  // --- networking hydration (called by <Net/>) ---
  setOnline: (online) => set({ online, connectionStatus: online ? 'connected' : 'offline' }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setPlayerCount: (playerCount) => set({ playerCount }),
  setRenderedCount: (renderedCount) => set({ renderedCount }),
  // Server is the source of truth for gold + discovered. Overwrites local.
  hydrateProfile: ({ gold, name, color, headColor, bodyColor, legColor, hatId, discovered, customSpawn, joinDate, treesPlanted, lastWaterAt: serverLastWaterAt }) =>
    set((s) => {
      if (serverLastWaterAt !== undefined) {
        lastWaterAt = new Date(serverLastWaterAt).getTime();
      }
      return {
        gold: gold ?? s.gold,
        name: name ?? s.name,
        color: color ?? s.color,
        headColor: headColor ?? s.headColor,
        bodyColor: bodyColor ?? s.bodyColor,
        legColor: legColor ?? s.legColor,
        hatId: hatId ?? s.hatId,
        discovered: discovered ?? s.discovered,
        customSpawn: customSpawn ?? s.customSpawn,
        joinDate: joinDate ?? s.joinDate,
        treesPlanted: treesPlanted ?? s.treesPlanted,
      }
    }),
  setGold: (gold) => set({ gold }),
  setTrees: (trees) => set({ trees }),
  addTree: (t) =>
    set((s) => (s.trees.some((x) => x.id === t.id) ? {} : { trees: [...s.trees, t] })),
  removeTreeLocal: (id) => set((s) => ({ trees: s.trees.filter((t) => t.id !== id), cuttingId: null })),

  // --- Rock server sync ---
  setRocks: (rocks) => set({ placedRocks: rocks }),
  addRock: (r) =>
    set((s) => (s.placedRocks.some((x) => x.id === r.id) ? {} : { placedRocks: [...s.placedRocks, r] })),
  removeRockLocal: (id) => set((s) => ({ placedRocks: s.placedRocks.filter((r) => r.id !== id) })),

  // --- Plot server sync ---
  setPlots: (plots) => set({ plots }),
  addPlot: (p) =>
    set((s) => (s.plots.some((x) => x.id === p.id) ? {} : { plots: [...s.plots, p] })),
  removePlotLocal: (id) => set((s) => ({ plots: s.plots.filter((p) => p.id !== id) })),

  addChatMessage: (m) =>
    set((s) => ({ chat: [...s.chat, m].slice(-CHAT_MAX) })),

  // ---------------------------------------------------------------------
  // MUTATIONS
  //
  // When online: apply optimistically (fast HUD feedback), then call the
  // server RPC. If the server accepts, reconcile gold to the authoritative
  // value it returned. If it rejects, revert and toast an error.
  // When offline: just apply locally (same behaviour as before).
  // ---------------------------------------------------------------------

  // ── Placement flow ─────────────────────────────────────────────────────
  //
  // `plantTree()` and `placeRock()` are the public entry points bound to the
  // E key and the HUD Plant button. Pressing them once enters placement
  // mode; pressing again confirms. Escape cancels. Actual insertion happens
  // in `_finalizePlant()` / `_finalizePlaceRock()`, which are called only
  // after `PlacementPreview` has validated the ghost's position.

  enterPlacement: () => {
    const state = get()
    const sel = state.selectedItem
    if (sel.type === 'plot') {
      const myPlots = state.plots.filter((p) => p.owner)
      if (myPlots.length >= 5) {
        state.flash('you can only own up to 5 plots')
        return
      }
      
      let myArea = 0
      myPlots.forEach(p => {
        const pw = p.width ?? 10
        const pd = p.depth ?? 10
        if (p.shapeType === 0 || p.shapeType === undefined) myArea += 3.14159 * pw * pw
        else myArea += (pw * 2) * (pd * 2)
      })
      if (myArea >= 1600) {
        state.flash('you have reached your land quota (1600 sq m)')
        return
      }

      set({ 
        placementMode: 'plot', 
        placementSubject: { ...sel, kind: 'plot', shapeType: 0, width: 10, depth: 10 },
        viewMode: 'drone'
      })
      return
    }
    const kind = sel.type === 'rock' ? 'rock' : 'tree'
    const cost = sel.cost ?? 0
    if (state.gold < cost) {
      state.flash(`need ${cost} gold to place this ${kind}`)
      return
    }
    // Snapshot the shop item so switching selection during placement doesn't
    // suddenly change what's about to be placed.
    set({ placementMode: kind, placementSubject: { ...sel, kind } })
  },

  cancelPlacement: () => {
    if (!get().placementMode) return
    set({ placementMode: null, placementSubject: null, viewMode: 'third' })
    get().flash('placement cancelled')
  },

  confirmPlacement: async () => {
    const state = get()
    const mode = state.placementMode
    if (!mode) return
    const sub = state.placementSubject
    // PlacementPreview writes to the shared `placement` ref every frame.
    if (!placement.valid) {
      state.flash(placement.reason || 'cannot place here')
      return
    }
    const px = placement.x
    const pz = placement.z
    // Clear mode BEFORE async work so a follow-up E press doesn't reopen it.
    set({ placementMode: null, placementSubject: null, viewMode: 'third' })
    if (mode === 'tree') {
      await get()._finalizePlant(px, pz, sub)
    } else if (mode === 'rock') {
      await get()._finalizePlaceRock(px, pz, sub)
    } else if (mode === 'plot') {
      await get()._finalizeBuyPlot(px, pz, sub)
    }
  },

  updateCustomPlot: (shapeType, width, depth) => {
    set((s) => ({
      placementSubject: s.placementSubject ? { ...s.placementSubject, shapeType, width, depth } : null
    }))
  },

  _finalizePlant: async (px, pz, sub) => {
    const state = get()
    const cost = sub.cost ?? 0
    const t = {
      id: genId(),
      x: px,
      z: pz,
      plantedAt: Date.now(),
      scale: 1.4 + Math.random() * 0.8,
      variant: (Math.random() * 3) | 0,
      shape: sub.shape ?? 0,
      owner: true,
    }
    const PLANT_REWARD = 5
    set((s) => ({ trees: [...s.trees, t], gold: s.gold - cost + PLANT_REWARD }))
    const costStr = cost > 0 ? ` · -${cost} gold` : ''
    state.flash(`planted a sapling${costStr} · +${PLANT_REWARD} gold`)

    if (bridge.online) {
      const res = await bridge.plant(t)
      if (!res.ok) {
        set((s) => ({
          trees: s.trees.filter((x) => x.id !== t.id),
        }))
        get().flash(res.error === 'too crowded' ? 'too crowded here' : 'could not plant')
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },

  // Rock placement — now server-persisted and broadcast to region peers.
  _finalizePlaceRock: async (px, pz, sub) => {
    const state = get()
    const cost = sub.cost ?? 5
    const rock = {
      id: genId(),
      x: px,
      z: pz,
      rockShape: sub.rockShape ?? 2,
      rot: P.avatarYaw,
      sx: 0.7 + Math.random() * 0.5,
      sy: 0.5 + Math.random() * 0.4,
      sz: 0.7 + Math.random() * 0.5,
      matIdx: (Math.random() * 3) | 0,
      placedAt: Date.now(),
      owner: true,
    }
    set((s) => ({
      placedRocks: [...s.placedRocks, rock],
      gold: s.gold - cost,
    }))
    state.flash(`placed a rock · -${cost} gold`)

    if (bridge.online) {
      const res = await bridge.placeRock(rock, cost)
      if (!res.ok) {
        set((s) => ({
          placedRocks: s.placedRocks.filter((r) => r.id !== rock.id),
        }))
        const map = {
          'rock cooldown': 'wait a moment before placing again',
          'too crowded':   'too crowded here',
          'not enough gold': `need ${cost} gold`,
        }
        // If the server error isn't one we've mapped, surface the real
        // message so the user (and we) can see what actually went wrong
        // — usually "Could not find the function..." meaning schema.sql
        // wasn't re-run, or a missing-column error.
        get().flash(map[res.error] || `rock failed: ${res.error || 'unknown'}`)
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },

  // ── Personal plot (buy) ─────────────────────────────────────────────────
  _finalizeBuyPlot: async (px, pz, sub) => {
    const state = get()
    if (bridge.online) {
      const plot = { 
        id: genId(), 
        x: px, 
        z: pz,
        shapeType: sub.shapeType,
        width: sub.width,
        depth: sub.depth
      }
      const res = await bridge.buyCustomPlot(plot)
      if (!res.ok) {
        console.error('[buyPlot] server error:', res.error)
        const map = {
          'already owned': 'you already own a plot',
          'limit of 5 plots reached': 'you can only own 5 plots',
          'too close to another plot': 'too close to another plot',
          'exceeds maximum land quota (1600 sq meters)': 'land quota exceeded',
          'not enough gold': 'not enough gold',
        }
        state.flash(map[res.error] || res.error || 'could not claim plot')
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
      // Add plot to local state directly (broadcast receiver skips own events)
      get().addPlot({
        id: plot.id,
        x: px,
        z: pz,
        radius: plot.width,
        shapeType: plot.shapeType ?? 0,
        width: plot.width,
        depth: plot.depth,
        owner: true,
        name: get().name,
      })
      get().flash('plot claimed! 🏡')
    } else {
      const myPlots = state.plots.filter((p) => p.owner)
      if (myPlots.length >= 5) {
        state.flash('you can only own up to 5 plots')
        return
      }
      set((s) => {
        let cost = 0
        if (sub.shapeType === 0) cost = Math.round((3.14159 * sub.width * sub.width) * 0.8)
        else cost = Math.round((sub.width * 2 * sub.depth * 2) * 0.15)
        
        return {
          gold: s.gold - cost,
          plots: [...s.plots, { 
            id: genId(), x: px, z: pz, owner: true, 
            radius: sub.width, shapeType: sub.shapeType, width: sub.width, depth: sub.depth, name: s.name 
          }],
        }
      })
    }
    state.flash('plot claimed!')
  },

  // Public entry points: first press → enter placement, second press → confirm.
  plantTree: () => {
    const st = get()
    if (st.placementMode) return st.confirmPlacement()
    if (st.selectedItem.type === 'plot') return st.enterPlacement()
    return st.enterPlacement()
  },

  // ── Cut/remove the currently selected user-owned tree or placed rock ──
  //
  // Selection is set by clicking a tree/rock in the world (see TreesField /
  // PlacedRocks). Only user-owned items can be selected. Cutting requires a
  // selection so it's always unambiguous which item is being removed.
  cutSelection: () => {
    const state = get()
    if (state.cuttingId) return // animation already playing
    const sel = state.selection
    if (!sel) {
      state.flash('click one of your trees or rocks to select it, then cut')
      return
    }

    if (sel.kind === 'rock') {
      const rock = state.placedRocks.find((r) => r.id === sel.id)
      if (rock && !rock.owner && (Date.now() - (rock.placedAt || Date.now())) / 86400000 >= 2) return get().releaseSelection()
      if (!rock || !rock.owner) { set({ selection: null }); return }
      set((s) => ({
        breakingId: rock.id,
        gold: s.gold + ROCK_REMOVE_REWARD,
        selection: null,
      }))
      state.flash(`removed a rock · +${ROCK_REMOVE_REWARD} gold`)

      const breakStart = performance.now()
      const doRemoveRock = () => {
        set((s) => ({
          placedRocks: s.placedRocks.filter((r) => r.id !== rock.id),
          breakingId: null,
        }))
      }

      if (bridge.online) {
        bridge.removeRock(rock.id).then((res) => {
          if (!res.ok) {
            // Revert: cancel animation
            set((s) => ({
              breakingId: null,
            }))
            get().flash(res.error === 'not your rock' ? 'that rock is not yours' : 'could not remove rock')
          } else {
            if (typeof res.gold === 'number') set({ gold: res.gold })
            const elapsed = performance.now() - breakStart
            const remaining = Math.max(0, 500 - elapsed)
            if (remaining > 0) setTimeout(doRemoveRock, remaining)
            else doRemoveRock()
          }
        })
      }
      return
    } else if (sel.kind === 'tree') {
      const tree = state.trees.find((t) => t.id === sel.id)
      if (tree && !tree.owner && (Date.now() - (tree.plantedAt || Date.now())) / 86400000 >= 2) return get().releaseSelection()
      if (!tree || !tree.owner) { set({ selection: null }); return }
      state.flash('that tree is no longer here')
      return
    }
    const now = Date.now()
    const age = (now - tree.plantedAt) / 1000
    const isGrownTree = age >= GROW_SECONDS
    const reward = isGrownTree ? CUT_GROWN_REWARD : CUT_SAPLING_REWARD
    const verb = isGrownTree ? 'cut down' : 'uprooted'

    // Play the fall animation, clear selection, credit optimistically
    set((s) => ({ cuttingId: tree.id, selection: null, gold: s.gold + reward }))
    state.flash(`${verb} a tree · +${reward} gold`)

    // Kick the server RPC in parallel with the animation. Only remove the tree
    // from local state after the server confirms — if it rejects, revert gold
    // and cancel the fall (tree stays). The animation runs for 850ms from the
    // cut start; tree removal waits for whichever is later: server response or
    // animation completion.
    const cutStart = performance.now()
    const doRemove = () => {
      set((s) => ({
        trees: s.trees.filter((t) => t.id !== tree.id),
        cuttingId: null,
      }))
    }

    if (bridge.online) {
      bridge.cut(tree.id).then((res) => {
        if (!res.ok) {
          set((s) => ({ cuttingId: null }))
          const map = {
            'cut cooldown': 'wait a moment before cutting again',
            'not your tree': 'that tree is not yours',
            'not signed in': 'reconnecting — try again',
          }
          get().flash(map[res.error] || `could not cut: ${res.error || 'unknown'}`)
          return
        }
        if (typeof res.gold === 'number') set({ gold: res.gold })
        const elapsed = performance.now() - cutStart
        const remaining = Math.max(0, 850 - elapsed)
        setTimeout(doRemove, remaining)
      })
    } else {
      setTimeout(doRemove, 850)
    }
  },

  // Kept as a thin alias so anywhere old code / hooks still called it
  // (like existing UI hint text) continues to work — routes to cutSelection.
  cutNearestTree: () => get().cutSelection(),

  releaseSelection: () => {
    const state = get()
    if (state.cuttingId || state.breakingId) return
    const sel = state.selection
    if (!sel) return
    
    // Play the fall/break animation and optimistically add +1 gold
    const isRock = sel.kind === 'rock'
    const id = sel.id
    
    set((s) => ({
      ...(isRock ? { breakingId: id } : { cuttingId: id }),
      selection: null,
      gold: s.gold + 1
    }))
    state.flash(`released to nature · +1 gold`)

    const animStart = performance.now()
    const doRemove = () => {
      set((s) => ({
        ...(isRock 
            ? { placedRocks: s.placedRocks.filter(r => r.id !== id), breakingId: null }
            : { trees: s.trees.filter(t => t.id !== id), cuttingId: null }
        )
      }))
    }

    if (bridge.online) {
      bridge.releaseItem(id, sel.kind).then((res) => {
        if (!res.ok) {
          // Revert animation
          set((s) => ({
            ...(isRock ? { breakingId: null } : { cuttingId: null }),
          }))
          get().flash(res.error || 'could not release item')
        } else {
          if (typeof res.gold === 'number') set({ gold: res.gold })
          const elapsed = performance.now() - animStart
          const remaining = Math.max(0, (isRock ? 500 : 850) - elapsed)
          if (remaining > 0) setTimeout(doRemove, remaining)
          else doRemove()
        }
      })
    } else {
      setTimeout(doRemove, isRock ? 500 : 850)
    }
  },

  // Public entry for rock placement. Same flow as plantTree — first press
  // enters placement (with the currently selected rock as subject), second
  // confirms. If a tree is currently selected in the shop, the ghost will
  // still be a tree; user should switch to a rock in the shop first.
  placeRock: () => {
    const st = get()
    if (st.placementMode) return st.confirmPlacement()
    return st.enterPlacement()
  },

  waterNearest: async () => {
    const now = Date.now()
    if (now - lastWaterAt < WATER_COOLDOWN) return
    const state = get()
    const trees = state.trees
    let best = null
    let bestD = 9
    for (const t of trees) {
      const age = now - t.plantedAt
      if (age >= GROW_SECONDS * 1000) continue
      const d = (t.x - P.pos.x) ** 2 + (t.z - P.pos.z) ** 2
      if (d < bestD) { bestD = d; best = t }
    }
    if (!best) {
      state.flash('no young sapling nearby to water')
      return
    }
    lastWaterAt = now

    const plantedBefore = best.plantedAt

    // Optimistic
    set((s) => ({
      trees: s.trees.map((t) => (t.id === best.id ? { ...t, plantedAt: t.plantedAt - WATER_BOOST } : t)),
      gold: s.gold + 1,
      waterEvent: { x: best.x, z: best.z, at: now },
    }))
    state.flash('watered a sapling · +1 gold')

    if (bridge.online) {
      const res = await bridge.water(best.id)
      if (!res.ok) {
        set((s) => ({
          trees: s.trees.map((t) => (t.id === best.id ? { ...t, plantedAt: plantedBefore } : t)),
        }))
        const map = {
          'water cooldown': 'wait a moment before watering again',
          'not waterable': 'that sapling has already grown up',
          'not signed in': 'reconnecting — try again',
        }
        get().flash(map[res.error] || `could not water: ${res.error || 'unknown'}`)
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },

  sendChat: async (text) => {
    let clean = (text || '').trim().slice(0, 160)
    if (!clean) return
    clean = maskProfanity(clean)
    const state = get()
    const scope = state.chatScope

    // Client-side pre-cooldown for instant feedback (server enforces the real one)
    if (!clientChatCooldown(scope)) {
      state.flash('slow down — one message at a time')
      return
    }

    // World chat is gold-gated; check locally for a nicer error, server enforces
    if (scope === 'world' && state.gold < WORLD_CHAT_COST) {
      state.flash(`world chat costs ${WORLD_CHAT_COST} gold`)
      return
    }

    const msg = {
      id: genId(),
      scope,
      name: state.name,
      color: state.color,
      text: clean,
      at: Date.now(),
      self: true,
    }
    state.addChatMessage(msg)

    if (bridge.online) {
      const res = await bridge.sendChat(scope, clean)
      if (!res.ok) {
        const errMap = {
          'chat cooldown': 'slow down — one message at a time',
          'not enough gold': `world chat costs ${WORLD_CHAT_COST} gold`,
          'bad text': 'message rejected',
        }
        get().flash(errMap[res.error] || 'could not send')
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
      // Server returns the server-sanitized text; update our own message to match.
      if (res.text && res.text !== clean) {
        set((s) => ({
          chat: s.chat.map((m) => (m.id === msg.id ? { ...m, text: res.text } : m)),
        }))
      }
    }
  },

  discoverLandmark: async (id) => {
    if (!bridge.online) return // Cannot discover offline / before profile loads
    if (get().discovered.includes(id)) return
    // FIX #9 — skip if a request for this landmark is already in flight
    if (_pendingDiscover.has(id)) return

    _pendingDiscover.add(id)
    const lm = LANDMARKS.find((l) => l.id === id)

    // Optimistic
    set((s) => ({ discovered: [...s.discovered, id], gold: s.gold + 20 }))
    get().flash(`discovered ${lm ? lm.name : 'a place'} · +20 gold`)

    if (bridge.online) {
      try {
        const res = await bridge.discover(id)
        if (!res.ok) {
          // Roll back on server rejection
          set((s) => ({
            discovered: s.discovered.filter((x) => x !== id),
          }))
        } else if (typeof res.gold === 'number') {
          set({ gold: res.gold })
        }
      } finally {
        _pendingDiscover.delete(id)
      }
    } else {
      _pendingDiscover.delete(id)
    }
  },

  teleportTo: async (landmarkId) => {
    const state = get()
    if (!state.discovered.includes(landmarkId)) {
      state.flash('discover this place first')
      return
    }
    const lm = LANDMARKS.find((l) => l.id === landmarkId)
    if (!lm) { state.flash('unknown landmark'); return }
    if (state.gold < TELEPORT_COST) {
      state.flash(`need ${TELEPORT_COST} gold to teleport`)
      return
    }

    const originalGold = state.gold
    set((s) => ({ gold: s.gold - TELEPORT_COST }))

    if (lm.id === 'spawn-plaza') {
      const angle = Math.random() * Math.PI * 2
      const r = 4 + Math.random() * 6
      P.pos.x = lm.x + Math.cos(angle) * r
      P.pos.z = lm.z + Math.sin(angle) * r
    } else {
      P.pos.x = lm.x + 2
      P.pos.z = lm.z + 2
    }
    // FIX #1 — set Y immediately so the player doesn't snap/fall for one frame
    P.pos.y = plazaFloorHeight(P.pos.x, P.pos.z) ?? terrainHeight(P.pos.x, P.pos.z)
    set({ navTarget: null })
    state.flash(`arrived at ${lm.name}`)

    if (bridge.online) {
      const res = await bridge.teleport(landmarkId)
      if (!res.ok) {
        set({ gold: originalGold })
        get().flash(res.error === 'not enough gold' ? `need ${TELEPORT_COST} gold` : 'teleport failed (server rejected)')
      } else if (typeof res.gold === 'number') {
        set({ gold: res.gold })
      }
    }
  },

  setSpawnHere: async () => {
    const state = get()
    if (state.gold < SET_SPAWN_COST) {
      state.flash(`need ${SET_SPAWN_COST} gold to set a spawn point`)
      return
    }
    const x = P.pos.x
    const z = P.pos.z

    const originalGold = state.gold
    const originalSpawn = state.customSpawn

    set((s) => ({ gold: s.gold - SET_SPAWN_COST, customSpawn: { x, z } }))
    state.flash('spawn point set · -40 gold')

    if (bridge.online) {
      const res = await bridge.setSpawn(x, z)
      if (!res.ok) {
        set({ gold: originalGold, customSpawn: originalSpawn })
        get().flash(res.error === 'not enough gold' ? `need ${SET_SPAWN_COST} gold` : 'could not set spawn (server rejected)')
      } else if (typeof res.gold === 'number') {
        set({ gold: res.gold })
      }
    }
  },

  claimDailyBonus: async () => {
    // Online: server decides. Offline: use playtime.
    if (bridge.online) {
      const res = await bridge.claimDaily()
      if (res.ok && res.gold) {
        set({ gold: res.gold })
        get().flash('claimed daily bonus! · +10 gold')
      }
    } else {
      // Offline mode: require 24 hours of accumulated playtime (86400 seconds)
      const state = get()
      const lastBonusPlaytime = state.lastBonusPlaytime ?? 0
      if (state.playtimeSeconds - lastBonusPlaytime >= 86400 || !state.lastBonus) {
        set((s) => ({
          gold: s.gold + 10,
          lastBonus: todayStr(),
          lastBonusPlaytime: s.playtimeSeconds
        }))
        state.flash('claimed daily bonus! · +10 gold')
      } else {
        const remaining = 86400 - (state.playtimeSeconds - lastBonusPlaytime)
        const hrs = Math.ceil(remaining / 3600)
        state.flash(`play ${hrs} more hour(s) to unlock the next daily bonus (offline)`)
      }
    }
  },

  claimOfflineGold: async () => {
    if (bridge.online) {
      const res = await bridge.claimOfflineGold()
      if (res.ok && res.gold && res.gold > 0) {
        set((s) => ({ gold: s.gold }))
        get().flash(`nature reclaimed your wild items · +${res.gold} gold!`)
      }
    }
  },

  // ── Tree dye ─────────────────────────────────────────────────────────
  dyeTree: async (treeId, color, cost) => {
    const state = get()
    const tree = state.trees.find((t) => t.id === treeId && t.owner)
    if (!tree) { state.flash('that tree is no longer here'); return }
    const age = (Date.now() - tree.plantedAt) / 1000
    if (age < 90) { state.flash('let this tree grow first'); return }
    if (state.gold < cost) { state.flash(`need ${cost} gold to dye this tree`); return }

    const goldBefore = state.gold
    set((s) => ({
      trees: s.trees.map((t) => t.id === treeId ? { ...t, dye: color } : t),
      gold: s.gold - cost,
      dyeingTreeId: null,
      previewColor: null,
    }))
    state.flash(`dyed a tree · -${cost} gold`)

    if (bridge.online) {
      const res = await bridge.dye(treeId, color, cost)
      if (!res.ok) {
        set((s) => ({
          trees: s.trees.map((t) => t.id === treeId ? { ...t, dye: tree.dye ?? null } : t),
          gold: goldBefore,
        }))
        get().flash(res.error === 'tree too young' ? 'let this tree grow first' :
                     res.error === 'not your tree'  ? 'that tree is not yours' :
                     res.error || 'could not dye tree')
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },
}))

// Persist to localStorage. Online, trees + gold + rocks live on the server, so
// we only cache identity + preferences; offline we cache everything.
let saveTimeout = null
useStore.subscribe((s) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    try {
      const base = {
        color: s.color,
        name: s.name,
        viewMode: s.viewMode,
        fireflies: s.fireflies,
        muted: s.muted,
        shadows: s.shadows,
        grassDensity: s.grassDensity,
        effects: s.effects,
        particles: s.particles,
        joystickEnabled: s.joystickEnabled,
        customSpawn: s.customSpawn,
        playtimeSeconds: s.playtimeSeconds,
      }
      if (!s.online) {
        base.gold = s.gold
        base.trees = s.trees
        base.discovered = s.discovered
        base.lastBonus = s.lastBonus
        base.placedRocks = s.placedRocks // offline: keep rocks locally
        base.plots = s.plots // offline: keep plots locally
      }
      localStorage.setItem(LS_KEY, JSON.stringify(base))
    } catch {
      /* ignore quota / private mode */
    }
  }, 1000)
})

// Periodically update playtime and save to localStorage
setInterval(() => {
  if (!bridge.online) {
    useStore.setState((s) => ({ playtimeSeconds: s.playtimeSeconds + 1 }))
  }
}, 1000)
