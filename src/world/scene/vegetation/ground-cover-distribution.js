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
import { sampleTerrainMeshHeight, sampleTerrainMeshNormal } from '../terrain/terrain-surface'
import { sampleGroundCoverZones } from './ground-cover-zones'

const _up = new THREE.Vector3(0, 1, 0)
const _normal = new THREE.Vector3()
const _tilt = new THREE.Quaternion()
const _yaw = new THREE.Quaternion()

const COLORS = Object.freeze({
  shortGrass: [new THREE.Color('#4d7b29'), new THREE.Color('#619638'), new THREE.Color('#78ae49'), new THREE.Color('#3d6826')],
  meadowGrass: [new THREE.Color('#4b7e2a'), new THREE.Color('#6da63a'), new THREE.Color('#86ba4b'), new THREE.Color('#557f2d')],
  tallGrass: [new THREE.Color('#5f912e'), new THREE.Color('#7fb345'), new THREE.Color('#9bc759'), new THREE.Color('#4b7a2d')],
  flower: [new THREE.Color('#f4e5ca'), new THREE.Color('#dda8bc'), new THREE.Color('#d8c8eb'), new THREE.Color('#e9c77e')],
  fern: [new THREE.Color('#315c34'), new THREE.Color('#44703b'), new THREE.Color('#547f43')],
  leaf: [new THREE.Color('#8b7037'), new THREE.Color('#70552d'), new THREE.Color('#a18145'), new THREE.Color('#5c4728')],
  pebble: [new THREE.Color('#6e7067'), new THREE.Color('#918e7e'), new THREE.Color('#777166')],
})

function append(target, dummy, x, y, z, rotation, scale, color) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(...rotation)
  dummy.scale.set(...scale)
  dummy.updateMatrix()
  target.push({ matrix: dummy.matrix.clone(), color })
}

// Yaw before tilt keeps a clump rooted to the rendered terrain facet on slopes.
function appendGrounded(target, dummy, x, y, z, normal, yaw, scale, color) {
  _tilt.setFromUnitVectors(_up, normal)
  _yaw.setFromAxisAngle(_up, yaw)
  dummy.quaternion.copy(_tilt).multiply(_yaw)
  dummy.position.set(x, y, z)
  dummy.scale.set(...scale)
  dummy.updateMatrix()
  target.push({ matrix: dummy.matrix.clone(), color })
}

function point(random, cx, cz) {
  return [cx * CHUNK + random() * CHUNK, cz * CHUNK + random() * CHUNK]
}

