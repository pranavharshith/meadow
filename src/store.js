import { create } from 'zustand'
import { P } from './player-state'
import { LANDMARKS } from './world/places'
import { bridge } from './net/bridge'
import { maskProfanity, clientChatCooldown } from './net/moderation'

const LS_KEY = 'meadow-save-v1'
const GROW_SECONDS = 90
const WATER_COOLDOWN = 4000 // ms between watering (client-side pre-check)
const WATER_BOOST = 18000 // ms of growth granted per watering (mirrors server)
const WORLD_CHAT_COST = 3
const CHAT_MAX = 60

// Cut reward gold
const CUT_GROWN_REWARD = 8
const CUT_SAPLING_REWARD = 2
const CUT_RANGE = 4.0 // world units

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

  // progression (server-owned when online; localStorage fallback offline)
  gold: saved.gold ?? 0,
  color: saved.color ?? randomColor(),
  name: saved.name ?? 'wanderer',
  trees: saved.trees ?? [],
  discovered: saved.discovered ?? [],
  lastBonus: saved.lastBonus ?? '', // only used offline; server tracks per-day online
  placedRocks: saved.placedRocks ?? [],

  // shop
  shopOpen: false,
  selectedItem: { type: 'tree', id: 'broadleaf', shape: 0, cost: 0 },

  // transient UI
  toast: null,
  mapOpen: false,
  navTarget: null,
  waterEvent: null,
  cuttingId: null, // id of tree currently being cut (for animation)

  // Interactive selection in the world: which user-planted tree / placed rock
  // is currently picked (for cutting or future actions). Null when nothing
  // is selected. `kind` is 'tree' or 'rock'.
  selection: null,

  // networking status
  online: false,
  connectionStatus: 'offline',
  playerCount: 1,
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
  setShopOpen: (v) => set({ shopOpen: v }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: null }),

  setName: (name) => {
    const cleaned = (name || '').slice(0, 18) || 'wanderer'
    set({ name: cleaned })
    bridge.saveIdentity(cleaned, get().color)
  },
  setColor: (color) => {
    set({ color })
    bridge.saveIdentity(get().name, color)
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
  // Server is the source of truth for gold + discovered. Overwrites local.
  hydrateProfile: ({ gold, name, color, discovered }) =>
    set((s) => ({
      gold: gold ?? s.gold,
      name: name ?? s.name,
      color: color ?? s.color,
      discovered: discovered ?? s.discovered,
    })),
  setGold: (gold) => set({ gold }),
  setTrees: (trees) => set({ trees }),
  addTree: (t) =>
    set((s) => (s.trees.some((x) => x.id === t.id) ? {} : { trees: [...s.trees, t] })),
  removeTreeLocal: (id) => set((s) => ({ trees: s.trees.filter((t) => t.id !== id), cuttingId: null })),
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

  plantTree: async () => {
    const state = get()
    const sel = state.selectedItem

    // If a rock is selected, delegate to placeRock instead
    if (sel.type === 'rock') {
      get().placeRock()
      return
    }

    const cost = sel.cost ?? 0
    if (state.gold < cost) {
      state.flash(`need ${cost} gold to plant this tree`)
      return
    }

    const trees = state.trees
    const baseAngle = P.avatarYaw
    const dist = 1.8
    const MIN_SPACING = 2.5

    // Find a clear spot around the player
    let px, pz, found = false
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = baseAngle + attempt * (Math.PI / 4)
      px = P.pos.x + Math.sin(angle) * dist
      pz = P.pos.z + Math.cos(angle) * dist
      const tooClose = trees.some((t) => Math.hypot(t.x - px, t.z - pz) < MIN_SPACING)
      if (!tooClose) { found = true; break }
    }
    if (!found) {
      state.flash('too crowded here — move somewhere else')
      return
    }

    const t = {
      id: genId(),
      x: px,
      z: pz,
      plantedAt: Date.now(),
      scale: 1.4 + Math.random() * 0.8,
      variant: (Math.random() * 3) | 0,
      shape: sel.shape ?? 0,
      owner: true,
    }

    const goldBefore = state.gold
    // Optimistic: deduct cost, add tree, then credit the +5 plant reward
    const PLANT_REWARD = 5
    set((s) => ({ trees: [...s.trees, t], gold: s.gold - cost + PLANT_REWARD }))
    const costStr = cost > 0 ? ` · -${cost} gold` : ''
    state.flash(`planted a sapling${costStr} · +${PLANT_REWARD} gold`)

    if (bridge.online) {
      const res = await bridge.plant(t)
      if (!res.ok) {
        // Revert
        set((s) => ({
          trees: s.trees.filter((x) => x.id !== t.id),
          gold: goldBefore,
        }))
        get().flash(res.error === 'too crowded' ? 'too crowded here' : 'could not plant')
        return
      }
      // Reconcile gold with server truth
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
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
      if (!rock) { set({ selection: null }); return }
      set((s) => ({
        placedRocks: s.placedRocks.filter((r) => r.id !== rock.id),
        gold: s.gold + 3,
        selection: null,
      }))
      state.flash('removed a rock · +3 gold')
      return
    }

    // Tree
    const tree = state.trees.find((t) => t.id === sel.id && t.owner)
    if (!tree) {
      set({ selection: null })
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

    setTimeout(() => {
      set((s) => ({
        trees: s.trees.filter((t) => t.id !== tree.id),
        cuttingId: null,
      }))
    }, 850)
  },

  // Kept as a thin alias so anywhere old code / hooks still called it
  // (like existing UI hint text) continues to work — routes to cutSelection.
  cutNearestTree: () => get().cutSelection(),

  // ── Place a rock from the shop ─────────────────────────────────────────
  placeRock: () => {
    const state = get()
    const sel = state.selectedItem
    if (sel.type !== 'rock') return

    const cost = sel.cost ?? 5
    if (state.gold < cost) {
      state.flash(`need ${cost} gold to place this rock`)
      return
    }

    // Find a spot slightly in front of the player
    const dist = 2.2
    const px = P.pos.x + Math.sin(P.avatarYaw) * dist
    const pz = P.pos.z + Math.cos(P.avatarYaw) * dist

    // Check not too close to another placed rock
    const tooClose = state.placedRocks.some(
      (r) => Math.hypot(r.x - px, r.z - pz) < 1.8
    )
    if (tooClose) {
      state.flash('too close to another rock')
      return
    }

    const rock = {
      id: genId(),
      x: px,
      z: pz,
      rockShape: sel.rockShape ?? 2,
      rot: Math.random() * Math.PI * 2,
      sx: 0.7 + Math.random() * 0.5,
      sy: 0.5 + Math.random() * 0.4,
      sz: 0.7 + Math.random() * 0.5,
      matIdx: (Math.random() * 3) | 0,
    }

    set((s) => ({
      placedRocks: [...s.placedRocks, rock],
      gold: s.gold - cost,
    }))
    state.flash(`placed a rock · -${cost} gold`)
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

    const goldBefore = state.gold
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
          gold: goldBefore,
        }))
        // Surface the real reason instead of a generic message so the player
        // (and we) know if it's a cooldown, an ID mismatch, or something else.
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

    const goldBefore = state.gold
    if (scope === 'world') set((s) => ({ gold: s.gold - WORLD_CHAT_COST }))

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
        // Revert gold on world-chat failure
        if (scope === 'world') set({ gold: goldBefore })
        const errMap = {
          'chat cooldown': 'slow down — one message at a time',
          'not enough gold': `world chat costs ${WORLD_CHAT_COST} gold`,
          'bad text': 'message rejected',
        }
        get().flash(errMap[res.error] || 'could not send')
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },

  discoverLandmark: async (id) => {
    if (get().discovered.includes(id)) return
    const lm = LANDMARKS.find((l) => l.id === id)
    const goldBefore = get().gold

    // Optimistic
    set((s) => ({ discovered: [...s.discovered, id], gold: s.gold + 20 }))
    get().flash(`discovered ${lm ? lm.name : 'a place'} · +20 gold`)

    if (bridge.online) {
      const res = await bridge.discover(id)
      if (!res.ok) {
        set((s) => ({
          discovered: s.discovered.filter((x) => x !== id),
          gold: goldBefore,
        }))
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
  },

  claimDailyBonus: async () => {
    // Online: server decides. Offline: use localStorage-tracked date.
    if (bridge.online) {
      const res = await bridge.claimDaily()
      if (res && res.ok && typeof res.gold === 'number') {
        const prev = get().gold
        set({ gold: res.gold })
        if (res.gold > prev) get().flash('welcome back · +10 gold')
      }
      return
    }
    const today = todayStr()
    if (get().lastBonus === today) return
    const first = get().lastBonus === ''
    set((s) => ({ lastBonus: today, gold: s.gold + 10 }))
    get().flash(first ? 'welcome to the meadow · +10 gold' : 'welcome back · +10 gold')
  },
}))

// Persist to localStorage. Online, trees + gold live on the server, so we
// only cache identity + preferences; offline we cache everything.
useStore.subscribe((s) => {
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
      placedRocks: s.placedRocks,
    }
    if (!s.online) {
      base.gold = s.gold
      base.trees = s.trees
      base.discovered = s.discovered
      base.lastBonus = s.lastBonus
    }
    localStorage.setItem(LS_KEY, JSON.stringify(base))
  } catch {
    /* ignore quota / private mode */
  }
})
