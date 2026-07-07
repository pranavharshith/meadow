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

  // transient UI
  toast: null,
  mapOpen: false,
  navTarget: null,
  waterEvent: null,

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
      shape: (Math.random() * 4) | 0,
      owner: true,
    }

    const goldBefore = state.gold
    // Optimistic: add tree + credit gold locally
    set((s) => ({ trees: [...s.trees, t], gold: s.gold + 5 }))
    state.flash('planted a sapling · +5 gold')

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
        get().flash(res.error === 'water cooldown' ? 'wait a moment before watering again' : 'could not water')
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
