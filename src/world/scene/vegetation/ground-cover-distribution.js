import * as THREE from 'three'
import {
  biomeSample,
  clusterField,
  mulberry32,
  terrainHeight,
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
  shortGrass: [new THREE.Color('#5f9e32'), new THREE.Color('#78b943'), new THREE.Color('#94cf55'), new THREE.Color('#4e842c')],
  meadowGrass: [new THREE.Color('#63a537'), new THREE.Color('#82c24a'), new THREE.Color('#a3d85d'), new THREE.Color('#528a30')],
  tallGrass: [new THREE.Color('#6faa39'), new THREE.Color('#91ca4d'), new THREE.Color('#b0dc66'), new THREE.Color('#5a9132')],
  flower: [new THREE.Color('#fff3d6'), new THREE.Color('#f2b6c8'), new THREE.Color('#dcd0f1'), new THREE.Color('#f3d36d')],
})

function append(target, dummy, x, y, z, rotation, scale, color) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(...rotation)
  dummy.scale.set(...scale)
  dummy.updateMatrix()
  target.push({ matrix: dummy.matrix.clone(), color })
}

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
  return {
    short: detail?.short ?? 1,
    meadow: detail?.meadow ?? 1,
    tall: detail?.tall ?? 1,
    flowers: detail?.flowers ?? 1,
  }
}

// Open grassland is deliberately accepted almost everywhere outside gameplay
// exclusions. Landscape masks vary height and colour, not basic field coverage.
function meadowAcceptance(biome, zones) {
  return clamp(
    (0.83 + biome.meadow * 0.10 + biome.moisture * 0.05)
      * (0.85 + zones.meadowPatch * 0.15)
      * (1 - biome.forest * 0.16),
    0,
    0.995,
  )
}

function appendTerrainGrass(target, dummy, x, z, segments, yaw, scale, color) {
  const meshY = sampleTerrainMeshHeight(x, z, segments)
  sampleTerrainMeshNormal(x, z, segments, _normal)
  appendGrounded(target, dummy, x, meshY - 0.016, z, _normal, yaw, scale, color)
}

/** Generates a dense, opaque stylized meadow with no radial fern/debris props. */
export function generateGroundCover(cx, cz, detail, plots, segments = 50) {
  const levels = normalizedDetail(detail)
  const result = {
    shortGrass: [], meadowGrass: [], tallGrass: [], flowers: [],
    shrubs: [], berries: [], leaves: [], twigs: [], pebbles: [], stumps: [], stumpCaps: [],
  }
  const dummy = new THREE.Object3D()

  // Cheap five-blade clumps can be numerous enough to read as a continuous
  // field. The terrain shader fills their remaining sub-pixel gaps.
  const shortRandom = mulberry32(seedFor(cx, cz) ^ 0xa1)
  for (let i = 0; i < Math.floor(24000 * levels.short); i++) {
    const [x, z] = point(shortRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    if (shortRandom() > meadowAcceptance(biome, zones)) continue

    const width = 0.84 + shortRandom() * 0.38
    const height = (0.78 + shortRandom() * 0.32) * (0.92 + biome.moisture * 0.13)
    appendTerrainGrass(result.shortGrass, dummy, x, z, segments, shortRandom() * Math.PI * 2, [width, height, width], choose(shortRandom, COLORS.shortGrass))
  }

  const meadowRandom = mulberry32(seedFor(cx, cz) ^ 0x81f)
  for (let i = 0; i < Math.floor(3400 * levels.meadow); i++) {
    const [x, z] = point(meadowRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const patch = 0.42 + zones.meadowPatch * 0.58
    const acceptance = meadowAcceptance(biome, zones) * patch * (0.60 + biome.meadow * 0.34)
    if (meadowRandom() > acceptance) continue

    const width = 0.72 + meadowRandom() * 0.46
    const height = (0.88 + meadowRandom() * 0.46) * (0.94 + biome.moisture * 0.18)
    appendTerrainGrass(result.meadowGrass, dummy, x, z, segments, meadowRandom() * Math.PI * 2, [width, height, width], choose(meadowRandom, COLORS.meadowGrass))
  }

  const tallRandom = mulberry32(seedFor(cx, cz) ^ 0x6f3)
  for (let i = 0; i < Math.floor(650 * levels.tall); i++) {
    const [x, z] = point(tallRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = clusterField(x, z) * (0.40 + zones.meadowPatch * 0.60)
      * (0.28 + biome.meadow * 0.42 + biome.moisture * 0.22) * (1 - biome.forest * 0.58)
    if (tallRandom() > acceptance) continue

    const width = 0.76 + tallRandom() * 0.42
    const height = 0.90 + tallRandom() * 0.54 + biome.moisture * 0.18
    appendTerrainGrass(result.tallGrass, dummy, x, z, segments, tallRandom() * Math.PI * 2, [width, height, width], choose(tallRandom, COLORS.tallGrass))
  }

  const flowerRandom = mulberry32(seedFor(cx, cz) ^ 0xf1)
  for (let i = 0; i < Math.floor(110 * levels.flowers); i++) {
    const [x, z] = point(flowerRandom, cx, cz)
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = clusterField(x, z) * zones.meadowPatch * (0.45 + biome.meadow * 0.48)
    if (flowerRandom() > acceptance || biome.forest > 0.52) continue

    const scale = 0.46 + flowerRandom() * 0.58
    append(result.flowers, dummy, x, y + 0.07, z, [0, flowerRandom() * Math.PI, 0], [scale, scale, scale], choose(flowerRandom, COLORS.flower))
  }

  return result
}
