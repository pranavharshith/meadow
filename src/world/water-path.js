// Shared stream / pond water geometry helpers.
// Single source for visuals (Water.jsx), terrain carving (noise.js), and
// gameplay tests (Player / PlacementPreview) — audit C3 + D2.

/** Pond basins — must match landmark water features. */
export const PONDS = [
  { x: -74, z: 40, r: 12 }, // Crystal Pond
  { x: -300, z: 280, r: 8 }, // Silver Brook area
  { x: 180, z: -140, r: 6 }, // Broken Bridge
  { x: -60, z: 240, r: 10 }, // Willow Bend
  { x: 90, z: -220, r: 5 }, // Flower Terrace
  { x: -160, z: 210, r: 7 }, // Starfall Clearing
]

/** Control points: Silver Brook → Crystal Pond */
export const STREAM_POINTS = [
  { x: -300, z: 280 },
  { x: -260, z: 250 },
  { x: -220, z: 230 },
  { x: -180, z: 240 },
  { x: -140, z: 220 },
  { x: -100, z: 190 },
  { x: -74, z: 140 },
  { x: -60, z: 100 },
  { x: -50, z: 60 },
  { x: -74, z: 40 },
]

export const STREAM_WIDTH = 3.5
/** How far outside the stream bank terrain is blended (corridor carve). */
export const STREAM_BLEND = 5.5
/** Depth of stream bed below surrounding raw terrain. */
export const STREAM_BED_DEPTH = 0.38

const STREAM_SAMPLES = 80

/** Dense samples along the same Catmull-Rom path used for the water mesh. */
export const STREAM_SAMPLE_POINTS = (() => {
  const pts = STREAM_POINTS
  if (pts.length < 2) return pts.slice()
  const out = []
  const n = STREAM_SAMPLES
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const t = u * (pts.length - 1)
    const i0 = Math.floor(t)
    const i1 = Math.min(i0 + 1, pts.length - 1)
    const f = t - i0
    const p0 = pts[Math.max(0, i0 - 1)]
    const p1 = pts[i0]
    const p2 = pts[i1]
    const p3 = pts[Math.min(pts.length - 1, i1 + 1)]
    const f2 = f * f
    const f3 = f2 * f
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * f +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3)
    const z =
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * f +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * f2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * f3)
    out.push({ x, z })
  }
  return out
})()

/** Distance from (x,z) to stream centerline (samples + segments). */
export function streamCenterDist(x, z) {
  let best = Infinity
  const pts = STREAM_SAMPLE_POINTS
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(x - pts[i].x, z - pts[i].z)
    if (d < best) best = d
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    if (len2 < 1e-8) continue
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
    if (d < best) best = d
  }
  return best
}

/**
 * Smooth 0 inside bed → 1 outside blend (for terrain mix).
 */
export function streamCorridorT(x, z) {
  const half = STREAM_WIDTH * 0.5
  const d = streamCenterDist(x, z)
  if (d <= half) return 0
  if (d >= half + STREAM_BLEND) return 1
  const u = (d - half) / STREAM_BLEND
  return u * u * (3 - 2 * u)
}

/** True if standing over a pond or the stream (gameplay / placement). */
export function isOverWater(x, z, margin = 0.25) {
  for (let i = 0; i < PONDS.length; i++) {
    const p = PONDS[i]
    if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true
  }
  return streamCenterDist(x, z) < STREAM_WIDTH * 0.5 + margin
}
