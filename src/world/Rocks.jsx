import * as THREE from 'three'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField } from './noise'
import { CHUNK, seedFor } from './chunk'
import { P, rockRegistry } from '../player-state'
import { ROCK_GEOS, ROCK_MATS } from './rock-assets'
import { useStore } from '../store'

export default function Rocks() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const chunksRef = useRef(new Map())
  const [allRocks, setAllRocks] = useState([])

  // Delta chunk loader
  useEffect(() => {
    let changed = false
    const newKeys = new Set()

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const key = `${cx},${cz}`
        newKeys.add(key)

        if (!chunksRef.current.has(key)) {
          changed = true
          const arr = []
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
            const r = { x, z, y: terrainHeight(x, z), rot, sx, sy, sz, sink, shape, matIdx, chunkKey: key }
            arr.push(r)
            
            const placementR = Math.max(sx, sz)
            if (sy >= 0.55) {
              rockRegistry.push({ x, z, r: Math.max(sx, sz) * 0.5 + 0.3, placementR, _source: 'decorative', chunkKey: key })
            } else {
              rockRegistry.push({ x, z, placementR, _source: 'decorative', chunkKey: key })
            }
          }
          chunksRef.current.set(key, arr)
        }
      }
    }

    // Prune old chunks
    for (const key of chunksRef.current.keys()) {
      if (!newKeys.has(key)) {
        changed = true
        chunksRef.current.delete(key)
        for (let i = rockRegistry.length - 1; i >= 0; i--) {
          if (rockRegistry[i].chunkKey === key) {
            rockRegistry.splice(i, 1)
          }
        }
      }
    }

    if (changed) {
      const allR = []
      for (const arr of chunksRef.current.values()) {
        allR.push(...arr)
      }
      setAllRocks(allR)
    }
  }, [center.cx, center.cz])

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
          geometry={ROCK_GEOS[r.shape ?? 2]}
          material={ROCK_MATS[r.matIdx ?? 0]}
          // Sit the rock ON the terrain instead of embedding its centre.
          // Geometry radius is 1, so after scaling by sy the mesh spans ±sy
          // vertically around its origin. `sy - sink` places the mesh centre
          // above ground, and the `- sink` slightly buries the bottom edge,
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
