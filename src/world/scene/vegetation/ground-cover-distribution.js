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
  grass: [new THREE.Color('#607a32'), new THREE.Color('#78913a'), new THREE.Color('#91a247'), new THREE.Color('#4c6b36')],
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

// Places an instance flush on the rendered terrain facet: yaw first, then tilt
// so the base sits against the slope instead of floating vertically.
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

/** Generates mutually composed forest-floor batches for one stable chunk. */
export function generateGroundCover(cx, cz, densityScale, plots, segments = 50) {
  const result = {
    grass: [], flowers: [], ferns: [], shrubs: [], berries: [],
    leaves: [], twigs: [], pebbles: [], stumps: [], stumpCaps: [],
  }
  const dummy = new THREE.Object3D()

  const grassRandom = mulberry32(seedFor(cx, cz) ^ 0xa1)
  for (let i = 0; i < Math.floor(2400 * densityScale); i++) {
    const [x, z] = point(grassRandom, cx, cz)
    const roll = grassRandom()
    const rotation = grassRandom() * Math.PI
    const width = 0.62 + grassRandom() * 0.48
    const height = 0.42 + grassRandom() * 0.72
    const color = COLORS.grass[(grassRandom() * COLORS.grass.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const canopyClearance = 1 - biome.forest * 0.58
    const acceptance = (0.18 + biome.meadow * 0.5 + biome.moisture * 0.08)
      * zones.meadowPatch * canopyClearance
    if (roll > acceptance) continue

    const verticalScale = height * (0.82 + biome.moisture * 0.18) * (0.76 + zones.meadowPatch * 0.3)
    // Sit on the exact rendered facet and lean with the slope.
    const meshY = sampleTerrainMeshHeight(x, z, segments)
    sampleTerrainMeshNormal(x, z, segments, _normal)
    appendGrounded(result.grass, dummy, x, meshY - 0.02, z, _normal, rotation, [width, verticalScale, width], color)
  }

  const flowerRandom = mulberry32(seedFor(cx, cz) ^ 0xf1)
  for (let i = 0; i < Math.floor(52 * densityScale); i++) {
    const [x, z] = point(flowerRandom, cx, cz)
    const roll = flowerRandom()
    const rotation = flowerRandom() * Math.PI
    const scale = 0.42 + flowerRandom() * 0.58
    const color = COLORS.flower[(flowerRandom() * COLORS.flower.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = clusterField(x, z) * zones.meadowPatch * biome.meadow * 0.76
    if (roll > acceptance || biome.forest > 0.58) continue
    append(result.flowers, dummy, x, y + 0.07, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const fernRandom = mulberry32(seedFor(cx, cz) ^ 0x4f3)
  for (let i = 0; i < Math.floor(175 * densityScale); i++) {
    const [x, z] = point(fernRandom, cx, cz)
    const roll = fernRandom()
    const rotation = fernRandom() * Math.PI * 2
    const scale = 0.48 + fernRandom() * 0.82
    const color = COLORS.fern[(fernRandom() * COLORS.fern.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = zones.fernPatch * (0.16 + biome.forest * 0.62 + biome.moisture * 0.18)
    if (slope > 0.68 || roll > acceptance) continue
    append(result.ferns, dummy, x, y + 0.025, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const shrubRandom = mulberry32(seedFor(cx, cz) ^ 0xb51)
  for (let i = 0; i < Math.floor(58 * densityScale); i++) {
    const [x, z] = point(shrubRandom, cx, cz)
    const roll = shrubRandom()
    const rotation = shrubRandom() * Math.PI * 2
    const width = 0.58 + shrubRandom() * 0.78
    const height = 0.6 + shrubRandom() * 0.58
    const berries = shrubRandom()
    if (isNatureExcluded(plots, x, z, 0.5)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = zones.shrubPatch * (0.12 + biome.forest * 0.48 + biome.moisture * 0.08)
    if (slope > 0.64 || roll > acceptance) continue

    const scale = [width, height, width]
    append(result.shrubs, dummy, x, y, z, [0, rotation, 0], scale)
    if (berries < 0.42) append(result.berries, dummy, x, y, z, [0, rotation, 0], scale)
  }

  const litterRandom = mulberry32(seedFor(cx, cz) ^ 0x1eaf)
  for (let i = 0; i < Math.floor(220 * densityScale); i++) {
    const [x, z] = point(litterRandom, cx, cz)
    const roll = litterRandom()
    const rotation = litterRandom() * Math.PI * 2
    const scaleX = 0.55 + litterRandom() * 1.15
    const scaleZ = 0.55 + litterRandom() * 1.05
    const color = COLORS.leaf[(litterRandom() * COLORS.leaf.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = zones.litterPatch * (0.15 + biome.forest * 0.68 + biome.dryness * 0.08)
    if (roll > acceptance) continue
    append(result.leaves, dummy, x, y + 0.018, z, [0, rotation, 0], [scaleX, 1, scaleZ], color)
  }

  const debrisRandom = mulberry32(seedFor(cx, cz) ^ 0xd3b)
  for (let i = 0; i < Math.floor(48 * densityScale); i++) {
    const [x, z] = point(debrisRandom, cx, cz)
    const roll = debrisRandom()
    const rotation = debrisRandom() * Math.PI * 2
    const length = 0.5 + debrisRandom() * 1.1
    const thickness = 0.7 + debrisRandom() * 0.55
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, 0, y)
    const zones = sampleGroundCoverZones(x, z)
    if (roll > zones.litterPatch * (0.08 + biome.forest * 0.48)) continue
    append(result.twigs, dummy, x, y + 0.04, z, [0.03, rotation, 0], [length, thickness, 1])
  }

  const pebbleRandom = mulberry32(seedFor(cx, cz) ^ 0x57a)
  for (let i = 0; i < Math.floor(46 * densityScale); i++) {
    const [x, z] = point(pebbleRandom, cx, cz)
    const roll = pebbleRandom()
    const rotation = pebbleRandom() * Math.PI * 2
    const scale = 0.38 + pebbleRandom() * 1.25
    const color = COLORS.pebble[(pebbleRandom() * COLORS.pebble.length) | 0]
    if (isNatureExcluded(plots, x, z)) continue

    const y = terrainHeight(x, z)
    const slope = terrainSlope(x, z)
    const biome = biomeSample(x, z, slope, y)
    const zones = sampleGroundCoverZones(x, z)
    const acceptance = 0.03 + zones.stonePatch * 0.28 + biome.rock * 0.42
    if (roll > acceptance) continue
    append(result.pebbles, dummy, x, y + 0.08 * scale, z, [0, rotation, 0], [scale, scale, scale], color)
  }

  const stumpRandom = mulberry32(seedFor(cx, cz) ^ 0x57b9)
  for (let i = 0; i < Math.floor(7 * densityScale); i++) {
    const [x, z] = point(stumpRandom, cx, cz)
    const roll = stumpRandom()
    const rotation = stumpRandom() * Math.PI * 2
    const width = 0.78 + stumpRandom() * 0.62
    const height = 0.68 + stumpRandom() * 0.62
    if (isNatureExcluded(plots, x, z, 0.8)) continue

    const y = terrainHeight(x, z)
    const biome = biomeSample(x, z, terrainSlope(x, z), y)
    const zones = sampleGroundCoverZones(x, z)
    if (roll > zones.detailPatch * biome.forest * 0.34) continue
    const scale = [width, height, width]
    append(result.stumps, dummy, x, y + 0.36 * height, z, [0, rotation, 0], scale)
    append(result.stumpCaps, dummy, x, y + 0.72 * height, z, [0, rotation, 0], scale)
  }

  return result
}
