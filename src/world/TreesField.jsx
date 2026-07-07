import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32 } from './noise'
import { CHUNK, seedFor } from './chunk'
import { trunkGeo, leafGeo, trunkMat, leafMats, saplingTrunkGeo, saplingLeafGeo, saplingLeafMat, sproutGeo, sproutLeafGeo, sproutLeafMat } from './tree-assets'
import { treeRegistry, P } from '../player-state'
import { useStore } from '../store'

const GROW_SECONDS = 90 // sapling -> full grown, over real time

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

function TreeParts({ variant }) {
  return (
    <>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[variant % 3]} position={[0, 3.4, 0]} scale={[1.5, 1.4, 1.5]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 1) % 3]} position={[0.6, 2.8, 0.3]} scale={0.95} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 2) % 3]} position={[-0.55, 2.7, -0.3]} scale={0.85} castShadow />
    </>
  )
}

// --- Growth stage visuals for planted trees ---

// Stage 1: tiny sprout (0–30s) — a thin green stick with a small leaf blob
function Sprout({ variant }) {
  return (
    <>
      <mesh geometry={sproutGeo} material={trunkMat} position={[0, 0.25, 0]} castShadow />
      <mesh geometry={sproutLeafGeo} material={sproutLeafMat} position={[0, 0.55, 0]} castShadow />
      <mesh geometry={sproutLeafGeo} material={sproutLeafMat} position={[0.1, 0.48, 0.06]} scale={0.6} castShadow />
    </>
  )
}

// Stage 2: sapling (30–90s) — slender trunk, small crown, lighter leaf color
function Sapling({ variant }) {
  return (
    <>
      <mesh geometry={saplingTrunkGeo} material={trunkMat} position={[0, 0.6, 0]} castShadow receiveShadow />
      <mesh geometry={saplingLeafGeo} material={saplingLeafMat} position={[0, 1.4, 0]} scale={[1.1, 1.0, 1.1]} castShadow />
      <mesh geometry={saplingLeafGeo} material={leafMats[variant % 3]} position={[0.2, 1.15, 0.1]} scale={0.6} castShadow />
    </>
  )
}

// Stage 3: mature tree — full size (uses TreeParts)

const SPROUT_END = 30 // seconds
const SAPLING_END = 90 // seconds (= GROW_SECONDS)

function PlantedTrees({ trees }) {
  const refs = useRef([])

  useFrame(() => {
    const now = Date.now()
    for (let i = 0; i < trees.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      const t = trees[i]
      const age = (now - t.plantedAt) / 1000

      if (age < SPROUT_END) {
        // Sprout: grow from 0.3 to 0.7
        const p = age / SPROUT_END
        g.scale.setScalar(0.3 + easeOut(p) * 0.4)
      } else if (age < SAPLING_END) {
        // Sapling: grow from 0.5 to 0.85
        const p = (age - SPROUT_END) / (SAPLING_END - SPROUT_END)
        g.scale.setScalar(0.5 + easeOut(p) * 0.35)
      } else {
        // Mature: settle at full scale
        g.scale.setScalar(t.scale)
      }
    }
  })

  const now = Date.now()

  return (
    <group>
      {trees.map((t, i) => {
        const age = (now - t.plantedAt) / 1000
        return (
          <group
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            position={[t.x, terrainHeight(t.x, t.z), t.z]}
          >
            {age < SPROUT_END ? (
              <Sprout variant={t.variant} />
            ) : age < SAPLING_END ? (
              <Sapling variant={t.variant} />
            ) : (
              <TreeParts variant={t.variant} />
            )}
          </group>
        )
      })}
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
            s: 1.4 + rng() * 1.2,
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
    for (const t of decorative) treeRegistry.push({ x: t.x, z: t.z, r: 0.8, mature: true })
    for (const t of trees) {
      const grown = now - t.plantedAt >= GROW_SECONDS * 1000
      treeRegistry.push({ x: t.x, z: t.z, r: 0.6, mature: grown })
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
