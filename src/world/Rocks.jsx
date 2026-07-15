import * as THREE from 'three'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField, plotSignatureForChunk, isBadPropSpot } from './noise'
import { CHUNK, seedFor } from './chunk'
import { P, rockRegistry } from '../player-state'
import { ROCK_GEOS, ROCK_MATS } from './rock-assets'
import { useStore } from '../store'

export default function Rocks() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const plots = useStore((s) => s.plots)

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const chunksRef = useRef(new Map())
  const plotSigRef = useRef(new Map())
  const [allRocks, setAllRocks] = useState([])

  // Delta chunk loader — regen when nearby plots change (C5)
  useEffect(() => {
    let changed = false
    const newKeys = new Set()

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const key = `${cx},${cz}`
        newKeys.add(key)

        const sig = plotSignatureForChunk(cx, cz, CHUNK)
        if (chunksRef.current.has(key) && plotSigRef.current.get(key) !== sig) {
          chunksRef.current.delete(key)
          for (let i = rockRegistry.length - 1; i >= 0; i--) {
            if (rockRegistry[i].chunkKey === key) rockRegistry.splice(i, 1)
          }
        }

        if (!chunksRef.current.has(key)) {
          changed = true
          plotSigRef.current.set(key, sig)
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
            // Skip stream/pond so rocks don't float over carved water (G2.6)
            if (isBadPropSpot(x, z)) continue
            const r = { localId: i, x, z, y: terrainHeight(x, z), rot, sx, sy, sz, sink, shape, matIdx, chunkKey: key }
            arr.push(r)

            const placementR = Math.max(sx, sz)
            if (sy >= 0.55) {
              rockRegistry.push({ x, z, r: Math.max(sx, sz) * 0.5 + 0.3, placementR, _source: 'decorative', chunkKey: key, idStr: `${key}_${i}_rock` })
            } else {
              rockRegistry.push({ x, z, placementR, _source: 'decorative', chunkKey: key, idStr: `${key}_${i}_rock` })
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
  }, [center.cx, center.cz, plots])

  const cutResources = useStore((s) => s.cutResources)
  const cutProcedural = useStore((s) => s.cutProcedural)

  const onDecorativeClick = (r, e) => {
    e.stopPropagation()
    const idStr = `${r.chunkKey}_${r.localId}_rock`
    cutProcedural(r.chunkKey, r.localId, 'rock', idStr)
  }

  return (
    <group>
      {allRocks.map((r, i) => {
        const idStr = `${r.chunkKey}_${r.localId}_rock`
        if (cutResources[idStr]) return null
        return (
        <mesh
          key={idStr}
          geometry={ROCK_GEOS[r.shape ?? 2]}
          material={ROCK_MATS[r.matIdx ?? 0]}
          position={[r.x, r.y + r.sy - r.sink, r.z]}
          rotation={[0, r.rot, 0]}
          scale={[r.sx, r.sy, r.sz]}
          castShadow
          receiveShadow
          onClick={(e) => onDecorativeClick(r, e)}
          onPointerOver={() => { document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        />
      )})}
    </group>
  )
}
