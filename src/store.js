import { create } from 'zustand'
import { P } from './player-state'
import { LANDMARKS } from './world/places'

const LS_KEY = 'meadow-save-v1'
const GROW_SECONDS = 90
const WATER_COOLDOWN = 4000 // ms between watering
const WATER_BOOST = 18000 // ms of growth granted per watering

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
  muted: false,
  gold: saved.gold ?? 0,
  color: saved.color ?? randomColor(),
  name: saved.name ?? 'wanderer',
  trees: saved.trees ?? [],
  discovered: saved.discovered ?? [],
  lastBonus: saved.lastBonus ?? '',
  toast: null, // transient message shown in the HUD

  setView: (v) => set({ viewMode: v }),
  cycleView: () =>
    set((s) => ({
      viewMode: s.viewMode === 'third' ? 'first' : s.viewMode === 'first' ? 'top' : 'third',
    })),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setName: (name) => set({ name: (name || '').slice(0, 18) || 'wanderer' }),
  setColor: (color) => set({ color }),

  flash: (msg) => {
    set({ toast: { msg, at: Date.now() } })
    setTimeout(() => {
      if (get().toast && Date.now() - get().toast.at >= 2600) set({ toast: null })
    }, 2700)
  },

  plantTree: () => {
    const x = P.pos.x + Math.sin(P.avatarYaw) * 1.4
    const z = P.pos.z + Math.cos(P.avatarYaw) * 1.4
    const t = {
      id: genId(),
      x,
      z,
      plantedAt: Date.now(),
      scale: 0.9 + Math.random() * 0.7,
      variant: (Math.random() * 3) | 0,
    }
    set((s) => ({ trees: [...s.trees, t], gold: s.gold + 5 }))
    get().flash('planted a sapling · +5 gold')
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
    }))
    get().flash('watered a sapling · +1 gold')
  },

  discoverLandmark: (id) => {
    if (get().discovered.includes(id)) return
    const lm = LANDMARKS.find((l) => l.id === id)
    set((s) => ({ discovered: [...s.discovered, id], gold: s.gold + 20 }))
    get().flash(`discovered ${lm ? lm.name : 'a place'} · +20 gold`)
  },

  claimDailyBonus: () => {
    const today = todayStr()
    if (get().lastBonus === today) return
    const first = get().lastBonus === ''
    set((s) => ({ lastBonus: today, gold: s.gold + 10 }))
    get().flash(first ? 'welcome to the meadow · +10 gold' : 'welcome back · +10 gold')
  },
}))

// Persist identity + world to localStorage on any relevant change.
useStore.subscribe((s) => {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        gold: s.gold,
        color: s.color,
        name: s.name,
        trees: s.trees,
        discovered: s.discovered,
        lastBonus: s.lastBonus,
        viewMode: s.viewMode,
      })
    )
  } catch {
    /* ignore quota / private mode */
  }
})
