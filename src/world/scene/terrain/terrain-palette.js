import * as THREE from 'three'

const COLORS = Object.freeze({
  meadowDry: new THREE.Color('#929849'),
  meadowLush: new THREE.Color('#54783d'),
  forestFloor: new THREE.Color('#293f26'),
  moss: new THREE.Color('#4f6c39'),
  leafLitter: new THREE.Color('#716039'),
  soil: new THREE.Color('#654c31'),
  rock: new THREE.Color('#777667'),
  sunGrass: new THREE.Color('#adb05b'),
})

/**
 * Paints a terrain vertex from the authoritative biome sample. The stronger
 * forest/soil separation creates the broad, readable patches in the target.
 */
export function sampleTerrainColor(target, biome, height, x, z) {
  const ridgeLight = THREE.MathUtils.clamp((height + 7.5) / 17, 0, 1)
  const patch = Math.sin(x * 0.083 + z * 0.061) * 0.5 + 0.5
  const grain = Math.sin(x * 1.73 + z * 2.19) * 0.5 + 0.5

  target.copy(COLORS.meadowDry)
  target.lerp(COLORS.meadowLush, biome.moisture * 0.88)
  target.lerp(COLORS.sunGrass, biome.meadow * biome.dryness * patch * 0.22)
  target.lerp(COLORS.moss, biome.forest * biome.moisture * 0.36)
  target.lerp(COLORS.forestFloor, Math.pow(biome.forest, 1.2) * 0.64)
  target.lerp(COLORS.leafLitter, biome.forest * (0.12 + biome.dryness * 0.32))
  target.lerp(COLORS.soil, biome.dryness * (0.18 + (1 - biome.meadow) * 0.28))
  target.lerp(COLORS.rock, biome.rock * 0.9)
  target.offsetHSL(0, 0, (ridgeLight - 0.5) * 0.055 + (grain - 0.5) * 0.035)
  return target
}
