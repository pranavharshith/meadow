/** Shared quality policy for streamed nature layers. */
export function terrainSegmentsFor(density) {
  if (density === 'off') return 20
  if (density === 'half') return 34
  return 50
}

/**
 * The short grass carpet survives quality reductions. It is intentionally
 * cheap geometry, so adaptive quality removes tall accents before it creates
 * the sparse-prototype look seen in the earlier renderer.
 */
export function coverDetailFor(density, autoTier = 0) {
  if (density === 'off') return { near: 0, mid: 0, tall: 0, flowers: 0, forest: 0 }

  const userScale = density === 'half' ? 0.72 : 1
  if (autoTier === 2) {
    return { near: userScale * 0.70, mid: userScale * 0.24, tall: 0, flowers: 0, forest: 0 }
  }
  if (autoTier === 1) {
    return { near: userScale * 0.86, mid: userScale * 0.32, tall: userScale * 0.24, flowers: userScale * 0.35, forest: 0 }
  }
  return { near: userScale, mid: userScale * 0.34, tall: userScale, flowers: userScale, forest: 0 }
}

export function coverScaleFor(density, autoTier = 0) {
  return coverDetailFor(density, autoTier).near
}

export const NATURE_RINGS = Object.freeze({
  terrain: 2,
  vegetation: 1,
})
