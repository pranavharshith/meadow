import * as THREE from 'three'
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField } from './noise'
import { CHUNK, seedFor } from './chunk'
import { P, rockRegistry } from '../player-state'

// Low-poly boulders scattered across the meadow as quiet, natural detail.
// Streamed as a 3x3 window of chunks around the player like the grass/trees,
// so the world stays endless without a growing instance count. Rocks avoid the
// lush flower clusters so they read as rocky, sparser ground.
const geo = new THREE.DodecahedronGeometry(1, 0)
const mat = new THREE.MeshStandardMaterial({ color: '#8d8b83', roughness: 1, metalness: 0, flatShading: true })

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
          if (clusterField(x, z) > 0.5) { rng(); rng(); rng(); rng(); continue }
          const rot = rng() * Math.PI * 2
          const sx = 0.6 + rng() * 1.6
          const sy = 0.4 + rng() * 0.8
          const sz = 0.6 + rng() * 1.6
          const sink = 0.15 + rng() * 0.25
          arr.push({ x, z, y: terrainHeight(x, z), rot, sx, sy, sz, sink })
        }
      }
    }
    return arr
  }, [center.cx, center.cz])

  // Sync rock registry for collision — only large rocks block the player
  useEffect(() => {
    rockRegistry.length = 0
    for (const r of allRocks) {
      // Only rocks tall enough to block (above knee height ~0.4)
      if (r.sy >= 0.55) {
        rockRegistry.push({ x: r.x, z: r.z, r: Math.max(r.sx, r.sz) * 0.5 + 0.3 })
      }
    }
  }, [allRocks])

  return (
    <group>
      {allRocks.map((r, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={mat}
          position={[r.x, r.y - r.sink, r.z]}
          rotation={[0, r.rot, 0]}
          scale={[r.sx, r.sy, r.sz]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
