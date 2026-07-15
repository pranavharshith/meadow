/** Shared quality policy for streamed nature layers. */
export function terrainSegmentsFor(density) {
  if (density === 'off') return 20
  if (density === 'half') return 34
  return 50
}

export function coverScaleFor(density, autoTier = 0) {
  if (density === 'off') return 0
  const userScale = density === 'half' ? 0.55 : 1
  const adaptiveScale = autoTier === 0 ? 1 : autoTier === 1 ? 0.58 : 0.32
  return userScale * adaptiveScale
}

export const NATURE_RINGS = Object.freeze({
  terrain: 2,
  vegetation: 1,
})
