import * as THREE from 'three'

const COLORS = Object.freeze({
  meadowDry: new THREE.Color('#9ca255'),
  meadowLush: new THREE.Color('#60834a'),
  forestFloor: new THREE.Color('#354d31'),
  moss: new THREE.Color('#5c7746'),
  leafLitter: new THREE.Color('#806c45'),
  soil: new THREE.Color('#735a3e'),
  rock: new THREE.Color('#858478'),
  sunGrass: new THREE.Color('#b8bd68'),
})

/** Broad biome color only; fine material detail belongs in the terrain shader. */
export function sampleTerrainColor(target, biome, height, x, z) {
  const ridgeLight = THREE.MathUtils.clamp((height + 7.5) / 17, 0, 1)
  const broadPatch = Math.sin(x * 0.057 + z * 0.043) * 0.5 + 0.5

  target.copy(COLORS.meadowDry)
  target.lerp(COLORS.meadowLush, biome.moisture * 0.82)
  target.lerp(COLORS.sunGrass, biome.meadow * biome.dryness * broadPatch * 0.2)
  target.lerp(COLORS.moss, biome.forest * biome.moisture * 0.28)
  target.lerp(COLORS.forestFloor, Math.pow(biome.forest, 1.15) * 0.48)
  target.lerp(COLORS.leafLitter, biome.forest * biome.dryness * 0.18)
  target.lerp(COLORS.soil, biome.dryness * (0.12 + (1 - biome.meadow) * 0.22))
  target.lerp(COLORS.rock, biome.rock * 0.84)
  target.offsetHSL(0, 0, (ridgeLight - 0.5) * 0.04)
  return target
}
