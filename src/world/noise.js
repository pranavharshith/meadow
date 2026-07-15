// Deterministic value noise + fractal terrain height.
// Shared by ground mesh, grass, trees, placement, player Y — one source of truth.
import {
  PONDS,
  STREAM_BED_DEPTH,
  streamCorridorT,
  isOverWater,
  waterSurfaceLift,
} from './water-path'
import {
  normalizePlot,
  plotEdgeDist,
  plotRemeshKey,
  PLOT_BLEND,
  PLOT_PAD_TOP,
} from './plot-utils'

export { PONDS } from './water-path'
export { normalizePlot, normalizePlots, PLOT_PAD_TOP, isInsidePlot } from './plot-utils'

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
 * Always normalizes so width/radius/depth stay consistent (G1.4).
 */
export function syncTerrainPlots(plots) {
  _plots = (plots || []).map(normalizePlot).filter(Boolean)
  _plotRev += 1
}

export function getTerrainPlotRev() {
  return _plotRev
}

/** Signature of plots that touch a chunk AABB — for selective remesh (C1/C5/G1.3). */
export function plotSignatureForChunk(cx, cz, chunkSize = 100) {
  const minX = cx * chunkSize - 8
  const maxX = (cx + 1) * chunkSize + 8
  const minZ = cz * chunkSize - 8
  const maxZ = (cz + 1) * chunkSize + 8
  const parts = []
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i]
    const w = p.width + PLOT_BLEND + 2
    const d = p.depth + PLOT_BLEND + 2
    if (p.x + w < minX || p.x - w > maxX || p.z + d < minZ || p.z - d > maxZ) continue
    parts.push(plotRemeshKey(p))
  }
  // Include global rev so forced rebuilds always win even if geometry equal
  return `${_plotRev}|${parts.join('|')}`
}

/** Stable pad-center height (raw hill at claim center). */
export function plotPadBaseHeight(plot) {
  const p = normalizePlot(plot)
  return rawTerrainHeight(p.x, p.z)
}

/** Walkable Y on a plot pad (base + stone top). */
export function plotPadSurfaceHeight(plot) {
  return plotPadBaseHeight(plot) + PLOT_PAD_TOP
}

/**
 * Plot flatten: hard-flat pad (with pad top lift) + short blend to hills.
 * Returns null if (x,z) not near any plot.
 */
function plotFlatten(x, z, raw) {
  let best = null
  let bestDist = Infinity
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i]
    const dist = plotEdgeDist(p, x, z)
    if (dist < bestDist) {
      bestDist = dist
      best = p
    }
  }
  if (!best || bestDist > PLOT_BLEND) return null

  const centerH = rawTerrainHeight(best.x, best.z)
  const padTop = centerH + PLOT_PAD_TOP
  // Inside pad: solid walkable surface matching PlotPad mesh top (G1.1/G1.2)
  if (bestDist <= 0) return padTop
  // Soft blend to surrounding terrain (G1.5 — shorter blend than before)
  const t = bestDist / PLOT_BLEND
  const s = t * t * (3 - 2 * t)
  return padTop + (raw - padTop) * s
}

/**
 * Authoritative world height at (x,z). Used for mesh, props, player, water.
 * Order: plaza → ponds/stream → plots last so claimed land wins over water (G1.6).
 */
export function terrainHeight(x, z) {
  const raw = rawTerrainHeight(x, z)

  // Spawn plaza crater
  const r = Math.hypot(x, z)
  let h = raw
  if (r <= PLAZA_FLAT_R) {
    h = CENTER_Y
  } else if (r < PLAZA_FLAT_R + PLAZA_BLEND_W) {
    const t = (r - PLAZA_FLAT_R) / PLAZA_BLEND_W
    const s = t * t * (3 - 2 * t)
    h = CENTER_Y + (raw - CENTER_Y) * s
  } else {
    // Pond basins
    let pondDone = false
    for (let i = 0; i < PONDS.length; i++) {
      const p = PONDS[i]
      const pr = Math.hypot(x - p.x, z - p.z)
      const bed = POND_HEIGHTS[i] - 0.45
      if (pr <= p.r) {
        h = bed
        pondDone = true
        break
      }
      if (pr < p.r + 6.0) {
        const t = (pr - p.r) / 6.0
        const s = t * t * (3 - 2 * t)
        h = bed + (raw - bed) * s
        pondDone = true
        break
      }
    }
    if (!pondDone) {
      // Stream corridor carve (C3)
      const st = streamCorridorT(x, z)
      if (st < 1) {
        const bed = raw - STREAM_BED_DEPTH
        h = bed + (raw - bed) * st
      }
    }
  }

  // Plots last — dry claimed land overrides water/hills (G1.6)
  const plotH = plotFlatten(x, z, h)
  if (plotH !== null) return plotH

  return h
}

export function terrainSlope(x, z) {
  const e = 2.0
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  return Math.sqrt(hx * hx + hz * hz) / (2 * e)
}

/**
 * Walkable surface for the player (G2.5): on dry land = terrainHeight;
 * over water = near the visual water surface so you wade, not sink the bed.
 */
export function walkSurfaceHeight(x, z) {
  const ground = terrainHeight(x, z)
  const lift = waterSurfaceLift(x, z)
  if (lift <= 0) return ground
  return ground + lift
}

/** True if decorative props should avoid this spot (stream/pond). */
export function isBadPropSpot(x, z) {
  return isOverWater(x, z, 1.2)
}

export function clusterField(x, z) {
  const n = valueNoise(x * 0.02 + 11.3, z * 0.02 - 7.1)
  return smooth(clamp((n - 0.35) / 0.5, 0, 1))
}

/**
 * Deterministic large-scale ecology shared by terrain, trees and ground cover.
 * `slope` and `height` are accepted from callers that already sampled them so
 * dense systems (grass) do not have to repeat expensive terrain lookups.
 */
export function biomeSample(x, z, slope = 0, height = 0) {
  const broadWet = valueNoise(x * 0.0042 + 31.7, z * 0.0042 - 18.4)
  const localWet = valueNoise(x * 0.013 - 9.2, z * 0.013 + 42.6)
  const moisture = smooth(clamp((broadWet * 0.72 + localWet * 0.28 - 0.18) / 0.68, 0, 1))

  const warmthNoise = valueNoise(x * 0.0031 - 71.0, z * 0.0031 + 16.0)
  const warmth = smooth(clamp(warmthNoise * 0.86 + 0.12 - Math.max(height, 0) * 0.012, 0, 1))

  const groveNoise = clusterField(x, z)
  const groveBreakup = valueNoise(x * 0.008 + 83.0, z * 0.008 - 57.0)
  const forest = smooth(clamp(
    groveNoise * 0.68 + groveBreakup * 0.24 + moisture * 0.34 - slope * 0.72 - 0.30,
    0,
    1,
  ))

  const rock = smooth(clamp((slope - 0.20) / 0.58 + Math.max(height - 4, 0) * 0.025, 0, 1))
  const dryness = smooth(clamp((1 - moisture) * 0.72 + warmth * 0.22 + slope * 0.22 - 0.14, 0, 1))
  const meadow = smooth(clamp(1.08 - forest * 0.82 - rock * 0.74, 0, 1))

  return { moisture, warmth, forest, meadow, rock, dryness }
}

/** Stable acceptance mask for decorative woodland generation. */
export function forestDensity(x, z, slope = 0, height = 0) {
  return biomeSample(x, z, slope, height).forest
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}
