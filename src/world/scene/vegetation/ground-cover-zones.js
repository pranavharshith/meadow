import { valueNoise } from '../../noise'

function smoothstep(minimum, maximum, value) {
  const t = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)))
  return t * t * (3 - 2 * t)
}

/**
 * Continuous world-space composition masks. Adjacent chunks share the same
 * quiet areas and prop beds, so detail reads as landscape design—not scatter.
 */
export function sampleGroundCoverZones(x, z) {
  const meadowNoise = valueNoise(x * 0.014 + 17.4, z * 0.014 - 31.2)
  const detailNoise = valueNoise(x * 0.021 - 44.8, z * 0.021 + 12.6)
  const band = valueNoise(x * 0.033 + 8.1, z * 0.033 + 67.5)
  const stoneNoise = valueNoise(x * 0.018 - 91.3, z * 0.018 - 22.7)

  const meadowPatch = 0.3 + smoothstep(0.26, 0.76, meadowNoise) * 0.7
  const detailPatch = smoothstep(0.43, 0.72, detailNoise)
  const fernPatch = detailPatch * (1 - smoothstep(0.38, 0.55, band))
  const shrubPatch = detailPatch * Math.max(0, 1 - Math.abs(band - 0.52) / 0.16)
  const litterPatch = detailPatch * smoothstep(0.54, 0.78, band)
  const stonePatch = smoothstep(0.5, 0.76, stoneNoise)

  return { meadowPatch, detailPatch, fernPatch, shrubPatch, litterPatch, stonePatch }
}
