import * as THREE from 'three'
import { terrainHeight, biomeSample } from '../../noise'
import { CHUNK } from '../../chunk'
import { terrainDeformations } from '../../../player-state'
import { sampleTerrainColor } from './terrain-palette'

const NORMAL_PROBE = 2.2

/** Build one world-space terrain chunk with stable normals and biome colors. */
export function buildTerrainGeometry(cx, cz, segments) {
  // Exact CHUNK size (no overlap) so the vertex lattice aligns globally and the
  // player/grass surface sampler can reproduce the same triangles precisely.
  const geometry = new THREE.PlaneGeometry(CHUNK, CHUNK, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const originX = cx * CHUNK + CHUNK / 2
  const originZ = cz * CHUNK + CHUNK / 2
  const positions = geometry.attributes.position
  const colors = new Float32Array(positions.count * 3)
  const normals = new Float32Array(positions.count * 3)
  const color = new THREE.Color()

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i) + originX
    const z = positions.getZ(i) + originZ
    const height = terrainHeight(x, z)
    positions.setXYZ(i, x, height, z)

    const dx = terrainHeight(x + NORMAL_PROBE, z) - terrainHeight(x - NORMAL_PROBE, z)
    const dz = terrainHeight(x, z + NORMAL_PROBE) - terrainHeight(x, z - NORMAL_PROBE)
    const nx = -dx / (NORMAL_PROBE * 2)
    const nz = -dz / (NORMAL_PROBE * 2)
    const inverseLength = 1 / Math.hypot(nx, 1, nz)
    normals[i * 3] = nx * inverseLength
    normals[i * 3 + 1] = inverseLength
    normals[i * 3 + 2] = nz * inverseLength

    const slope = Math.min(Math.hypot(dx, dz) / (NORMAL_PROBE * 2), 1)
    sampleTerrainColor(color, biomeSample(x, z, slope, height), height, x, z)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  terrainDeformations.delete(`${cx},${cz}`)
  return geometry
}
