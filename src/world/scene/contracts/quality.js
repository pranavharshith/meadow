/** Shared quality policy for streamed nature layers. */
export function terrainSegmentsFor(density) {
  if (density === 'off') return 20
  if (density === 'half') return 34
  return 50
}

/**
 * Mesh grass budgets preserve the terrain grass-cover shader at every setting.
 * Detail disappears from tallest/most decorative layers first so low settings
 * remain a convincing green field instead of reverting to exposed ground.
 */
export function coverDetailFor(density, autoTier = 0) {
  if (density === 'off') {
    return { near: 0, mid: 0, tall: 0, flowers: 0, forest: 0 }
  }

  const userScale = density === 'half' ? 0.55 : 1
  if (autoTier === 2) {
    return {
      near: userScale * 0.42,
      mid: 0,
      tall: 0,
      flowers: 0,
      forest: userScale * 0.28,
    }
  }
  if (autoTier === 1) {
    return {
      near: userScale * 0.72,
      mid: userScale * 0.22,
      tall: 0,
      flowers: userScale * 0.22,
      forest: userScale * 0.56,
    }
  }
  return {
    near: userScale,
    mid: userScale * 0.46,
    tall: userScale,
    flowers: userScale,
    forest: userScale,
  }
}

// Kept for existing consumers that only need a single density multiplier.
export function coverScaleFor(density, autoTier = 0) {
  return coverDetailFor(density, autoTier).near
}

export const NATURE_RINGS = Object.freeze({
  terrain: 2,
  vegetation: 1,
})
