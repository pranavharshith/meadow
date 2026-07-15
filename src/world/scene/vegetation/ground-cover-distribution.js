import * as THREE from 'three'
import {
  biomeSample,
  clusterField,
  mulberry32,
  terrainHeight,
  terrainSlope,
} from '../../noise'
import { CHUNK, seedFor } from '../../chunk'
import { isNatureExcluded } from '../contracts/placement-mask'

const COLORS = Object.freeze({
  grass: [new THREE.Color('#506b28'), new THREE.Color('#718b32'), new THREE.Color('#8c9940'), new THREE.Color('#435f2d')],
  flower: [new THREE.Color('#f3e0c3'), new THREE.Color('#dca8bd'), new THREE.Color('#d8c8ee'), new THREE.Color('#e8c27b')],
  fern: [new THREE.Color('#254a2a'), new THREE.Color('#365f31'), new THREE.Color('#476d35')],
  leaf: [new THREE.Color('#8a7032'), new THREE.Color('#6e5428'), new THREE.Color('#a17d3a'), new THREE.Color('#574321')],
  pebble: [new THREE.Color('#62645b'), new THREE.Color('#858273'), new THREE.Color('#696559')],
})

function append(target, dummy, x, y, z, rotation, scale, color) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(rotation[0], rotation[1], rotation[2])
  dummy.scale.set(scale[0], scale[1], scale[2])
  dummy.updateMatrix()
  target.push({ matrix: dummy.matrix.clone(), color })
}

function point(rng, cx, cz) {
  return [cx * CHUNK + rng() * CHUNK, cz * CHUNK + rng() * CHUNK]
}

