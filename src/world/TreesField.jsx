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
  saplingTrunkGeo, saplingLeafGeo, saplingLeafMat,
  sproutGeo, sproutLeafGeo, sproutLeafMat,
  makeLeafMat,
} from './tree-assets'
import { treeRegistry, P } from '../player-state'
import { useStore } from '../store'
import { Select } from '@react-three/postprocessing'
import { plazaFloorHeight } from './SpawnPlaza'

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

// Shape 3: Willow
function WillowTree({ variant, dyeMat }) {
  const m1 = dyeMat || willowLeafMats[variant % 3]
  const m2 = dyeMat || willowLeafMats[(variant + 1) % 3]
  const m3 = dyeMat || willowLeafMats[(variant + 2) % 3]
  return (
    <>
      <mesh geometry={willowTrunkGeo} material={willowTrunkMat} position={[0, 1.7, 0]} castShadow receiveShadow />
      <mesh geometry={willowLeafGeo} material={m1} position={[0, 3.8, 0]} scale={[1.6, 1.8, 1.6]} castShadow />
      <mesh geometry={willowLeafGeo} material={m2} position={[0.5, 3.2, 0.4]} scale={0.8} castShadow />
      <mesh geometry={willowLeafGeo} material={m3} position={[-0.4, 3.0, -0.3]} scale={0.7} castShadow />
    </>
  )
}

// Picks the right tree shape component based on shape index
function TreeParts({ variant, shape = 0, dyeMat }) {
  switch (shape) {
    case 1: return <PineTree variant={variant} dyeMat={dyeMat} />
    case 2: return <BushyTree variant={variant} dyeMat={dyeMat} />
    case 3: return <WillowTree variant={variant} dyeMat={dyeMat} />
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
        // Shrink scale toward 0 with a little tilt
        const baseScale = t.scale || 1
        g.scale.setScalar(baseScale * (1 - p))
        g.rotation.z = p * 1.1 // tip over
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
            shape: (rng() * 4) | 0, // 0=broadleaf, 1=pine, 2=bushy, 3=willow
          })
        }
      }
    }
    return arr
  }, [center.cx, center.cz])

  useEffect(() => {
    const now = Date.now()
    treeRegistry.length = 0
    // r          — trunk-ish physics radius (player can brush past the canopy)
    // placementR — canopy extent, used by PlacementPreview so nothing new
    //              gets planted underneath an existing tree's crown even
    //              if the trunks aren't touching.
    for (const t of decorative) {
      // Decorative canopies scale with the tree's own `s` (1.4–2.6). We
      // don't want to reserve the whole visual crown radius (2–5 units!)
      // because casually planting near a big tree should feel possible.
      // 0.6 + s*0.4 gives a snug placement radius that keeps trunks
      // meaningfully apart without demanding a small forest of clearance.
      treeRegistry.push({
        x: t.x, z: t.z,
        r: 0.8,
        placementR: 0.6 + t.s * 0.4,
        mature: true,
      })
    }
    for (const t of trees) {
      const grown = now - t.plantedAt >= GROW_SECONDS * 1000
      treeRegistry.push({
        x: t.x, z: t.z,
        r: 0.6,
        // Reserve the grown footprint even while it's a sapling — otherwise
        // players could crowd a young tree and get overlap once it matures.
        placementR: 1.3,
        mature: grown,
      })
    }
  }, [decorative, trees])

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
      {decorative.map((t, i) => (
        <group
          key={i}
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
