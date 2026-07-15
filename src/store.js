import { create } from 'zustand'
import { P, placement } from './player-state'
import { LANDMARKS } from './world/places'
import { bridge } from './net/bridge'
import { maskProfanity, clientChatCooldown } from './net/moderation'
import { terrainHeight, syncTerrainPlots } from './world/noise'
import { normalizePlot, normalizePlots } from './world/plot-utils'
import { plazaFloorHeight } from './world/SpawnPlaza'

const LS_KEY = 'meadow-save-v1'
const GROW_SECONDS = 90
const WATER_COOLDOWN = 4000 // ms between watering (client-side pre-check)
const WATER_BOOST = 18000 // ms of growth granted per watering (mirrors server)
const WORLD_CHAT_COST = 3
/** Max chat messages kept in the local HUD list (history), not text length. */
const CHAT_HISTORY_MAX = 60
/** Max characters per message — must match server RPC limit (160). */
export const CHAT_TEXT_MAX = 160
export const WORLD_CHAT_GOLD_COST = WORLD_CHAT_COST

// Gold sink costs
const TELEPORT_COST = 15
const SET_SPAWN_COST = 40
const PLOT_COST = 250
export const TELEPORT_GOLD_COST = TELEPORT_COST
export const DAILY_BONUS_GOLD = 10
export const DISCOVER_GOLD = 20

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

// First-session walk: guide new players to The Lonely Oak after welcome.
// Missing/undefined on old saves → treat as 'done' so returning players are not nudged.
const FIRST_WALK_LANDMARK_ID = 'lonely-oak'

