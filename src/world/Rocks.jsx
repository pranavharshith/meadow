import * as THREE from 'three'
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField } from './noise'
import { CHUNK, seedFor } from './chunk'
import { P, rockRegistry } from '../player-state'
import { makeMossyMaterial } from './mossy-material'
import { useStore } from '../store'

// Three distinct rock shapes for visual variety:
// 0 = flat boulder (compressed sphere), 1 = tall standing stone, 2 = clustered pebble group

// Shape 0: flat boulder
const boulderGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(1, 0.5, 1)
  return g
})()

// Shape 1: tall standing stone (stretched)
const standingGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(0.6, 1.4, 0.6)
  return g
})()

// Shape 2: original round rock
const roundGeo = new THREE.DodecahedronGeometry(1, 0)

const ROCK_GEOS = [boulderGeo, standingGeo, roundGeo]

// Three material variants for colour diversity
const rockMats = [
  makeMossyMaterial({ base: '#8d8b83', moss: 'vec3(0.38, 0.52, 0.28)' }),
  makeMossyMaterial({ base: '#7a7870', moss: 'vec3(0.32, 0.48, 0.24)' }),
  makeMossyMaterial({ base: '#9a9488', moss: 'vec3(0.42, 0.55, 0.30)' }),
]

export default function Rocks() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const allRocks = useMemo(() => {
    const arr = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const rng = mulberry32(seedFor(cx, cz) ^ 0x5c)
        const n = 2 + ((rng() * 4) | 0)
        for (let i = 0; i < n; i++) {
          const x = cx * CHUNK + rng() * CHUNK
          const z = cz * CHUNK + rng() * CHUNK
          if (clusterField(x, z) > 0.5) { rng(); rng(); rng(); rng(); rng(); continue }
          const rot = rng() * Math.PI * 2
          const sx = 0.6 + rng() * 1.6
          const sy = 0.4 + rng() * 0.8
          const sz = 0.6 + rng() * 1.6
          const sink = 0.15 + rng() * 0.25
          const shape = (rng() * 3) | 0
          const matIdx = (rng() * 3) | 0
          arr.push({ x, z, y: terrainHeight(x, z), rot, sx, sy, sz, sink, shape, matIdx })
        }
      }
    }
    return arr
  }, [center.cx, center.cz])

  // Sync rock registry for collision — only large rocks block
  useEffect(() => {
    rockRegistry.length = 0
    for (const r of allRocks) {
      if (r.sy >= 0.55) {
        rockRegistry.push({ x: r.x, z: r.z, r: Math.max(r.sx, r.sz) * 0.5 + 0.3 })
      }
    }
  }, [allRocks])

  // Clicking a natural/world-generated rock should tell the player it
  // can't be removed, and stop the click from bubbling to the canvas
  // (which would otherwise clear their real selection).
  const flash = useStore((s) => s.flash)
  const onDecorativeClick = (e) => {
    e.stopPropagation()
    flash('this rock has been here forever — you can only remove rocks you placed')
  }

  return (
    <group>
      {allRocks.map((r, i) => (
        <mesh
          key={i}
          geometry={ROCK_GEOS[r.shape]}
          material={rockMats[r.matIdx]}
          // Sit the rock ON the terrain instead of embedding its centre.
          // Geometry radius is 1, so after scaling by sy the mesh spans ±sy
          // vertically around its origin. `sy - sink` places the mesh centre
          // above terrain such that only the small `sink` amount is buried,
          // giving a natural embedded look without the "half-underground" bug.
          position={[r.x, r.y + r.sy - r.sink, r.z]}
          rotation={[0, r.rot, 0]}
          scale={[r.sx, r.sy, r.sz]}
          castShadow
          receiveShadow
          onClick={onDecorativeClick}
        />
      ))}
    </group>
  )
}
