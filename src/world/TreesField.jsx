import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32 } from './noise'
import { CHUNK, seedFor } from './chunk'
import {
  trunkGeo, leafGeo, trunkMat, leafMats,
  pineTrunkGeo, pineLeafGeo, pineTrunkMat, pineLeafMats,
  bushyTrunkGeo, bushyLeafGeo, bushyLeafMats,
  willowTrunkGeo, willowTrunkMat, willowLeafGeo, willowLeafMats,
  cherryTrunkGeo, cherryLeafGeo, cherryLeafMats,
  mushroomStemGeo, mushroomCapGeo, mushroomStemMat, mushroomCapMat,
  saplingTrunkGeo, saplingLeafGeo, saplingLeafMat,
  sproutGeo, sproutLeafGeo, sproutLeafMat,
  makeLeafMat,
  goldenTrunkMat, goldenLeafMat,
  starTrunkMat, starLeafMat
} from './tree-assets'
import { treeRegistry, P } from '../player-state'
import { useStore } from '../store'
import { Select } from '@react-three/postprocessing'
import { plazaFloorHeight } from './SpawnPlaza'

const distantTrunkMat = trunkMat
const distantLeafMat = leafMats[0]

const GROW_SECONDS = 90
const CUT_DURATION = 0.85 // seconds the cut animation runs

