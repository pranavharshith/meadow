import * as THREE from 'three'
import { makeMossyMaterial } from './mossy-material'

// ── Shared Rock Geometries ────────────────────────────────────────────────

// We use Icosahedron with detail 0 to make them look a bit more refined but still low-poly,
// as the user mentioned some rocks look "ugly". Dodecahedron can sometimes look like a weird hexagon.
// Shape 0: flat boulder
export const boulderGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0)
  g.scale(1, 0.45, 1)
  return g
})()

// Shape 1: tall standing stone (stretched)
export const standingGeo = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0)
  g.scale(0.55, 1.5, 0.55)
  return g
})()

// Shape 2: original round rock
export const roundGeo = new THREE.IcosahedronGeometry(1, 0)
roundGeo.scale(0.9, 0.8, 0.9) // slightly squashed so it's not a perfect ball

export const ROCK_GEOS = [boulderGeo, standingGeo, roundGeo]

// ── Shared Rock Materials ─────────────────────────────────────────────────

export const ROCK_MATS = [
  makeMossyMaterial({ base: '#8d8b83', moss: 'vec3(0.38, 0.52, 0.28)' }),
  makeMossyMaterial({ base: '#7a7870', moss: 'vec3(0.32, 0.48, 0.24)' }),
  makeMossyMaterial({ base: '#9a9488', moss: 'vec3(0.42, 0.55, 0.30)' }),
]