function choose(random, colors) {
  return colors[(random() * colors.length) | 0]
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalizedDetail(detail) {
  if (typeof detail === 'number') {
    return { short: detail, meadow: detail, tall: detail, flowers: detail, forest: detail }
  }
  return {
    short: detail?.short ?? 1,
    meadow: detail?.meadow ?? 1,
    tall: detail?.tall ?? 1,
    flowers: detail?.flowers ?? 1,
    forest: detail?.forest ?? 1,
  }
}

function meadowAcceptance(biome, zones) {
  const openGround = 1 - biome.forest * 0.34
  return clamp(
    (0.62 + biome.meadow * 0.26 + biome.moisture * 0.12)
      * (0.62 + zones.meadowPatch * 0.38)
      * openGround,
    0,
    0.98,
  )
}

function appendTerrainGrass(target, dummy, x, z, segments, yaw, scale, color) {
  const meshY = sampleTerrainMeshHeight(x, z, segments)
  sampleTerrainMeshNormal(x, z, segments, _normal)
  appendGrounded(target, dummy, x, meshY - 0.018, z, _normal, yaw, scale, color)
}

/**
 * Generates a deterministic, layered grassland. Short opaque clumps establish
 * a continuous carpet; medium and tall layers add silhouette without relying
 * on alpha cards or forest-floor props in open meadow zones.
 */
export function generateGroundCover(cx, cz, detail, plots, segments = 50) {
  const levels = normalizedDetail(detail)
  const result = {
    shortGrass: [], meadowGrass: [], tallGrass: [], flowers: [], ferns: [], shrubs: [], berries: [],
    leaves: [], twigs: [], pebbles: [], stumps: [], stumpCaps: [],
  }
  const dummy = new THREE.Object3D()

  const shortRandom = mulberry32(seedFor(cx, cz) ^ 0xa1)
  for (let i = 0; i < Math.floor(6400 * levels.short); i++) {
    const [x, z] = point(shortRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    if (shortRandom() > meadowAcceptance(biome, zones)) continue

    const width = 0.68 + shortRandom() * 0.42
    const height = (0.74 + shortRandom() * 0.38) * (0.88 + biome.moisture * 0.16)
    appendTerrainGrass(
      result.shortGrass,
      dummy,
      x,
      z,
      segments,
      shortRandom() * Math.PI * 2,
      [width, height, width],
      choose(shortRandom, COLORS.shortGrass),
    )
  }

  const meadowRandom = mulberry32(seedFor(cx, cz) ^ 0x81f)
  for (let i = 0; i < Math.floor(1800 * levels.meadow); i++) {
    const [x, z] = point(meadowRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const cluster = 0.35 + zones.meadowPatch * 0.65
    const acceptance = meadowAcceptance(biome, zones) * cluster * (0.48 + biome.meadow * 0.46)
    if (meadowRandom() > acceptance) continue

    const width = 0.66 + meadowRandom() * 0.52
    const height = (0.82 + meadowRandom() * 0.54) * (0.9 + biome.moisture * 0.22)
    appendTerrainGrass(
      result.meadowGrass,
      dummy,
      x,
      z,
      segments,
      meadowRandom() * Math.PI * 2,
      [width, height, width],
      choose(meadowRandom, COLORS.meadowGrass),
    )
  }

  const tallRandom = mulberry32(seedFor(cx, cz) ^ 0x6f3)
  for (let i = 0; i < Math.floor(340 * levels.tall); i++) {
    const [x, z] = point(tallRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const band = clusterField(x, z) * (0.32 + zones.meadowPatch * 0.68)
    const acceptance = band * (0.20 + biome.meadow * 0.42 + biome.moisture * 0.25) * (1 - biome.forest * 0.62)
    if (tallRandom() > acceptance) continue

    const width = 0.72 + tallRandom() * 0.46
    const height = 0.88 + tallRandom() * 0.58 + biome.moisture * 0.22
    appendTerrainGrass(
      result.tallGrass,
      dummy,
      x,
      z,
      segments,
      tallRandom() * Math.PI * 2,
      [width, height, width],
      choose(tallRandom, COLORS.tallGrass),
    )
  }

  const flowerRandom = mulberry32(seedFor(cx, cz) ^ 0xf1)
  for (let i = 0; i < Math.floor(78 * levels.flowers); i++) {
    const [x, z] = point(flowerRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = clusterField(x, z) * zones.meadowPatch * biome.meadow * 0.82
    if (flowerRandom() > acceptance || biome.forest > 0.46) continue

    const scale = 0.42 + flowerRandom() * 0.58
    append(result.flowers, dummy, x, y + 0.07, z, [0, flowerRandom() * Math.PI, 0], [scale, scale, scale], choose(flowerRandom, COLORS.flower))
  }

  // Forest-only ground props are deliberately withheld from open meadows so
  // the field stays clean and no dark radial fern/debris silhouettes appear.
  const fernRandom = mulberry32(seedFor(cx, cz) ^ 0x4f3)
  for (let i = 0; i < Math.floor(140 * levels.forest); i++) {
    const [x, z] = point(fernRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const forestWeight = Math.max(0, biome.forest - biome.meadow * 0.8)
    const acceptance = zones.fernPatch * forestWeight * (0.30 + biome.moisture * 0.30)
    if (slope > 0.68 || fernRandom() > acceptance) continue

    const scale = 0.48 + fernRandom() * 0.82
    append(result.ferns, dummy, x, y + 0.025, z, [0, fernRandom() * Math.PI * 2, 0], [scale, scale, scale], choose(fernRandom, COLORS.fern))
  }

  const shrubRandom = mulberry32(seedFor(cx, cz) ^ 0xb51)
  for (let i = 0; i < Math.floor(48 * levels.forest); i++) {
    const [x, z] = point(shrubRandom, cx, cz)
    if (isNatureExcluded(plots, x, z, 0.5)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const forestWeight = Math.max(0, biome.forest - biome.meadow * 0.85)
    const acceptance = zones.shrubPatch * forestWeight * 0.54
    if (slope > 0.64 || shrubRandom() > acceptance) continue

    const width = 0.58 + shrubRandom() * 0.78
    const height = 0.6 + shrubRandom() * 0.58
    const scale = [width, height, width]
    append(result.shrubs, dummy, x, y, z, [0, shrubRandom() * Math.PI * 2, 0], scale)
    if (shrubRandom() < 0.42) append(result.berries, dummy, x, y, z, [0, shrubRandom() * Math.PI * 2, 0], scale)
  }

  const litterRandom = mulberry32(seedFor(cx, cz) ^ 0x1eaf)
  for (let i = 0; i < Math.floor(180 * levels.forest); i++) {
    const [x, z] = point(litterRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const forestWeight = Math.max(0, biome.forest - biome.meadow * 0.85)
    if (litterRandom() > zones.litterPatch * forestWeight * 0.62) continue

    append(
      result.leaves,
      dummy,
      x,
      y + 0.018,
      z,
      [0, litterRandom() * Math.PI * 2, 0],
      [0.55 + litterRandom() * 1.15, 1, 0.55 + litterRandom() * 1.05],
      choose(litterRandom, COLORS.leaf),
    )
  }

  const debrisRandom = mulberry32(seedFor(cx, cz) ^ 0x1d3b)
  for (let i = 0; i < Math.floor(40 * levels.forest); i++) {
    const [x, z] = point(debrisRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const forestWeight = Math.max(0, biome.forest - biome.meadow * 0.9)
    if (debrisRandom() > zones.litterPatch * forestWeight * 0.42) continue

    append(result.twigs, dummy, x, y + 0.04, z, [0.03, debrisRandom() * Math.PI * 2, 0], [0.5 + debrisRandom() * 1.1, 0.7 + debrisRandom() * 0.55, 1])
  }

  const pebbleRandom = mulberry32(seedFor(cx, cz) ^ 0x57a)
  for (let i = 0; i < Math.floor(36 * levels.forest); i++) {
    const [x, z] = point(pebbleRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = 0.02 + zones.stonePatch * 0.22 + biome.rock * 0.38
    if (pebbleRandom() > acceptance || biome.meadow > 0.58) continue

    const scale = 0.38 + pebbleRandom() * 1.25
    append(result.pebbles, dummy, x, y + 0.08 * scale, z, [0, pebbleRandom() * Math.PI * 2, 0], [scale, scale, scale], choose(pebbleRandom, COLORS.pebble))
  }

  const stumpRandom = mulberry32(seedFor(cx, cz) ^ 0x57b9)
  for (let i = 0; i < Math.floor(6 * levels.forest); i++) {
    const [x, z] = point(stumpRandom, cx, cz)
    if (isNatureExcluded(plots, x, z, 0.8)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, terrainSlope(x, z), y)
    const zones = sampleGroundCoverZones(x, z)
    const forestWeight = Math.max(0, biome.forest - biome.meadow)
    if (stumpRandom() > zones.detailPatch * forestWeight * 0.30) continue

    const width = 0.78 + stumpRandom() * 0.62
    const height = 0.68 + stumpRandom() * 0.62
    const scale = [width, height, width]
    append(result.stumps, dummy, x, y + 0.36 * height, z, [0, stumpRandom() * Math.PI * 2, 0], scale)
    append(result.stumpCaps, dummy, x, y + 0.72 * height, z, [0, stumpRandom() * Math.PI * 2, 0], scale)
  }

  return result
}
