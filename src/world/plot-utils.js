/**
 * Shared plot geometry / height helpers (G1).
 * Keep fence, pad mesh, terrain flatten, and player Y on one model.
 */

/** How much the walkable pad sits above the flattened terrain field. */
export const PLOT_PAD_TOP = 0.08
/** Pad stone thickness (visual only). */
export const PLOT_PAD_THICK = 0.12
/** Soft blend outside the pad (matches noise plotFlatten). */
export const PLOT_BLEND = 6.0

/**
 * Normalize server/client plot records so radius/width/depth never disagree.
 */
export function normalizePlot(p) {
  if (!p) return null
  const shapeType = p.shapeType === 1 || p.shape_type === 1 ? 1 : 0
  const w = Math.max(2, Number(p.width ?? p.radius ?? 10) || 10)
  const d = Math.max(2, Number(p.depth ?? p.radius ?? w) || w)
  return {
    ...p,
    shapeType,
    width: w,
    // Circles always use width as radius; rects keep independent depth
    depth: shapeType === 1 ? d : w,
    radius: w,
  }
}

export function normalizePlots(list) {
  return (list || []).map(normalizePlot).filter(Boolean)
}

/** Outside distance from pad edge (0 = on/inside pad). */
export function plotEdgeDist(plot, x, z) {
  const p = normalizePlot(plot)
  if (p.shapeType === 1) {
    const dx = Math.max(Math.abs(x - p.x) - p.width, 0)
    const dz = Math.max(Math.abs(z - p.z) - p.depth, 0)
    return Math.hypot(dx, dz)
  }
  return Math.max(Math.hypot(x - p.x, z - p.z) - p.width, 0)
}

export function isInsidePlot(plot, x, z) {
  return plotEdgeDist(plot, x, z) <= 0
}

/** Stable signature for remesh keys (full precision, not |0). */
export function plotRemeshKey(p) {
  const n = normalizePlot(p)
  return `${n.id}:${n.x.toFixed(2)}:${n.z.toFixed(2)}:${n.shapeType}:${n.width.toFixed(2)}:${n.depth.toFixed(2)}`
}