export const useStore = create((set, get) => ({
  // UI / HUD
  showNav: saved.showNav ?? true,
  hasCompletedWelcome: saved.hasCompletedWelcome ?? !!saved.name,
  isUpdatingName: false,
  // 'active' | 'done' | 'dismissed' — only new welcomes start as 'active'
  firstWalkQuest: saved.firstWalkQuest ?? 'done',
  // Soft ladder after first walk: plant → water → craft → plot → done | dismissed
  // Legacy saves (walk already finished, no softQuest key) skip the ladder.
  softQuest:
    saved.softQuest ??
    ((saved.firstWalkQuest ?? 'done') === 'active' ? null : 'done'),

  completeWelcome: () => {
    const lm = LANDMARKS.find((l) => l.id === FIRST_WALK_LANDMARK_ID)
    const alreadyFound = (get().discovered || []).includes(FIRST_WALK_LANDMARK_ID)
    const quest = alreadyFound ? 'done' : 'active'
    const nextSoft =
      quest === 'done' && (get().softQuest == null || get().softQuest === 'done')
        ? 'plant'
        : get().softQuest
    set({
      hasCompletedWelcome: true,
      firstWalkQuest: quest,
      ...(quest === 'done' && nextSoft === 'plant' ? { softQuest: 'plant' } : {}),
      ...(quest === 'active' && lm
        ? { navTarget: { id: lm.id, x: lm.x, z: lm.z, name: lm.name } }
        : {}),
    })
    const st = loadSave()
    st.hasCompletedWelcome = true
    st.firstWalkQuest = quest
    if (quest === 'done' && nextSoft === 'plant') st.softQuest = 'plant'
    localStorage.setItem(LS_KEY, JSON.stringify(st))
    if (quest === 'active' && lm) {
      // Delay so welcome UI unmounts first
      setTimeout(() => {
        get().flash(`First walk: head to ${lm.name}`)
      }, 400)
    } else if (quest === 'done' && nextSoft === 'plant') {
      setTimeout(() => get().flash('Next · plant a free oak (G → Trees)'), 400)
    }
  },

  dismissFirstWalk: () => {
    set({ firstWalkQuest: 'dismissed', softQuest: 'plant' })
    const st = loadSave()
    st.firstWalkQuest = 'dismissed'
    st.softQuest = 'plant'
    localStorage.setItem(LS_KEY, JSON.stringify(st))
    // Clear nav only if still aimed at the first-walk landmark
    const nav = get().navTarget
    if (nav && nav.id === FIRST_WALK_LANDMARK_ID) set({ navTarget: null })
    setTimeout(() => get().flash('Next · plant a free oak (G → Trees)'), 500)
  },

  completeFirstWalk: () => {
    if (get().firstWalkQuest !== 'active') return
    set({ firstWalkQuest: 'done', softQuest: 'plant' })
    const st = loadSave()
    st.firstWalkQuest = 'done'
    st.softQuest = 'plant'
    localStorage.setItem(LS_KEY, JSON.stringify(st))
    const lm = LANDMARKS.find((l) => l.id === FIRST_WALK_LANDMARK_ID)
    get().flash(lm ? `You found ${lm.name} — nice walking` : 'First walk complete')
    setTimeout(() => {
      get().flash('Next · plant a free oak · open Create with G')
    }, 2200)
  },

  /** Advance soft ladder when the matching action succeeds. */
  advanceSoftQuest: (step) => {
    const order = ['plant', 'water', 'craft', 'plot']
    const cur = get().softQuest
    if (cur !== step) return
    const idx = order.indexOf(step)
    if (idx < 0) return
    const next = idx + 1 < order.length ? order[idx + 1] : 'done'
    set({ softQuest: next })
    const st = loadSave()
    st.softQuest = next
    localStorage.setItem(LS_KEY, JSON.stringify(st))
    const tips = {
      water: 'Next · water a young sapling (R near your tree)',
      craft: 'Next · cut a tree for wood, then Craft in Create (Q)',
      plot: 'Next · claim a personal plot (Create → Land)',
      done: 'You know the basics — explore, craft, and grow the meadow',
    }
    const tip = tips[next]
    if (tip) setTimeout(() => get().flash(tip), 900)
  },

  dismissSoftQuest: () => {
    const cur = get().softQuest
    if (!cur || cur === 'done' || cur === 'dismissed') return
    set({ softQuest: 'dismissed' })
    const st = loadSave()
    st.softQuest = 'dismissed'
    localStorage.setItem(LS_KEY, JSON.stringify(st))
  },

  startFirstWalkNav: () => {
    const lm = LANDMARKS.find((l) => l.id === FIRST_WALK_LANDMARK_ID)
    if (!lm) return
    set({ navTarget: { id: lm.id, x: lm.x, z: lm.z, name: lm.name } })
    get().flash(`Navigating to ${lm.name}`)
  },

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
  keybinds: saved.keybinds || { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD' },

  // progression (server-owned when online; localStorage fallback offline)
  gold: saved.gold ?? 0,
  wood: saved.wood ?? 0,
  stone: saved.stone ?? 0,
  color: saved.color ?? randomColor(),
  headColor: saved.headColor ?? null,
  bodyColor: saved.bodyColor ?? null,
  legColor: saved.legColor ?? null,
  hatId: saved.hatId ?? null,
  name: saved.name ?? '',
  trees: saved.trees ?? [],
  discovered: saved.discovered ?? [],
  lastBonus: saved.lastBonus ?? '', // calendar day (UTC) of last daily claim — offline + UI
  // rocks are server-owned when online (like trees). localStorage for offline.
  placedRocks: saved.placedRocks ?? [],

  // custom spawn point set by the player (null = default spawn at origin)
  customSpawn: saved.customSpawn ?? null,

  // personal plots (server-owned when online; localStorage for offline)
  plots: (() => {
    const initial = normalizePlots(saved.plots ?? [])
    syncTerrainPlots(initial)
    return initial
  })(),

  // crafted items
  craftedItems: saved.craftedItems ?? [],
  cutResources: saved.cutResources ?? {},

  // Unified Create hub (G = trees/nature, Q = craft tab). One name: Create.
  createOpen: false,
  createTab: 'trees', // trees | rocks | craft | plots | cosmetics
  isProcessingTeleport: false,
  teleportFlash: false,
  selectedItem: { type: 'tree', id: 'broadleaf', shape: 0, cost: 0 },

  // social & profile
  joinDate: saved.joinDate ?? null,
  treesPlanted: saved.treesPlanted ?? 0,
  friends: [],
  friendRequests: [],
  ownedCosmetics: [],
  onlineUserIds: new Set(),
  socialOpen: false,
  profileModal: null, // { id: string } or null

  // playtime (offline only)
  playtimeSeconds: saved.playtimeSeconds ?? 0,

  // world tree
  worldTreeWood: 0,
  worldTreeDonors: new Set(),
  setWorldTreeWood: (val) => set({ worldTreeWood: val }),
  addWorldTreeDonor: (id) => set(s => {
    const next = new Set(s.worldTreeDonors)
    next.add(id)
    return { worldTreeDonors: next }
  }),
  setWorldTreeDonors: (arr) => set({ worldTreeDonors: new Set(arr) }),

  // transient UI
  toast: null,
  mapOpen: false,
  navTarget: null,
  waterEvent: null,
  inputContext: 'GAME', // 'GAME', 'UI', 'CHAT'
  isDraggingCamera: false,
  
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
  connecting: false,
  connectionStatus: 'offline', // offline | connecting | connected | reconnecting
  connectionNote: null, // human reason when offline/failed
  playerCount: 1,
  renderedCount: 0,
  chat: [],
  chatError: null, // last send failure shown in chat panel
  muteRevision: 0, // bumps when mute list changes (Chat re-filter)

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
  setJoystickEnabled: (v) => set({ joystickEnabled: v }),
  setKeybind: (action, code) => set(s => ({ keybinds: { ...s.keybinds, [action]: code } })),
  toggleEffects: () => set((s) => ({ effects: !s.effects })),
  toggleParticles: () => set((s) => ({ particles: !s.particles })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setMapOpen: (v) => set({ mapOpen: v }),
  setNavTarget: (target) => set({ navTarget: target }),
  clearNav: () => set({ navTarget: null }),
  setCreateOpen: (open, tab) =>
    set((s) => {
      const nextTab = tab != null ? tab : s.createTab || 'trees'
      const isOpen = !!open
      return {
        createOpen: isOpen,
        createTab: isOpen ? nextTab : s.createTab,
        inputContext: isOpen ? 'UI' : 'GAME',
      }
    }),
  setCreateTab: (tab) => set({ createTab: tab }),
  setSocialOpen: (v) => set({ socialOpen: v, inputContext: v ? 'UI' : 'GAME' }),
  setProfileModal: (v) => set({ profileModal: v, inputContext: v ? 'UI' : 'GAME' }),
  setFriends: (friends) => set({ friends }),
  setFriendRequests: (friendRequests) => set({ friendRequests }),
  setOnlineUserIds: (onlineUserIds) => set({ onlineUserIds }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setSelection: (sel) => set({ selection: sel }),
  clearSelection: () => set({ selection: null }),
  setDyeingTreeId: (id) => set({ dyeingTreeId: id, previewColor: null }),
  setPreviewColor: (color) => set({ previewColor: color }),
  cancelDyeing: () => set({ dyeingTreeId: null, previewColor: null }),
  setInputContext: (ctx) => set({ inputContext: ctx }),
  setIsDraggingCamera: (v) => set({ isDraggingCamera: v }),

  setName: async (name) => {
    const state = get()
    const cleaned = (name || '').trim().slice(0, 18)
    if (cleaned === state.name) return
    
    if (!bridge.online) {
      set({ name: cleaned })
      return
    }

    const previousName = state.name
    // Optimistic Update
    set({ name: cleaned, isUpdatingName: true })

    try {
      // Execute immediately using bridge.saveIdentity
      const { error } = await bridge.saveIdentity(cleaned, state.color, state.headColor, state.bodyColor, state.legColor, state.hatId)
      if (error) throw error
      
      // We don't have supabaseClient here, but if the trigger fires, bridge.saveIdentity will hydrate it.
      // Wait, bridge.saveIdentity doesn't return the overridden name because update_profile doesn't return the overridden name if it was a trigger?
      // Actually update_profile returns the player row, so hydrateProfile inside saveIdentity will automatically fix it.
    } catch (error) {
      // Rollback (flash is handled by saveIdentity already if it was an error)
      set({ name: previousName })
    } finally {
      set({ isUpdatingName: false })
    }
  },
  setColor: (color) => {
    const state = get()
    if (!bridge.online) {
      set({ color })
      return
    }
    set({ color })
    bridge.saveIdentity(state.name, color, state.headColor, state.bodyColor, state.legColor, state.hatId)
  },
  buyCosmetic: async (type, id, colorVal) => {
    const state = get()

    if (!bridge.online) {
      // Free "no hat" still works offline; paid paints/hats need the shared garden
      if (type === 'hat' && (id === 'none' || id == null)) {
        set({ hatId: null })
        state.flash('hat removed')
        return true
      }
      state.flash('style purchases need online mode — free colours are in your profile')
      return false
    }

    const res = await bridge.buyCosmetic(type, id, colorVal)
    if (!res.ok) {
      get().flash(res.error || 'purchase failed')
      return false
    }

    get().flash('customised avatar')
    return true
  },
  setChatScope: (chatScope) => set({ chatScope, chatError: null }),
  setChatError: (chatError) => set({ chatError }),
  clearChatError: () => set({ chatError: null }),
  setMuteRevision: (muteRevision) => set({ muteRevision }),

  /**
   * @param {string} msg
   * @param {'info'|'success'|'error'|'warn'} [type]
   */
  flash: (msg, type = 'info') => {
    // Auto-detect type from common connection phrases when not specified
    let t = type
    if (type === 'info' && typeof msg === 'string') {
      const m = msg.toLowerCase()
      if (m.includes('could not') || m.includes('failed') || m.includes('need ') || m.includes('not enough'))
        t = 'error'
      else if (m.includes('connected') || m.includes('welcome') || m.includes('discovered') || m.includes('reconnected'))
        t = 'success'
      else if (m.includes('reconnect') || m.includes('connecting') || m.includes('lost'))
        t = 'warn'
    }
    set({ toast: { msg, type: t, at: Date.now() } })
    setTimeout(() => {
      if (get().toast && Date.now() - get().toast.at >= 2800) set({ toast: null })
    }, 2900)
  },

  // --- networking hydration (called by <Net/>) ---
  setOnline: (online) => set((s) => ({
    online,
    connecting: false,
    connectionStatus: online ? 'connected' : (s.connectionStatus === 'reconnecting' ? 'reconnecting' : 'offline'),
    connectionNote: online ? null : s.connectionNote,
  })),
  setConnecting: (connecting) => set((s) => ({
    connecting: !!connecting,
    connectionStatus: connecting ? 'connecting' : s.connectionStatus,
  })),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setConnectionNote: (connectionNote) => set({ connectionNote }),
  goOffline: (reason) => set({
    online: false,
    connecting: false,
    connectionStatus: 'offline',
    connectionNote: reason || 'Could not connect — playing offline',
  }),
  setPlayerCount: (playerCount) => set({ playerCount }),
  setRenderedCount: (renderedCount) => set({ renderedCount }),
  // Server is the source of truth for gold + discovered. Overwrites local.
  hydrateProfile: ({ gold, wood, stone, name, color, headColor, bodyColor, legColor, hatId, discovered, customSpawn, joinDate, treesPlanted, ownedCosmetics, lastWaterAt: serverLastWaterAt }) =>
    set((s) => {
      if (serverLastWaterAt !== undefined) {
        lastWaterAt = new Date(serverLastWaterAt).getTime();
      }
      return {
        gold: gold ?? s.gold,
        wood: wood ?? s.wood,
        stone: stone ?? s.stone,
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
        ownedCosmetics: ownedCosmetics ?? s.ownedCosmetics,
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

  // --- Plot server sync (G1: normalize + push into height cache immediately) ---
  setPlots: (plots) => {
    const next = normalizePlots(plots)
    syncTerrainPlots(next)
    set({ plots: next })
  },
  addPlot: (p) => {
    const n = normalizePlot(p)
    if (!n) return
    set((s) => {
      if (s.plots.some((x) => x.id === n.id)) return {}
      const next = [...s.plots, n]
      syncTerrainPlots(next)
      return { plots: next }
    })
  },
  removePlotLocal: (id) =>
    set((s) => {
      const next = s.plots.filter((p) => p.id !== id)
      syncTerrainPlots(next)
      return { plots: next }
    }),

  // --- Crafted Items server sync ---
  setCraftedItems: (items) => set({ craftedItems: items }),
  addCraftedItem: (i) =>
    set((s) => (s.craftedItems.some((x) => x.id === i.id) ? {} : { craftedItems: [...s.craftedItems, i] })),
  removeCraftedItemLocal: (id) => set((s) => ({ craftedItems: s.craftedItems.filter((i) => i.id !== id) })),

  // --- Cut Resources server sync ---
  setCutResources: (cuts) => set({ cutResources: cuts }),
  addCutResource: (key, cut) =>
    set((s) => ({ cutResources: { ...s.cutResources, [key]: cut } })),

  addChatMessage: (m) =>
    set((s) => ({ chat: [...s.chat, m].slice(-CHAT_HISTORY_MAX) })),

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
    if (sel.type === 'crafted') {
      const cw = sel.costWood ?? 0
      const cs = sel.costStone ?? 0
      if (state.wood < cw || state.stone < cs) {
        const need = []
        if (state.wood < cw) need.push(`${cw - state.wood} more wood`)
        if (state.stone < cs) need.push(`${cs - state.stone} more stone`)
        state.flash(`need ${need.join(' and ')} to craft`)
        return
      }
      set({
        placementMode: 'crafted',
        placementSubject: { ...sel, kind: 'crafted' },
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
    } else if (mode === 'crafted') {
      await get()._finalizeCraft(px, pz, sub)
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
    // Free shapes award no gold (matches server #4). Paid shapes keep +5 bonus.
    const PLANT_REWARD = cost > 0 ? 5 : 0
    set((s) => ({
      trees: [...s.trees, t],
      gold: s.gold - cost + PLANT_REWARD,
      treesPlanted: (s.treesPlanted || 0) + 1,
    }))
    const costStr = cost > 0 ? ` · -${cost} gold` : ''
    const rewardStr = PLANT_REWARD > 0 ? ` · +${PLANT_REWARD} gold` : ''
    state.flash(`planted a sapling${costStr}${rewardStr}`)

    if (bridge.online) {
      const res = await bridge.plant(t)
      if (!res.ok) {
        set((s) => ({
          trees: s.trees.filter((x) => x.id !== t.id),
          gold: s.gold + cost - PLANT_REWARD,
          treesPlanted: Math.max(0, (s.treesPlanted || 1) - 1),
        }))
        const err = (res.error || '').toLowerCase()
        get().flash(
          err.includes('crowded') ? 'too crowded here'
            : err.includes('too far') ? 'too far away'
            : err.includes('position') ? 'move a little first'
            : err.includes('gold') ? 'not enough gold'
            : 'could not plant'
        )
        return
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
    }
    get().advanceSoftQuest('plant')
  },

  _finalizeCraft: async (px, pz, sub) => {
    const state = get()
    const costWood = sub.costWood ?? 0
    const costStone = sub.costStone ?? 0
    if (state.wood < costWood || state.stone < costStone) {
      const need = []
      if (state.wood < costWood) need.push(`${costWood - state.wood} more wood`)
      if (state.stone < costStone) need.push(`${costStone - state.stone} more stone`)
      state.flash(`need ${need.join(' and ')} to craft`)
      return
    }
    const item = {
      id: genId(),
      itemId: sub.id,
      x: px,
      z: pz,
      rot: P.avatarYaw,
      placedAt: Date.now(),
      owner: true,
    }
    set((s) => ({
      craftedItems: [...s.craftedItems, item],
      wood: s.wood - costWood,
      stone: s.stone - costStone,
    }))
    const bits = []
    if (costWood > 0) bits.push(`-${costWood} wood`)
    if (costStone > 0) bits.push(`-${costStone} stone`)
    state.flash(`placed ${sub.id.replace(/_/g, ' ')}${bits.length ? ` · ${bits.join(' · ')}` : ''}`)

    if (bridge.online) {
      const res = await bridge.placeCraftedItem(item, costWood, costStone)
      if (!res.ok) {
        set((s) => ({
          craftedItems: s.craftedItems.filter((x) => x.id !== item.id),
          wood: s.wood + costWood,
          stone: s.stone + costStone,
        }))
        const err = (res.error || '').toLowerCase()
        get().flash(
          err.includes('crowded') ? 'too crowded here'
            : err.includes('wood') || err.includes('stone') ? 'not enough materials'
            : err.includes('too far') ? 'too far away'
            : err.includes('position') ? 'move a little first'
            : res.error || 'could not place craft'
        )
        return
      }
      if (typeof res.wood === 'number') set({ wood: res.wood })
      if (typeof res.stone === 'number') set({ stone: res.stone })
    }
    get().advanceSoftQuest('craft')
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
        const err = (res.error || '').toLowerCase()
        const mapMsg =
          err.includes('cooldown') ? 'wait a moment before placing again'
          : err.includes('crowded') ? 'too crowded here'
          : err.includes('gold') ? `need ${cost} gold`
          : err.includes('too far') ? 'too far away'
          : err.includes('position') ? 'move a little first'
          : `rock failed: ${res.error || 'unknown'}`
        get().flash(mapMsg)
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
        if (import.meta.env.DEV) console.error('[buyPlot] server error:', res.error)
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
        shapeType: plot.shapeType ?? 0,
        width: plot.width,
        depth: plot.depth ?? plot.width,
        owner: true,
        name: get().name,
      })
      get().flash('plot claimed! 🏡')
      get().advanceSoftQuest('plot')
      return
    }
    const myPlots = state.plots.filter((p) => p.owner)
    if (myPlots.length >= 5) {
      state.flash('you can only own up to 5 plots')
      return
    }
    let cost = 0
    if (sub.shapeType === 0) cost = Math.round((3.14159 * sub.width * sub.width) * 0.8)
    else cost = Math.round((sub.width * 2 * sub.depth * 2) * 0.15)
    if (state.gold < cost) {
      state.flash(`need ${cost} gold for this plot size`)
      return
    }
    get().addPlot({
      id: genId(),
      x: px,
      z: pz,
      owner: true,
      shapeType: sub.shapeType ?? 0,
      width: sub.width,
      depth: sub.depth ?? sub.width,
      name: state.name,
    })
    set((s) => ({ gold: s.gold - cost }))
    state.flash(`plot claimed · -${cost} gold`)
    get().advanceSoftQuest('plot')
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
      const stoneBefore = state.stone
      set((s) => ({
        breakingId: rock.id,
        stone: s.stone + ROCK_REMOVE_REWARD,
        selection: null,
      }))
      state.flash(`removed a rock · +${ROCK_REMOVE_REWARD} stone`)

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
            // Revert animation + optimistic stone
            set((s) => ({
              breakingId: null,
              stone: stoneBefore,
            }))
            get().flash(res.error === 'not your rock' ? 'that rock is not yours' : 'could not remove rock')
          } else {
            // Server returns authoritative stone total (#5)
            if (typeof res.stone === 'number') set({ stone: res.stone })
            const elapsed = performance.now() - breakStart
            const remaining = Math.max(0, 500 - elapsed)
            if (remaining > 0) setTimeout(doRemoveRock, remaining)
            else doRemoveRock()
          }
        })
      } else {
        setTimeout(doRemoveRock, 500)
      }
      return
    } else if (sel.kind === 'tree') {
      const tree = state.trees.find((t) => t.id === sel.id)
      if (!tree) {
        state.flash('that tree is no longer here')
        set({ selection: null })
        return
      }
      if (!tree.owner) {
        if ((Date.now() - (tree.plantedAt || Date.now())) / 86400000 >= 2) return get().releaseSelection()
        state.flash('that tree is not yours')
        set({ selection: null })
        return
      }

      const now = Date.now()
      const age = (now - tree.plantedAt) / 1000
      const isGrownTree = age >= GROW_SECONDS
      const reward = isGrownTree ? CUT_GROWN_REWARD : CUT_SAPLING_REWARD
      const verb = isGrownTree ? 'cut down' : 'uprooted'

      // Play the fall animation, clear selection, credit optimistically
      set((s) => ({ cuttingId: tree.id, selection: null, wood: s.wood + reward }))
      state.flash(`${verb} a tree · +${reward} wood`)

      // Kick the server RPC in parallel with the animation
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
          if (typeof res.wood === 'number') set({ wood: res.wood })
          const elapsed = performance.now() - cutStart
          const remaining = Math.max(0, 850 - elapsed)
          setTimeout(doRemove, remaining)
        })
      } else {
        setTimeout(doRemove, 850)
      }
    }
  },

  // Kept as a thin alias so anywhere old code / hooks still called it
  // (like existing UI hint text) continues to work — routes to cutSelection.
  cutNearestTree: () => get().cutSelection(),

  cutProcedural: (chunkKey, localIndex, kind, idStr) => {
    const state = get()
    if (state.cutResources[idStr]) return // Already cut

    const reward = kind === 'tree' ? 3 : 2
    
    // Optimistic
    set((s) => ({
      cutResources: { ...s.cutResources, [idStr]: { cut_at: new Date().toISOString(), type: kind, chunk_key: chunkKey } },
      wood: kind === 'tree' ? s.wood + reward : s.wood,
      stone: kind === 'rock' ? s.stone + reward : s.stone
    }))
    state.flash(`harvested ${kind} · +${reward} ${kind === 'tree' ? 'wood' : 'stone'}`)

    if (bridge.online) {
      bridge.cutProceduralResource(idStr, kind, chunkKey).then((res) => {
        if (!res.ok) {
          // Rollback
          set((s) => {
            const nextCuts = { ...s.cutResources }
            delete nextCuts[idStr]
            return {
              cutResources: nextCuts,
              wood: kind === 'tree' ? s.wood - reward : s.wood,
              stone: kind === 'rock' ? s.stone - reward : s.stone
            }
          })
          get().flash(res.error || `could not harvest ${kind}`)
        } else {
          if (typeof res.wood === 'number') set({ wood: res.wood })
          if (typeof res.stone === 'number') set({ stone: res.stone })
        }
      })
    }
  },

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
          gold: s.gold - 1,
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
    get().advanceSoftQuest('water')
  },

  donateToWorldTree: async (amount) => {
    const n = Math.floor(Number(amount))
    if (!Number.isFinite(n) || n <= 0) {
      get().flash('enter a wood amount to donate')
      return { ok: false }
    }
    const state = get()
    if (!bridge.online) {
      get().flash('World Tree donations need online mode')
      return { ok: false }
    }
    if (state.wood < n) {
      get().flash(`need ${n} wood (have ${state.wood})`)
      return { ok: false }
    }
    const res = await bridge.donateToWorldTree(n)
    if (!res.ok) {
      const err = (res.error || '').toLowerCase()
      get().flash(
        err.includes('wood') ? 'not enough wood'
          : err.includes('signed') ? 'reconnecting — try again'
          : res.error || 'could not donate'
      )
      return { ok: false }
    }
    set((s) => ({
      wood: s.wood - n,
      worldTreeWood: (s.worldTreeWood || 0) + n,
    }))
    get().flash(`donated ${n} wood to the World Tree 🌳`)
    return { ok: true }
  },

  sendChat: async (text) => {
    let clean = (text || '').trim().slice(0, CHAT_TEXT_MAX)
    if (!clean) return { ok: false, error: 'empty' }
    clean = maskProfanity(clean)
    const state = get()
    const scope = state.chatScope
    set({ chatError: null })

    // Client-side pre-cooldown for instant feedback (server enforces the real one)
    if (!clientChatCooldown(scope)) {
      const err = 'slow down — one message at a time'
      set({ chatError: err })
      state.flash(err)
      return { ok: false, error: err }
    }

    // World chat is gold-gated; check locally for a nicer error, server enforces
    if (scope === 'world' && state.gold < WORLD_CHAT_COST) {
      const err = `world chat costs ${WORLD_CHAT_COST} gold`
      set({ chatError: err })
      state.flash(err)
      return { ok: false, error: err }
    }

    const msg = {
      id: genId(),
      scope,
      name: state.name,
      color: state.color,
      text: clean,
      at: Date.now(),
      self: true,
      userId: null,
    }
    state.addChatMessage(msg)

    if (bridge.online) {
      const res = await bridge.sendChat(scope, clean)
      if (!res.ok) {
        const errMap = {
          'chat cooldown': 'slow down — one message at a time',
          'not enough gold': `world chat costs ${WORLD_CHAT_COST} gold`,
          'bad text': 'message rejected',
          'position unknown — move first': 'move a little, then try again',
          'position stale — move first': 'move a little, then try again',
        }
        const raw = (res.error || '').toLowerCase()
        let err = errMap[res.error] || errMap[raw]
        if (!err) {
          if (raw.includes('gold')) err = `world chat costs ${WORLD_CHAT_COST} gold`
          else if (raw.includes('cooldown') || raw.includes('429')) err = 'slow down — one message at a time'
          else if (raw.includes('position')) err = 'move a little, then try again'
          else err = res.error || 'could not send'
        }
        // Drop optimistic bubble on failure so history stays honest
        set((s) => ({
          chat: s.chat.filter((m) => m.id !== msg.id),
          chatError: err,
        }))
        get().flash(err)
        return { ok: false, error: err }
      }
      if (typeof res.gold === 'number') set({ gold: res.gold })
      // Server returns the server-sanitized text; update our own message to match.
      if (res.text && res.text !== clean) {
        set((s) => ({
          chat: s.chat.map((m) => (m.id === msg.id ? { ...m, text: res.text } : m)),
        }))
      }
      set({ chatError: null })
      return { ok: true }
    }
    return { ok: true }
  },

  discoverLandmark: async (id) => {
    if (get().discovered.includes(id)) return
    // Guard in-flight discoveries (online) so rejections don't double-flash
    if (_pendingDiscover.has(id)) return

    _pendingDiscover.add(id)
    const lm = LANDMARKS.find((l) => l.id === id)
    const goldBefore = get().gold
    const discoveredBefore = get().discovered

    // Offline + online optimistic: local discovered + gold (B3 / offline progression)
    set((s) => ({ discovered: [...s.discovered, id], gold: s.gold + DISCOVER_GOLD }))
    get().flash(`discovered ${lm ? lm.name : 'a place'} · +${DISCOVER_GOLD} gold`)
    if (id === FIRST_WALK_LANDMARK_ID) get().completeFirstWalk()

    if (bridge.online) {
      try {
        const res = await bridge.discover(id)
        if (!res.ok) {
          set({
            discovered: discoveredBefore,
            gold: goldBefore,
          })
          // Don't spam if already discovered server-side
          const err = (res.error || '').toLowerCase()
          if (!err.includes('already') && !discoveredBefore.includes(id)) {
            get().flash('could not save discovery — try again online')
          }
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
    if (state.isProcessingTeleport) return
    
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

    set({ isProcessingTeleport: true, teleportFlash: true })
    const originalGold = state.gold
    set((s) => ({ gold: s.gold - TELEPORT_COST }))
    
    // Play sound and wait for screen to fade to white
    const snd = new Audio('/sound/plop.mp3')
    snd.volume = 0.5
    snd.play().catch(() => {})
    await new Promise(r => setTimeout(r, 200))

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
    set({ navTarget: null, teleportFlash: false })
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
    set({ isProcessingTeleport: false })
  },

  setSpawnHere: async () => {
    const state = get()
    if (state.isProcessingTeleport) return
    
    if (state.gold < SET_SPAWN_COST) {
      state.flash(`need ${SET_SPAWN_COST} gold to set a spawn point`)
      return
    }
    const x = P.pos.x
    const z = P.pos.z

    const originalGold = state.gold
    const originalSpawn = state.customSpawn

    set({ isProcessingTeleport: true })
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
    set({ isProcessingTeleport: false })
  },

  /**
   * Daily +10 gold.
   * @param {{ quiet?: boolean, forceToast?: boolean }} opts
   *   quiet — suppress "already claimed" / errors (auto-claim on connect)
   *   forceToast — always explain outcome (manual claim from Settings)
   */
  claimDailyBonus: async ({ quiet = false, forceToast = false } = {}) => {
    const say = (msg, isSuccessClaim = false) => {
      // Auto-claim: only celebrate a real claim. Manual: always explain.
      if (forceToast || isSuccessClaim || !quiet) get().flash(msg)
    }

    if (bridge.online) {
      const res = await bridge.claimDaily()
      if (res.ok && typeof res.gold === 'number') {
        const prev = get().gold
        set({ gold: res.gold, lastBonus: todayStr() })
        if (res.gold > prev) {
          say(`claimed daily bonus! · +${DAILY_BONUS_GOLD} gold`, true)
          return { ok: true, claimed: true, gold: res.gold }
        }
        if (forceToast || !quiet) {
          get().flash('daily bonus already claimed · come back tomorrow')
        }
        return { ok: true, claimed: false, gold: res.gold }
      }
      if (!res.ok) {
        const err = (res.error || '').toLowerCase()
        if (err.includes('too new')) {
          if (forceToast || !quiet) get().flash('daily bonus unlocks after 12 hours with this account')
        } else if (forceToast) {
          get().flash(res.error || 'could not claim daily bonus')
        }
        return { ok: false, claimed: false, error: res.error }
      }
      return { ok: false, claimed: false }
    }

    // Offline: one claim per calendar day (UTC date) — same rhythm as online (B7)
    const state = get()
    const today = todayStr()
    if (state.lastBonus === today) {
      if (forceToast || !quiet) get().flash('daily bonus already claimed · come back tomorrow')
      return { ok: true, claimed: false, gold: state.gold }
    }
    set((s) => ({
      gold: s.gold + DAILY_BONUS_GOLD,
      lastBonus: today,
      lastBonusPlaytime: s.playtimeSeconds,
    }))
    say(`claimed daily bonus! · +${DAILY_BONUS_GOLD} gold`, true)
    return { ok: true, claimed: true, gold: get().gold }
  },

  claimOfflineGold: async () => {
    if (bridge.online) {
      const res = await bridge.claimOfflineGold()
      if (res.ok && res.gold && res.gold > 0) {
        // Server returns gold amount claimed (pending), not new balance
        set((s) => ({ gold: s.gold + res.gold }))
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
        keybinds: s.keybinds,
        customSpawn: s.customSpawn,
        playtimeSeconds: s.playtimeSeconds,
        firstWalkQuest: s.firstWalkQuest,
        softQuest: s.softQuest,
        hasCompletedWelcome: s.hasCompletedWelcome,
        lastBonus: s.lastBonus, // daily-claim UI works online + offline
      }
      if (!s.online) {
        base.gold = s.gold
        base.wood = s.wood
        base.stone = s.stone
        base.trees = s.trees
        base.discovered = s.discovered
        base.placedRocks = s.placedRocks // offline: keep rocks locally
        base.plots = s.plots // offline: keep plots locally
        base.craftedItems = s.craftedItems
        base.cutResources = s.cutResources
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
