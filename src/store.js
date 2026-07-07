import { create } from 'zustand'
import { P } from './player-state'
import { LANDMARKS } from './world/places'
import { bridge } from './net/bridge'

const LS_KEY = 'meadow-save-v1'
const GROW_SECONDS = 90
const WATER_COOLDOWN = 4000 // ms between watering
const WATER_BOOST = 18000 // ms of growth granted per watering
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
  // 'third' (follow) | 'first' | 'top' (map)
  viewMode: saved.viewMode ?? 'third',
  muted: saved.muted ?? false,
  fireflies: saved.fireflies ?? true,
  // Quality settings
  shadows: saved.shadows ?? true,
  grassDensity: saved.grassDensity ?? 'full', // 'full' | 'half' | 'off'
  effects: saved.effects ?? true,
  particles: saved.particles ?? true, // butterflies, petals, birds
  settingsOpen: false,
  gold: saved.gold ?? 0,
  color: saved.color ?? randomColor(),
  name: saved.name ?? 'wanderer',
  trees: saved.trees ?? [],
  discovered: saved.discovered ?? [],
  lastBonus: saved.lastBonus ?? '',
  toast: null, // transient message shown in the HUD
  mapOpen: false,
  navTarget: null, // { id, x, z, name } or null
  waterEvent: null, // { x, y, z, at } — triggers water particle effect

  // networking-facing
  online: false,
  connectionStatus: 'offline', // 'connected' | 'reconnecting' | 'offline'
  playerCount: 1,
  chat: [], // { id, scope, name, color, text, at }
  chatScope: 'region', // 'region' | 'world'

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
    set({ name: (name || '').slice(0, 18) || 'wanderer' })
    bridge.saveProfile()
  },
  setColor: (color) => {
    set({ color })
    bridge.saveProfile()
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
  hydrateProfile: ({ gold, name, color }) =>
    set((s) => ({
      gold: gold ?? s.gold,
      name: name ?? s.name,
      color: color ?? s.color,
    })),
  setTrees: (trees) => set({ trees }),
  addTree: (t) =>
    set((s) => (s.trees.some((x) => x.id === t.id) ? {} : { trees: [...s.trees, t] })),
  addChatMessage: (m) =>
    set((s) => ({ chat: [...s.chat, m].slice(-CHAT_MAX) })),

  plantTree: () => {
    const trees = get().trees
    const baseAngle = P.avatarYaw
    const dist = 1.8
    const MIN_SPACING = 2.5

    // Try up to 8 angles around the player to find a clear spot
    let px, pz, found = false
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = baseAngle + attempt * (Math.PI / 4)
      px = P.pos.x + Math.sin(angle) * dist
      pz = P.pos.z + Math.cos(angle) * dist
      const tooClose = trees.some(
        (t) => Math.hypot(t.x - px, t.z - pz) < MIN_SPACING
      )
      if (!tooClose) { found = true; break }
    }
    if (!found) {
      get().flash('too crowded here — move somewhere else')
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
    set((s) => ({ trees: [...s.trees, t], gold: s.gold + 5 }))
    get().flash('planted a sapling · +5 gold')
    bridge.plant(t)
    bridge.saveProfile()
  },

  // Water the nearest young sapling near the player to help it grow faster.
  waterNearest: () => {
    const now = Date.now()
    if (now - lastWaterAt < WATER_COOLDOWN) return
    const trees = get().trees
    let best = null
    let bestD = 9
    for (const t of trees) {
      const age = now - t.plantedAt
      if (age >= GROW_SECONDS * 1000) continue // already grown
      const d = (t.x - P.pos.x) ** 2 + (t.z - P.pos.z) ** 2
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    if (!best) {
      get().flash('no young sapling nearby to water')
      return
    }
    lastWaterAt = now
    set((s) => ({
      trees: s.trees.map((t) =>
        t.id === best.id ? { ...t, plantedAt: t.plantedAt - WATER_BOOST } : t
      ),
      gold: s.gold + 1,
      waterEvent: { x: best.x, z: best.z, at: now },
    }))
    get().flash('watered a sapling · +1 gold')
    bridge.saveProfile()
  },

  // Send a chat message. World chat costs gold (spam control).
  sendChat: (text) => {
    const clean = (text || '').trim().slice(0, 160)
    if (!clean) return
    const scope = get().chatScope
    if (scope === 'world') {
      if (get().gold < WORLD_CHAT_COST) {
        get().flash(`world chat costs ${WORLD_CHAT_COST} gold`)
        return
      }
      set((s) => ({ gold: s.gold - WORLD_CHAT_COST }))
      bridge.saveProfile()
    }
    const msg = {
      id: genId(),
      scope,
      name: get().name,
      color: get().color,
      text: clean,
      at: Date.now(),
      self: true,
    }
    get().addChatMessage(msg)
    const accepted = bridge.sendChat(scope, clean)
    if (!accepted && !get().online) {
      // offline: nothing else to do, message already shown locally
    }
  },

  discoverLandmark: (id) => {
    if (get().discovered.includes(id)) return
    const lm = LANDMARKS.find((l) => l.id === id)
    set((s) => ({ discovered: [...s.discovered, id], gold: s.gold + 20 }))
    get().flash(`discovered ${lm ? lm.name : 'a place'} · +20 gold`)
    bridge.saveProfile()
  },

  claimDailyBonus: () => {
    const today = todayStr()
    if (get().lastBonus === today) return
    const first = get().lastBonus === ''
    set((s) => ({ lastBonus: today, gold: s.gold + 10 }))
    get().flash(first ? 'welcome to the meadow · +10 gold' : 'welcome back · +10 gold')
    bridge.saveProfile()
  },
}))

// Persist to localStorage. Online, trees live on the server, so we only cache
// identity + progress; offline we cache everything so the world survives.
useStore.subscribe((s) => {
  try {
    const base = {
      gold: s.gold,
      color: s.color,
      name: s.name,
      discovered: s.discovered,
      lastBonus: s.lastBonus,
      viewMode: s.viewMode,
      fireflies: s.fireflies,
      muted: s.muted,
      shadows: s.shadows,
      grassDensity: s.grassDensity,
      effects: s.effects,
      particles: s.particles,
    }
    if (!s.online) base.trees = s.trees
    localStorage.setItem(LS_KEY, JSON.stringify(base))
  } catch {
    /* ignore quota / private mode */
  }
})