/** Generates all static forest-floor batches for one deterministic chunk. */
export function generateGroundCover(cx, cz, densityScale, plots) {
  const result = {
    grass: [], flowers: [], ferns: [], shrubs: [], berries: [],
    leaves: [], twigs: [], pebbles: [], stumps: [], stumpCaps: [],
  }
  const dummy = new THREE.Object3D()

  const grassRng = mulberry32(seedFor(cx, cz) ^ 0xa1)
  const grassCandidates = Math.floor(3600 * densityScale)
  for (let i = 0; i < grassCandidates; i++) {
    const [x, z] = point(grassRng, cx, cz)
    const acceptanceRoll = grassRng()
    const rotation = grassRng() * Math.PI
    const width = 0.68 + grassRng() * 0.62
    const height = 0.58 + grassRng() * 1.1
    const colorRoll = (grassRng() * COLORS.grass.length) | 0
    if (isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const acceptance = 0.42 + biome.meadow * 0.4 + biome.forest * 0.18
    if (acceptanceRoll > acceptance) continue
    append(result.grass, dummy, x, y + 0.012, z, [0, rotation, 0], [width, height * (0.8 + biome.moisture * 0.35), width], COLORS.grass[colorRoll])
  }

  const flowerRng = mulberry32(seedFor(cx, cz) ^ 0xf1)
  for (let i = 0; i < Math.floor(70 * densityScale); i++) {
    const [x, z] = point(flowerRng, cx, cz)
    const cluster = clusterField(x, z)
    const rotation = flowerRng() * Math.PI
    const scale = 0.45 + flowerRng() * 0.7
    const color = COLORS.flower[(flowerRng() * COLORS.flower.length) | 0]
    if (cluster < 0.52 || isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    if (biome.forest > 0.72 && flowerRng() > 0.22) continue
    append(result.flowers, dummy, x, y + 0.08, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const fernRng = mulberry32(seedFor(cx, cz) ^ 0x4f3)
  for (let i = 0; i < Math.floor(270 * densityScale); i++) {
    const [x, z] = point(fernRng, cx, cz)
    const roll = fernRng()
    const rotation = fernRng() * Math.PI * 2
    const scale = 0.5 + fernRng() * 1.05
    const color = COLORS.fern[(fernRng() * COLORS.fern.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    if (slope > 0.72 || roll > 0.08 + biome.forest * 0.72 + biome.moisture * 0.18) continue
    append(result.ferns, dummy, x, y + 0.025, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const shrubRng = mulberry32(seedFor(cx, cz) ^ 0xb51)
  for (let i = 0; i < Math.floor(90 * densityScale); i++) {
    const [x, z] = point(shrubRng, cx, cz)
    const roll = shrubRng()
    const rotation = shrubRng() * Math.PI * 2
    const width = 0.58 + shrubRng() * 1.05
    const height = 0.62 + shrubRng() * 0.78
    const berryRoll = shrubRng()
    if (isNatureExcluded(plots, x, z, 0.5)) continue
    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    if (slope > 0.68 || roll > 0.04 + biome.forest * 0.5 + biome.moisture * 0.1) continue
    const scale = [width, height, width]
    append(result.shrubs, dummy, x, y, z, [0, rotation, 0], scale)
    if (berryRoll < 0.56) append(result.berries, dummy, x, y, z, [0, rotation, 0], scale)
  }

  const litterRng = mulberry32(seedFor(cx, cz) ^ 0x1eaf)
  for (let i = 0; i < Math.floor(470 * densityScale); i++) {
    const [x, z] = point(litterRng, cx, cz)
    const roll = litterRng()
    const rotation = litterRng() * Math.PI * 2
    const scaleX = 0.55 + litterRng() * 1.5
    const scaleZ = 0.55 + litterRng() * 1.3
    const color = COLORS.leaf[(litterRng() * COLORS.leaf.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    if (roll > 0.08 + biome.forest * 0.82 + biome.dryness * 0.12) continue
    append(result.leaves, dummy, x, y + 0.018, z, [0, rotation, 0], [scaleX, 1, scaleZ], color)
  }

  const debrisRng = mulberry32(seedFor(cx, cz) ^ 0xd3b)
  for (let i = 0; i < Math.floor(105 * densityScale); i++) {
    const [x, z] = point(debrisRng, cx, cz)
    const roll = debrisRng()
    const rotation = debrisRng() * Math.PI * 2
    const length = 0.45 + debrisRng() * 1.45
    if (isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    if (roll > 0.08 + biome.forest * 0.62) continue
    append(result.twigs, dummy, x, y + 0.04, z, [0.03, rotation, 0], [length, 0.7 + debrisRng() * 0.8, 1])
  }

  const pebbleRng = mulberry32(seedFor(cx, cz) ^ 0x57a)
  for (let i = 0; i < Math.floor(85 * densityScale); i++) {
    const [x, z] = point(pebbleRng, cx, cz)
    const roll = pebbleRng()
    const rotation = pebbleRng() * Math.PI * 2
    const scale = 0.35 + pebbleRng() * 1.65
    const color = COLORS.pebble[(pebbleRng() * COLORS.pebble.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue
    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    if (roll > 0.08 + biome.rock * 0.58 + biome.forest * 0.14) continue
    append(result.pebbles, dummy, x, y + 0.08 * scale, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const stumpRng = mulberry32(seedFor(cx, cz) ^ 0x57b9)
  for (let i = 0; i < Math.floor(14 * densityScale); i++) {
    const [x, z] = point(stumpRng, cx, cz)
    const roll = stumpRng()
    const rotation = stumpRng() * Math.PI * 2
    const width = 0.72 + stumpRng() * 0.85
    const height = 0.62 + stumpRng() * 0.8
    if (isNatureExcluded(plots, x, z, 0.8)) continue
    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, terrainSlope(x, z), y)
    if (roll > biome.forest * 0.62) continue
    const stumpScale = [width, height, width]
    append(result.stumps, dummy, x, y + 0.36 * height, z, [0, rotation, 0], stumpScale)
    append(result.stumpCaps, dummy, x, y + 0.72 * height, z, [0, rotation, 0], stumpScale)
  }

  return result
}
