import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32 } from './noise'
import { CHUNK, seedFor } from './chunk'
import { trunkGeo, leafGeo, trunkMat, leafMats } from './tree-assets'
import { treeRegistry, P } from '../player-state'
import { useStore } from '../store'

const GROW_SECONDS = 90 // sapling -> full grown, over real time

function TreeParts({ variant }) {
  return (
    <>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.75, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[variant % 3]} position={[0, 1.95, 0]} scale={[1.3, 1.2, 1.3]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 1) % 3]} position={[0.5, 1.55, 0.22]} scale={0.8} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 2) % 3]} position={[-0.45, 1.5, -0.25]} scale={0.75} castShadow />
    </>
  )
}

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

function PlantedTrees({ trees }) {
  const refs = useRef([])

  useFrame(() => {
    const now = Date.now()
    for (let i = 0; i < trees.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      const t = trees[i]
      const age = (now - t.plantedAt) / 1000
      const grow = Math.min(Math.max(age / GROW_SECONDS, 0), 1)
      g.scale.setScalar(THREE.MathUtils.lerp(0.14, t.scale, easeOut(grow)))
    }
  })

  return (
    <group>
      {trees.map((t, i) => (
        <group key={t.id} ref={(el) => (refs.current[i] = el)} position={[t.x, terrainHeight(t.x, t.z), t.z]}>
          <TreeParts variant={t.variant} />
        </group>
      ))}
    </group>
  )
}

export default function TreesField() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const trees = useStore((s) => s.trees)

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const decorative = useMemo(() => {
    const arr = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const rng = mulberry32(seedFor(cx, cz) ^ 0x7)
        const n = 3 + Math.floor(rng() * 3)
        for (let i = 0; i < n; i++) {
          const x = cx * CHUNK + rng() * CHUNK
          const z = cz * CHUNK + rng() * CHUNK
          arr.push({
            x,
            z,
            y: terrainHeight(x, z),
            s: 0.9 + rng() * 1.1,
            rot: rng() * Math.PI * 2,
            variant: (rng() * 3) | 0,
          })
        }
      }
    }
    return arr
  }, [center.cx, center.cz])

  // keep the registry (minimap + collision + wildlife anchors) in sync
  useEffect(() => {
    const now = Date.now()
    treeRegistry.length = 0
    for (const t of decorative) treeRegistry.push({ x: t.x, z: t.z, r: 0.55, mature: true })
    for (const t of trees) {
      const grown = now - t.plantedAt >= GROW_SECONDS * 1000
      treeRegistry.push({ x: t.x, z: t.z, r: 0.5, mature: grown })
    }
  }, [decorative, trees])

  return (
    <group>
      {decorative.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]} scale={t.s} rotation={[0, t.rot, 0]}>
          <TreeParts variant={t.variant} />
        </group>
      ))}
      <PlantedTrees trees={trees} />
    </group>
  )
}
