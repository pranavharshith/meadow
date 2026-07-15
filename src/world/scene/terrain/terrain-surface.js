import * as THREE from 'three'
import { terrainHeight } from '../../noise'
import { CHUNK } from '../../chunk'

// The rendered terrain is a PlaneGeometry(CHUNK, CHUNK, segments, segments)
// evaluated at terrainHeight() per vertex. To let the player and grass sit on
// the *exact* rendered surface (not the smooth analytic height), we reproduce
// the same triangle lattice here and interpolate inside the correct triangle.
//
// PlaneGeometry, after rotateX(-PI/2), lays vertices on a regular grid where
// both the local X and local Y axes map to increasing world X and world Z.
// Each grid cell is split into two triangles along the a->? diagonal:
//   a=(0,0) b=(0,1) c=(1,1) d=(1,0)  ->  tri1 (a,b,d), tri2 (b,c,d)
// tri1 covers fx + fz <= 1, tri2 covers fx + fz > 1.

function cellSize(segments) {
  return CHUNK / segments
}

/** Height of the rendered terrain triangle mesh at (x, z) for a given LOD. */
export function sampleTerrainMeshHeight(x, z, segments) {
  const cell = cellSize(segments)
  const gx = Math.floor(x / cell)
  const gz = Math.floor(z / cell)
  const x0 = gx * cell
  const z0 = gz * cell
  const fx = (x - x0) / cell
  const fz = (z - z0) / cell

  const h00 = terrainHeight(x0, z0)
  const h10 = terrainHeight(x0 + cell, z0)
  const h01 = terrainHeight(x0, z0 + cell)

  if (fx + fz <= 1) {
    return h00 + fx * (h10 - h00) + fz * (h01 - h00)
  }
  const h11 = terrainHeight(x0 + cell, z0 + cell)
  return h11 + (1 - fx) * (h01 - h11) + (1 - fz) * (h10 - h11)
}

const _edge1 = new THREE.Vector3()
const _edge2 = new THREE.Vector3()
const _pa = new THREE.Vector3()
const _pb = new THREE.Vector3()
const _pc = new THREE.Vector3()

/** Face normal of the rendered terrain triangle at (x, z). Always points up. */
export function sampleTerrainMeshNormal(x, z, segments, out = new THREE.Vector3()) {
  const cell = cellSize(segments)
  const gx = Math.floor(x / cell)
  const gz = Math.floor(z / cell)
  const x0 = gx * cell
  const z0 = gz * cell
  const fx = (x - x0) / cell
  const fz = (z - z0) / cell

  if (fx + fz <= 1) {
    // triangle a(0,0), b(0,1), d(1,0)
    _pa.set(x0, terrainHeight(x0, z0), z0)
    _pb.set(x0, terrainHeight(x0, z0 + cell), z0 + cell)
    _pc.set(x0 + cell, terrainHeight(x0 + cell, z0), z0)
  } else {
    // triangle b(0,1), c(1,1), d(1,0)
    _pa.set(x0, terrainHeight(x0, z0 + cell), z0 + cell)
    _pb.set(x0 + cell, terrainHeight(x0 + cell, z0 + cell), z0 + cell)
    _pc.set(x0 + cell, terrainHeight(x0 + cell, z0), z0)
  }

  _edge1.subVectors(_pb, _pa)
  _edge2.subVectors(_pc, _pa)
  out.crossVectors(_edge1, _edge2).normalize()
  if (out.y < 0) out.multiplyScalar(-1)
  return out
}