function easeOut(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Shape 0: Classic broadleaf
function BroadleafTree({ variant, dyeMat }) {
  const m1 = dyeMat || leafMats[variant % 3]
  const m2 = dyeMat || leafMats[(variant + 1) % 3]
  const m3 = dyeMat || leafMats[(variant + 2) % 3]
  return (
    <>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={m1} position={[0, 3.4, 0]} scale={[1.5, 1.4, 1.5]} castShadow />
      <mesh geometry={leafGeo} material={m2} position={[0.6, 2.8, 0.3]} scale={0.95} castShadow />
      <mesh geometry={leafGeo} material={m3} position={[-0.55, 2.7, -0.3]} scale={0.85} castShadow />
    </>
  )
}

// Shape 1: Pine / Conifer
function PineTree({ variant, dyeMat }) {
  const m1 = dyeMat || pineLeafMats[variant % 3]
  const m2 = dyeMat || pineLeafMats[(variant + 1) % 3]
  return (
    <>
      <mesh geometry={pineTrunkGeo} material={pineTrunkMat} position={[0, 1.6, 0]} castShadow receiveShadow />
      <mesh geometry={pineLeafGeo} material={m1} position={[0, 3.6, 0]} castShadow />
      <mesh geometry={pineLeafGeo} material={m2} position={[0, 2.8, 0]} scale={[1.2, 0.7, 1.2]} castShadow />
    </>
  )
}

// Shape 2: Round bushy
function BushyTree({ variant, dyeMat }) {
  const m1 = dyeMat || bushyLeafMats[variant % 3]
  const m2 = dyeMat || bushyLeafMats[(variant + 1) % 3]
  return (
    <>
      <mesh geometry={bushyTrunkGeo} material={trunkMat} position={[0, 0.9, 0]} castShadow receiveShadow />
      <mesh geometry={bushyLeafGeo} material={m1} position={[0, 2.5, 0]} scale={[1.3, 1.1, 1.3]} castShadow />
      <mesh geometry={bushyLeafGeo} material={m2} position={[0.4, 2.2, 0.3]} scale={0.7} castShadow />
    </>
  )
}

// Shape 3: Weeping Willow
function WillowTree({ variant, dyeMat }) {
  const m1 = dyeMat || willowLeafMats[variant % 3]
  const m2 = dyeMat || willowLeafMats[(variant + 1) % 3]
  const m3 = dyeMat || willowLeafMats[(variant + 2) % 3]
  return (
    <>
      <mesh geometry={willowTrunkGeo} material={willowTrunkMat} position={[0, 1.9, 0]} castShadow receiveShadow />
      {/* Central tall canopy */}
      <mesh geometry={willowLeafGeo} material={m1} position={[0, 4.0, 0]} scale={[1.2, 1.2, 1.2]} castShadow />
      {/* Drooping side branches */}
      <mesh geometry={willowLeafGeo} material={m2} position={[0.7, 2.9, 0.4]} scale={[0.9, 1.3, 0.9]} rotation={[0, 0, -0.3]} castShadow />
      <mesh geometry={willowLeafGeo} material={m3} position={[-0.6, 3.1, -0.5]} scale={[0.8, 1.2, 0.8]} rotation={[0.2, 0, 0.3]} castShadow />
      <mesh geometry={willowLeafGeo} material={m1} position={[0.2, 2.7, -0.8]} scale={[0.85, 1.25, 0.85]} rotation={[-0.3, 0, 0.1]} castShadow />
      <mesh geometry={willowLeafGeo} material={m2} position={[-0.4, 2.6, 0.7]} scale={[0.75, 1.15, 0.75]} rotation={[0.2, 0, -0.2]} castShadow />
    </>
  )
}

// Shape 4: Cherry Blossom
function CherryBlossomTree({ variant, dyeMat }) {
  const m1 = dyeMat || cherryLeafMats[variant % 3]
  const m2 = dyeMat || cherryLeafMats[(variant + 1) % 3]
  const m3 = dyeMat || cherryLeafMats[(variant + 2) % 3]
  return (
    <>
      <mesh geometry={cherryTrunkGeo} material={trunkMat} position={[0, 1.3, 0]} castShadow receiveShadow />
      <mesh geometry={cherryLeafGeo} material={m1} position={[0, 3.2, 0]} scale={[1.4, 1.2, 1.4]} castShadow />
      <mesh geometry={cherryLeafGeo} material={m2} position={[0.6, 2.6, 0.4]} scale={0.9} castShadow />
      <mesh geometry={cherryLeafGeo} material={m3} position={[-0.5, 2.7, -0.3]} scale={0.85} castShadow />
    </>
  )
}

// Shape 5: Bioluminescent Mushroom
function MushroomTree() {
  return (
    <>
      <mesh geometry={mushroomStemGeo} material={mushroomStemMat} position={[0, 0.75, 0]} castShadow receiveShadow />
      <mesh geometry={mushroomCapGeo} material={mushroomCapMat} position={[0, 1.5, 0]} castShadow />
      <pointLight color="#4db8ff" intensity={3} distance={10} position={[0, 1.0, 0]} />
    </>
  )
}

// Shape 10: Golden Tree
function GoldenTree({ dyeMat }) {
  const m1 = dyeMat || goldenLeafMat
  return (
    <>
      <mesh geometry={trunkGeo} material={goldenTrunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={m1} position={[0, 3.4, 0]} scale={[1.5, 1.4, 1.5]} castShadow />
      <mesh geometry={leafGeo} material={m1} position={[0.6, 2.8, 0.3]} scale={0.95} castShadow />
      <mesh geometry={leafGeo} material={m1} position={[-0.55, 2.7, -0.3]} scale={0.85} castShadow />
    </>
  )
}

// Shape 11: Star Tree
function StarTree({ dyeMat }) {
  const m1 = dyeMat || starLeafMat
  return (
    <>
      <mesh geometry={cherryTrunkGeo} material={starTrunkMat} position={[0, 1.3, 0]} castShadow receiveShadow />
      <mesh geometry={cherryLeafGeo} material={m1} position={[0, 3.2, 0]} scale={[1.4, 1.2, 1.4]} />
      <mesh geometry={cherryLeafGeo} material={m1} position={[0.6, 2.6, 0.4]} scale={0.9} />
      <mesh geometry={cherryLeafGeo} material={m1} position={[-0.5, 2.7, -0.3]} scale={0.85} />
      <pointLight color="#aaddff" intensity={2} distance={8} position={[0, 2.5, 0]} />
    </>
  )
}

// Picks the right tree shape component based on shape index
function TreeParts({ variant, shape = 0, dyeMat }) {
  switch (shape) {
    case 1: return <PineTree variant={variant} dyeMat={dyeMat} />
    case 2: return <BushyTree variant={variant} dyeMat={dyeMat} />
    case 3: return <WillowTree variant={variant} dyeMat={dyeMat} />
    case 4: return <CherryBlossomTree variant={variant} dyeMat={dyeMat} />
    case 5: return <MushroomTree />
    case 10: return <GoldenTree dyeMat={dyeMat} />
    case 11: return <StarTree dyeMat={dyeMat} />
    default: return <BroadleafTree variant={variant} dyeMat={dyeMat} />
  }
}

// --- Growth stages ---
function Sprout() {
  return (
    <>
      <mesh geometry={sproutGeo} material={trunkMat} position={[0, 0.25, 0]} castShadow />
      <mesh geometry={sproutLeafGeo} material={sproutLeafMat} position={[0, 0.55, 0]} castShadow />
      <mesh geometry={sproutLeafGeo} material={sproutLeafMat} position={[0.1, 0.48, 0.06]} scale={0.6} castShadow />
    </>
  )
}

function Sapling({ variant }) {
  return (
    <>
      <mesh geometry={saplingTrunkGeo} material={trunkMat} position={[0, 0.6, 0]} castShadow receiveShadow />
      <mesh geometry={saplingLeafGeo} material={saplingLeafMat} position={[0, 1.4, 0]} scale={[1.1, 1.0, 1.1]} castShadow />
      <mesh geometry={saplingLeafGeo} material={leafMats[variant % 3]} position={[0.2, 1.15, 0.1]} scale={0.6} castShadow />
    </>
  )
}

const SPROUT_END = 30
const SAPLING_END = 90

function PlantedTrees({ trees }) {
  const refs = useRef([])
  const cuttingId = useStore((s) => s.cuttingId)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)
  const flash = useStore((s) => s.flash)
  const dyeingTreeId = useStore((s) => s.dyeingTreeId)
  const previewColor = useStore((s) => s.previewColor)
  const cutStart = useRef({})

  // Compute effective leaf colour per tree: preview overrides permanent dye
  const dyeColors = useMemo(() => {
    const map = {}
    for (const t of trees) {
      const c = (dyeingTreeId === t.id && previewColor) ? previewColor : (t.dye || null)
      if (c) map[t.id] = c
    }
    return map
  }, [trees, dyeingTreeId, previewColor])
  const dyeMats = useMemo(() => {
    const map = {}
    for (const [id, color] of Object.entries(dyeColors)) {
      map[id] = makeLeafMat(color)
    }
    return map
  }, [dyeColors])

  useFrame(() => {
    const now = Date.now()
    for (let i = 0; i < trees.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      const t = trees[i]
      const age = (now - t.plantedAt) / 1000

      // Cut animation overrides normal growth display
      if (cuttingId === t.id) {
        if (!cutStart.current[t.id]) cutStart.current[t.id] = performance.now()
        const elapsed = (performance.now() - cutStart.current[t.id]) / 1000
        const p = Math.min(elapsed / CUT_DURATION, 1)
        
        // Timber fall animation: accelerates like gravity (quadratic)
        const fall = p * p 
        g.rotation.z = fall * (Math.PI / 2 + 0.2) // Falls over 90+ degrees
        
        // Shrink/sink rapidly only in the last 20%
        const baseScale = t.scale || 1
        if (p > 0.8) {
          const shrink = (p - 0.8) * 5 // 0 to 1 over the last 20%
          g.scale.setScalar(baseScale * (1 - shrink))
        } else {
          g.scale.setScalar(baseScale)
        }
        continue
      } else {
        // Reset cut state if this tree was previously being cut
        if (cutStart.current[t.id]) {
          delete cutStart.current[t.id]
          g.rotation.z = 0
        }
      }

      if (age < SPROUT_END) {
        const p = age / SPROUT_END
        g.scale.setScalar(0.3 + easeOut(p) * 0.4)
      } else if (age < SAPLING_END) {
        const p = (age - SPROUT_END) / (SAPLING_END - SPROUT_END)
        g.scale.setScalar(0.5 + easeOut(p) * 0.35)
      } else {
        g.scale.setScalar(t.scale)
      }
    }
  })

  const now = Date.now()

  return (
    <group>
      {trees.map((t, i) => {
        const age = (now - t.plantedAt) / 1000
        const shape = t.shape || 0
        const owned = !!t.owner
        const isSelected = owned && selection && selection.kind === 'tree' && selection.id === t.id
        const dyeMat = dyeMats[t.id] || null

        // Every planted tree is clickable, but only trees the player owns
        // can be selected/removed. Clicks on others toast a short reason —
        // no hover state, no scale bump: just a plain object with a proper
        // response when tapped.
        const onOver = owned
          ? () => { document.body.style.cursor = 'pointer' }
          : undefined
        const onOut = owned
          ? () => { document.body.style.cursor = '' }
          : undefined
        const onClick = (e) => {
          e.stopPropagation()
          if (!owned) {
            flash('this tree was planted by someone else')
            return
          }
          // Toggle: clicking the currently selected tree deselects it.
          if (isSelected) setSelection(null)
          else setSelection({ kind: 'tree', id: t.id })
        }

        return (
          // Use plaza floor height inside the Meadow Gate so planted trees
          // sit on the raised stone steps, not the raw terrain below (fix #6)
          <group key={t.id} position={[t.x, plazaFloorHeight(t.x, t.z) ?? terrainHeight(t.x, t.z), t.z]}>
            <group
              ref={(el) => (refs.current[i] = el)}
              onPointerOver={onOver}
              onPointerOut={onOut}
              onClick={onClick}
            >
              {/* Only enable the outline on the currently selected tree so
                  the amber glow reads as a decisive pick, not visual noise. */}
              <Select enabled={isSelected}>
                {age < SPROUT_END ? (
                  <Sprout />
                ) : age < SAPLING_END ? (
                  <Sapling variant={t.variant} />
                ) : (
                  <TreeParts variant={t.variant} shape={shape} dyeMat={dyeMat} />
                )}
              </Select>
            </group>
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

  const chunksRef = useRef(new Map())
  const [decorative, setDecorative] = useState([])

  // Delta chunk loader
  useEffect(() => {
    let changed = false
    const newKeys = new Set()

    // Generate new chunks
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const key = `${cx},${cz}`
        newKeys.add(key)

        if (!chunksRef.current.has(key)) {
          changed = true
          const arr = []
          const rng = mulberry32(seedFor(cx, cz) ^ 0x7)
          const n = 3 + Math.floor(rng() * 3)
          for (let i = 0; i < n; i++) {
            const x = cx * CHUNK + rng() * CHUNK
            const z = cz * CHUNK + rng() * CHUNK
            const t = {
              x, z,
              y: terrainHeight(x, z),
              s: 1.4 + rng() * 1.2,
              rot: rng() * Math.PI * 2,
              variant: (rng() * 3) | 0,
              shape: (rng() * 3) | 0,
              chunkKey: key
            }
            arr.push(t)
            treeRegistry.push({
              x: t.x, z: t.z,
              r: 0.8,
              placementR: 0.6 + t.s * 0.4,
              mature: true,
              chunkKey: key,
              _source: 'decorative'
            })
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
        for (let i = treeRegistry.length - 1; i >= 0; i--) {
          if (treeRegistry[i].chunkKey === key) {
            treeRegistry.splice(i, 1)
          }
        }
      }
    }

    if (changed) {
      const allDeco = []
      for (const arr of chunksRef.current.values()) {
        allDeco.push(...arr)
      }
      setDecorative(allDeco)
    }
  }, [center.cx, center.cz])

  // Sync planted trees to registry independently
  useEffect(() => {
    // Remove all old planted trees from registry
    for (let i = treeRegistry.length - 1; i >= 0; i--) {
      if (treeRegistry[i]._source === 'planted') {
        treeRegistry.splice(i, 1)
      }
    }
    const now = Date.now()
    for (const t of trees) {
      const grown = now - t.plantedAt >= GROW_SECONDS * 1000
      treeRegistry.push({
        x: t.x, z: t.z,
        r: 0.6,
        placementR: 1.3,
        mature: grown,
        _source: 'planted'
      })
    }
  }, [trees])

  const groupRefs = useRef([])
  const distantTrunksRef = useRef()
  const distantLeavesRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ camera }) => {
    if (!distantTrunksRef.current || !distantLeavesRef.current) return
    let count = 0
    for (let i = 0; i < decorative.length; i++) {
      const t = decorative[i]
      const dist = Math.hypot(t.x - camera.position.x, t.z - camera.position.z)
      const isNear = dist < 70
      
      if (groupRefs.current[i]) {
        groupRefs.current[i].visible = isNear
      }
      
      if (!isNear) {
        // Trunk matrix (Y offset +1.4)
        dummy.position.set(t.x, t.y + 1.4 * t.s, t.z)
        dummy.scale.setScalar(t.s)
        dummy.rotation.set(0, t.rot, 0)
        dummy.updateMatrix()
        distantTrunksRef.current.setMatrixAt(count, dummy.matrix)

        // Leaf matrix (Y offset +3.4, and scaled up)
        dummy.position.set(t.x, t.y + 3.4 * t.s, t.z)
        dummy.scale.set(1.5 * t.s, 1.4 * t.s, 1.5 * t.s)
        dummy.updateMatrix()
        distantLeavesRef.current.setMatrixAt(count, dummy.matrix)
        count++
      }
    }
    distantTrunksRef.current.count = count
    distantLeavesRef.current.count = count
    distantTrunksRef.current.instanceMatrix.needsUpdate = true
    distantLeavesRef.current.instanceMatrix.needsUpdate = true
  })

  // Clicking a decorative (world-generated) tree tells the player it can't
  // be removed. Without this, a click on such a tree falls through to
  // Canvas onPointerMissed and silently clears their real selection —
  // confusing. This handler both stops that AND gives useful feedback.
  const flash = useStore((s) => s.flash)
  const onDecorativeClick = (e) => {
    e.stopPropagation()
    flash('this tree grew here on its own — you can only remove trees you planted')
  }

  return (
    <group>
      <instancedMesh ref={distantTrunksRef} args={[trunkGeo, distantTrunkMat, 2000]} />
      <instancedMesh ref={distantLeavesRef} args={[leafGeo, distantLeafMat, 2000]} />
      {decorative.map((t, i) => (
        <group
          key={`${t.chunkKey}-${i}`}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[t.x, t.y, t.z]}
          scale={t.s}
          rotation={[0, t.rot, 0]}
          onClick={onDecorativeClick}
        >
          <TreeParts variant={t.variant} shape={t.shape} />
        </group>
      ))}
      <PlantedTrees trees={trees} />
    </group>
  )
}
