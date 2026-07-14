// Deterministic value noise + fractal terrain height.
// Shared by ground mesh, grass, trees, placement, player Y — one source of truth.
import {
  PONDS,
  STREAM_BED_DEPTH,
  streamCorridorT,
} from './water-path'

export { PONDS } from './water-path'

/** Plaza terrain flatten radius (matches SpawnPlaza slab ~14.5 + margin). */
export const PLAZA_FLAT_R = 15.0
export const PLAZA_BLEND_W = 10.0
/** Grass / flowers clear slightly past stone so no blades under slabs (C6). */
export const PLAZA_GRASS_CLEAR_R = 15.6

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return h - Math.floor(h)
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function valueNoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const v00 = hash(xi, zi)
  const v10 = hash(xi + 1, zi)
  const v01 = hash(xi, zi + 1)
  const v11 = hash(xi + 1, zi + 1)
  const u = smooth(xf)
  const v = smooth(zf)
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v)
}

const rawCache = new Map()

function rawTerrainHeight(x, z) {
  const key = `${Math.round(x * 10)}:${Math.round(z * 10)}`
  const cached = rawCache.get(key)
  if (cached !== undefined) return cached

  let amp = 1
  let freq = 0.012
  let sum = 0
  let h = 0
  for (let o = 0; o < 4; o++) {
    h += valueNoise(x * freq, z * freq) * amp
    sum += amp
    amp *= 0.5
    freq *= 2
  }
  h /= sum
  const res = (h - 0.5) * 15

  if (rawCache.size > 10000) rawCache.clear()
  rawCache.set(key, res)
  return res
}

const CENTER_Y = rawTerrainHeight(0, 0)
const POND_HEIGHTS = PONDS.map((p) => rawTerrainHeight(p.x, p.z))

// ── Plot cache (C1): avoid useStore.getState() on every height sample ────────
let _plots = []
let _plotRev = 0

/**
 * Call when plot list changes (Terrain / Grass / store). Cheap invalidate.
 */
export function syncTerrainPlots(plots) {
  _plots = plots || []
  _plotRev += 1
}

export function getTerrainPlotRev() {
  return _plotRev
}

/** Signature of plots that touch a chunk AABB — for selective remesh (C1/C5). */
export function plotSignatureForChunk(cx, cz, chunkSize = 100) {
  const minX = cx * chunkSize - 8
  const maxX = (cx + 1) * chunkSize + 8
  const minZ = cz * chunkSize - 8
  const maxZ = (cz + 1) * chunkSize + 8
  const parts = []
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i]
    const w = (p.width ?? p.radius ?? 10) + 6
    const d = (p.depth ?? p.radius ?? 10) + 6
    if (p.x + w < minX || p.x - w > maxX || p.z + d < minZ || p.z - d > maxZ) continue
    parts.push(
      `${p.id || i}:${p.x | 0}:${p.z | 0}:${p.shapeType | 0}:${(p.width ?? 10) | 0}:${(p.depth ?? 10) | 0}`,
    )
  }
  return parts.join('|')
}

function plotFlatten(x, z, raw) {
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i]
    let dist = 0
    if (p.shapeType === 1) {
      const dx = Math.max(Math.abs(x - p.x) - (p.width ?? p.radius ?? 10), 0)
      const dz = Math.max(Math.abs(z - p.z) - (p.depth ?? p.radius ?? 10), 0)
      dist = Math.hypot(dx, dz)
    } else {
      const pr = Math.hypot(x - p.x, z - p.z)
      dist = Math.max(pr - (p.width ?? p.radius ?? 10), 0)
    }
    // Wider soft blend (8u) reduces harsh ramps (C5)
    const BLEND = 8.0
    if (dist <= BLEND) {
      const centerH = rawTerrainHeight(p.x, p.z)
      if (dist === 0) return centerH
      const t = dist / BLEND
      const s = t * t * (3 - 2 * t)
      return centerH + (raw - centerH) * s
    }
  }
  return null
}

/**
 * Authoritative world height at (x,z). Used for mesh, props, player, water.
 * Footstep mesh dents were removed so this is the single truth (C2).
 */
export function terrainHeight(x, z) {
  const raw = rawTerrainHeight(x, z)

  // Spawn plaza crater
  const r = Math.hypot(x, z)
  if (r <= PLAZA_FLAT_R) {
    return CENTER_Y
  }
  if (r < PLAZA_FLAT_R + PLAZA_BLEND_W) {
    const t = (r - PLAZA_FLAT_R) / PLAZA_BLEND_W
    const s = t * t * (3 - 2 * t)
    return CENTER_Y + (raw - CENTER_Y) * s
  }

  // Player plots
  const plotH = plotFlatten(x, z, raw)
  if (plotH !== null) return plotH

  // Pond basins
  for (let i = 0; i < PONDS.length; i++) {
    const p = PONDS[i]
    const pr = Math.hypot(x - p.x, z - p.z)
    const bed = POND_HEIGHTS[i] - 0.45
    if (pr <= p.r) {
      return bed
    }
    if (pr < p.r + 6.0) {
      const t = (pr - p.r) / 6.0
      const s = t * t * (3 - 2 * t)
      return bed + (raw - bed) * s
    }
  }

  // Stream corridor carve (C3) — same path as water mesh
  const st = streamCorridorT(x, z)
  if (st < 1) {
    const bed = raw - STREAM_BED_DEPTH
    return bed + (raw - bed) * st
  }

  return raw
}

export function terrainSlope(x, z) {
  const e = 2.0
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  return Math.sqrt(hx * hx + hz * hz) / (2 * e)
}

export function clusterField(x, z) {
  const n = valueNoise(x * 0.02 + 11.3, z * 0.02 - 7.1)
  return smooth(clamp((n - 0.35) / 0.5, 0, 1))
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}
