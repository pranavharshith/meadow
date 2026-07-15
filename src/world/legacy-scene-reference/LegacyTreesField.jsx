/**
 * LEGACY SCENE REFERENCE — TREES (archived 2026-07-15)
 * Superseded by the modular scene/vegetation implementation. Keep for visual
 * comparison and migration history; this file is intentionally not imported.
 */
import * as THREE from 'three'
import { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { generateTreeGeometries } from '../ProceduralTree'
import { useFrame } from '@react-three/fiber'
import {
  terrainHeight,
  terrainSlope,
  biomeSample,
  mulberry32,
  plotSignatureForChunk,
  isBadPropSpot,
} from '../noise'
import { CHUNK, seedFor } from '../chunk'
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
} from '../tree-assets'
import { treeRegistry, P } from '../../player-state'
import { useStore } from '../../store'
import { Select } from '@react-three/postprocessing'
import { plazaFloorHeight } from '../SpawnPlaza'
import { isInsidePlot } from '../plot-utils'

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
function MushroomTree({ dyeMat }) {
  const [mat, lightColor] = useMemo(() => {
    if (!dyeMat) return [mushroomCapMat, "#ff44ee"]
    const m = mushroomCapMat.clone()
    m.color.copy(dyeMat.color)
    m.emissive.copy(dyeMat.color)
    return [m, dyeMat.color.getHexString()]
  }, [dyeMat])
  return (
    <>
      <mesh geometry={mushroomStemGeo} material={mushroomStemMat} position={[0, 0.4, 0]} castShadow receiveShadow />
      <mesh geometry={mushroomCapGeo} material={mat} position={[0, 0.9, 0]} castShadow />
      <pointLight color={"#" + lightColor} intensity={3} distance={10} position={[0, 1.0, 0]} />
    </>
  )
}

// Shape 10: Golden Tree
function GoldenTree({ dyeMat }) {
  const [mat, lightColor] = useMemo(() => {
    if (!dyeMat) return [goldenLeafMat, "#ffd700"]
    const m = goldenLeafMat.clone()
    m.color.copy(dyeMat.color)
    return [m, dyeMat.color.getHexString()]
  }, [dyeMat])
  return (
    <>
      <mesh geometry={trunkGeo} material={goldenTrunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={mat} position={[0, 3.4, 0]} scale={[1.8, 1.6, 1.8]} castShadow />
      <mesh geometry={leafGeo} material={mat} position={[0.8, 3.0, 0.6]} scale={1.2} castShadow />
      <mesh geometry={leafGeo} material={mat} position={[-0.7, 2.9, -0.5]} scale={1.1} castShadow />
      <mesh geometry={leafGeo} material={mat} position={[-0.8, 3.2, 0.5]} scale={0.9} castShadow />
      <mesh geometry={leafGeo} material={mat} position={[0.7, 3.5, -0.6]} scale={0.8} castShadow />
      <pointLight color={"#" + lightColor} intensity={1} distance={6} position={[0, 3.0, 0]} />
    </>
  )
}

// Shape 11: Star Tree
function StarTree({ dyeMat }) {
  const [mat, lightColor] = useMemo(() => {
    if (!dyeMat) return [starLeafMat, "#88ccff"]
    const m = starLeafMat.clone()
    m.color.copy(dyeMat.color)
    m.emissive.copy(dyeMat.color)
    return [m, dyeMat.color.getHexString()]
  }, [dyeMat])
  return (
    <>
      <mesh geometry={cherryTrunkGeo} material={starTrunkMat} position={[0, 1.3, 0]} castShadow receiveShadow />
      <mesh geometry={cherryLeafGeo} material={mat} position={[0, 3.5, 0]} scale={[0.8, 2.0, 0.8]} />
      <mesh geometry={cherryLeafGeo} material={mat} position={[0, 3.5, 0]} scale={[2.0, 0.8, 0.8]} rotation={[0, Math.PI/4, 0]} />
      <mesh geometry={cherryLeafGeo} material={mat} position={[0, 3.5, 0]} scale={[2.0, 0.8, 0.8]} rotation={[0, -Math.PI/4, 0]} />
      <pointLight color={"#" + lightColor} intensity={3} distance={12} position={[0, 3.5, 0]} />
    </>
  )
}

// Picks the right tree shape component based on shape index
function ProceduralTreeMesh({ seed, shape = 0, variant, dyeMat }) {
  const [geos] = useState(() => generateTreeGeometries(seed))
  
  useEffect(() => {
    return () => {
      geos.trunkGeo.dispose()
      geos.leafGeo.dispose()
    }
  }, [geos])

  const [tMat, lMat, lightColor] = useMemo(() => {
    let t = trunkMat
    let l = dyeMat || leafMats[variant % leafMats.length]
    let c = null
    
    if (shape === 1) { t = pineTrunkMat; l = dyeMat || pineLeafMats[variant % pineLeafMats.length] }
    else if (shape === 2) { l = dyeMat || bushyLeafMats[variant % bushyLeafMats.length] }
    else if (shape === 3) { t = willowTrunkMat; l = dyeMat || willowLeafMats[variant % willowLeafMats.length] }
    else if (shape === 4) { l = dyeMat || cherryLeafMats[variant % cherryLeafMats.length] }
    else if (shape === 10) { 
      t = goldenTrunkMat
      if (!dyeMat) l = goldenLeafMat
      else { l = goldenLeafMat.clone(); l.color.copy(dyeMat.color) }
      c = dyeMat ? dyeMat.color.getHexString() : "ffd700"
    }
    else if (shape === 11) { 
      t = starTrunkMat
      if (!dyeMat) l = starLeafMat
      else { l = starLeafMat.clone(); l.color.copy(dyeMat.color); l.emissive.copy(dyeMat.color) }
      c = dyeMat ? dyeMat.color.getHexString() : "88ccff"
    }
    return [t, l, c]
  }, [shape, variant, dyeMat])

  if (shape === 5) {
    return <MushroomTree dyeMat={dyeMat} />
  }

  return (
    <group>
      <mesh geometry={geos.trunkGeo} material={tMat} castShadow receiveShadow />
      <mesh geometry={geos.leafGeo} material={lMat} castShadow />
      {lightColor && <pointLight color={"#" + lightColor} intensity={2} distance={10} position={[0, 3.5, 0]} />}
    </group>
  )
}

// Picks the right tree shape component based on shape index
function TreeParts({ variant, shape = 0, dyeMat }) {
  switch (shape) {
    case 1: return <PineTree variant={variant} dyeMat={dyeMat} />
    case 2: return <BushyTree variant={variant} dyeMat={dyeMat} />
    case 3: return <WillowTree variant={variant} dyeMat={dyeMat} />
    case 4: return <CherryBlossomTree variant={variant} dyeMat={dyeMat} />
    case 5: return <MushroomTree dyeMat={dyeMat} />
    case 10: return <GoldenTree dyeMat={dyeMat} />
    case 11: return <StarTree dyeMat={dyeMat} />
    default: return <BroadleafTree variant={variant} dyeMat={dyeMat} />
  }
}

const GROWTH_SECONDS = 90

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

      if (age < GROWTH_SECONDS) {
        const p = age / GROWTH_SECONDS
        const baseScale = t.scale || 1
        g.scale.setScalar(baseScale * (0.1 + easeOut(p) * 0.9))
      } else {
        g.scale.setScalar(t.scale || 1)
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
          if (cuttingId === t.id) return
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
                <ProceduralTreeMesh seed={t.seed || t.id} variant={t.variant} shape={shape} dyeMat={dyeMat} />
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
  const plots = useStore((s) => s.plots)

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const chunksRef = useRef(new Map())
  const plotSigRef = useRef(new Map()) // chunk key → plot signature at gen time
  const [decorative, setDecorative] = useState([])

  // Delta chunk loader — regen chunks whose plot pad changed (C5)
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

        const sig = plotSignatureForChunk(cx, cz, CHUNK)
        if (chunksRef.current.has(key) && plotSigRef.current.get(key) !== sig) {
          chunksRef.current.delete(key)
          // drop registry entries for this chunk
          for (let i = treeRegistry.length - 1; i >= 0; i--) {
            if (treeRegistry[i].chunkKey === key && treeRegistry[i]._source === 'decorative') {
              treeRegistry.splice(i, 1)
            }
          }
        }

        if (!chunksRef.current.has(key)) {
          changed = true
          plotSigRef.current.set(key, sig)
          const arr = []
          const rng = mulberry32(seedFor(cx, cz) ^ 0x7)
          const candidateCount = 38 + Math.floor(rng() * 15)
          const isInPlot = (x, z) => {
            for (let p = 0; p < (plots?.length || 0); p++) {
              if (isInsidePlot(plots[p], x, z)) return true
            }
            return false
          }

          // Candidates are accepted through the shared biome mask. A small
          // baseline keeps meadows picturesque while high values form groves
          // with readable forest edges instead of an even prop scatter.
          for (let i = 0; i < candidateCount; i++) {
            const x = cx * CHUNK + rng() * CHUNK
            const z = cz * CHUNK + rng() * CHUNK
            // Consume every random value before branching so IDs and nearby
            // patterns remain stable when an exclusion rejects a candidate.
            const ageRoll = rng()
            const rot = rng() * Math.PI * 2
            const variant = (rng() * 3) | 0
            const speciesRoll = rng()
            const width = 0.76 + rng() * 0.48
            const height = 0.84 + rng() * 0.34
            const leanX = (rng() - 0.5) * 0.075
            const leanZ = (rng() - 0.5) * 0.075
            const acceptRoll = rng()

            if (isBadPropSpot(x, z) || isInPlot(x, z) || Math.hypot(x, z) < 20) continue
            const plazaY = plazaFloorHeight(x, z)
            const y = plazaY !== null ? plazaY : terrainHeight(x, z)
            const slope = terrainSlope(x, z)
            const biome = biomeSample(x, z, slope, y)
            if (slope > 0.76 || acceptRoll > 0.16 + biome.forest * 0.76) continue

            const s = 0.62 + Math.pow(ageRoll, 0.62) * 2.05
            const spacing = 2.2 + s * width * 0.68
            if (arr.some((other) => Math.hypot(x - other.x, z - other.z) < spacing + other.s * 0.42)) continue

            let shape = 0
            if (biome.moisture > 0.72 && speciesRoll < 0.30) shape = 3
            else if ((biome.dryness > 0.55 || y > 2.5) && speciesRoll < 0.48) shape = 1
            else if (speciesRoll < 0.68) shape = 2
            else if (biome.warmth > 0.64 && speciesRoll > 0.965) shape = 4

            const t = {
              localId: i,
              x,
              z,
              y,
              s,
              rot,
              variant,
              shape,
              width,
              height,
              leanX,
              leanZ,
              forest: biome.forest,
              moisture: biome.moisture,
              chunkKey: key,
            }
            arr.push(t)
            treeRegistry.push({
              x: t.x, z: t.z,
              r: Math.max(0.55, t.s * t.width * 0.34),
              placementR: 0.65 + t.s * t.width * 0.5,
              mature: true,
              chunkKey: key,
              _source: 'decorative',
              idStr: `${key}_${i}_tree`,
            })
          }
          chunksRef.current.set(key, arr)
        }
      }
    }

    // Prune old chunks
    let registryNeedsCompact = false
    for (const key of chunksRef.current.keys()) {
      if (!newKeys.has(key)) {
        changed = true
        registryNeedsCompact = true
        chunksRef.current.delete(key)
      }
    }

    if (registryNeedsCompact) {
      let j = 0
      for (let i = 0; i < treeRegistry.length; i++) {
        // Keep it if it's NOT a decorative tree, OR if its chunk is still in newKeys
        if (treeRegistry[i]._source !== 'decorative' || newKeys.has(treeRegistry[i].chunkKey)) {
          treeRegistry[j++] = treeRegistry[i]
        }
      }
      treeRegistry.length = j
    }

    if (changed) {
      const allDeco = []
      for (const arr of chunksRef.current.values()) {
        allDeco.push(...arr)
      }
      setDecorative(allDeco)
      dirtyLOD.current = true
    }
  }, [center.cx, center.cz, plots])

  const cutResources = useStore((s) => s.cutResources)

  // Sync planted trees to registry independently
  useEffect(() => {
    // Remove all old planted trees from registry (O(N) compaction instead of O(N^2) splice)
    let j = 0
    for (let i = 0; i < treeRegistry.length; i++) {
      if (treeRegistry[i]._source !== 'planted') {
        treeRegistry[j++] = treeRegistry[i]
      }
    }
    treeRegistry.length = j
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
  const distTrunk0 = useRef()
  const distLeaf0 = useRef()
  const distTrunk1 = useRef()
  const distLeaf1 = useRef()
  const distTrunk2 = useRef()
  const distLeaf2 = useRef()
  const lastCamPos = useRef(new THREE.Vector3(9999, 9999, 9999))
  const dirtyLOD = useRef(true)

  const matrices = useMemo(() => {
    const arr = []
    const dummy = new THREE.Object3D()
    for (let i = 0; i < decorative.length; i++) {
      const t = decorative[i]
      const sx = t.s * t.width
      const sy = t.s * t.height
      let tm, lm
      dummy.rotation.set(t.leanX, t.rot, t.leanZ)
      if (t.shape === 1) {
        dummy.position.set(t.x, t.y + 1.6 * sy, t.z)
        dummy.scale.set(sx, sy, sx)
        dummy.updateMatrix()
        tm = dummy.matrix.clone()

        dummy.position.set(t.x, t.y + 3.6 * sy, t.z)
        dummy.scale.set(sx, sy, sx)
        dummy.updateMatrix()
        lm = dummy.matrix.clone()
      } else if (t.shape === 2) {
        dummy.position.set(t.x, t.y + 0.9 * sy, t.z)
        dummy.scale.set(sx, sy, sx)
        dummy.updateMatrix()
        tm = dummy.matrix.clone()

        dummy.position.set(t.x, t.y + 2.5 * sy, t.z)
        dummy.scale.set(1.3 * sx, 1.1 * sy, 1.3 * sx)
        dummy.updateMatrix()
        lm = dummy.matrix.clone()
      } else {
        dummy.position.set(t.x, t.y + 1.4 * sy, t.z)
        dummy.scale.set(sx, sy, sx)
        dummy.updateMatrix()
        tm = dummy.matrix.clone()

        dummy.position.set(t.x, t.y + 3.4 * sy, t.z)
        dummy.scale.set(1.5 * sx, 1.4 * sy, 1.5 * sx)
        dummy.updateMatrix()
        lm = dummy.matrix.clone()
      }

      arr.push({ tm, lm })
    }
    return arr
  }, [decorative])

  useFrame(({ camera }) => {
    if (!distTrunk0.current || !distLeaf0.current || !distTrunk1.current || !distLeaf1.current || !distTrunk2.current || !distLeaf2.current) return
    
    // Only update LODs if camera moved significantly (2 units) or chunks changed
    const moved = lastCamPos.current.distanceToSquared(camera.position) >= 4
    if (!moved && !dirtyLOD.current) return
    
    lastCamPos.current.copy(camera.position)
    dirtyLOD.current = false

    let c0 = 0, c1 = 0, c2 = 0
    const cx = camera.position.x
    const cz = camera.position.z

    for (let i = 0; i < decorative.length; i++) {
      const t = decorative[i]
      const idStr = `${t.chunkKey}_${t.localId}_tree`
      if (cutResources[idStr]) {
        if (groupRefs.current[i]) groupRefs.current[i].visible = false
        continue
      }
      
      const distSq = (t.x - cx) ** 2 + (t.z - cz) ** 2
      const isNear = distSq < 4900 // 70^2
      
      if (groupRefs.current[i]) {
        groupRefs.current[i].visible = isNear
      }
      
      if (!isNear) {
        if (t.shape === 1) {
          distTrunk1.current.setMatrixAt(c1, matrices[i].tm)
          distLeaf1.current.setMatrixAt(c1, matrices[i].lm)
          c1++
        } else if (t.shape === 2) {
          distTrunk2.current.setMatrixAt(c2, matrices[i].tm)
          distLeaf2.current.setMatrixAt(c2, matrices[i].lm)
          c2++
        } else {
          distTrunk0.current.setMatrixAt(c0, matrices[i].tm)
          distLeaf0.current.setMatrixAt(c0, matrices[i].lm)
          c0++
        }
      }
    }
    distTrunk0.current.count = c0
    distLeaf0.current.count = c0
    distTrunk0.current.instanceMatrix.needsUpdate = true
    distLeaf0.current.instanceMatrix.needsUpdate = true
    
    distTrunk1.current.count = c1
    distLeaf1.current.count = c1
    distTrunk1.current.instanceMatrix.needsUpdate = true
    distLeaf1.current.instanceMatrix.needsUpdate = true
    
    distTrunk2.current.count = c2
    distLeaf2.current.count = c2
    distTrunk2.current.instanceMatrix.needsUpdate = true
    distLeaf2.current.instanceMatrix.needsUpdate = true
  })

  const cutProcedural = useStore((s) => s.cutProcedural)
  const onDecorativeClick = (t, e) => {
    e.stopPropagation()
    const idStr = `${t.chunkKey}_${t.localId}_tree`
    cutProcedural(t.chunkKey, t.localId, 'tree', idStr)
  }

  return (
    <group>
      <instancedMesh ref={distTrunk0} args={[trunkGeo, distantTrunkMat, 1000]} frustumCulled={false} />
      <instancedMesh ref={distLeaf0} args={[leafGeo, distantLeafMat, 1000]} frustumCulled={false} />
      
      <instancedMesh ref={distTrunk1} args={[pineTrunkGeo, distantTrunkMat, 1000]} frustumCulled={false} />
      <instancedMesh ref={distLeaf1} args={[pineLeafGeo, distantLeafMat, 1000]} frustumCulled={false} />
      
      <instancedMesh ref={distTrunk2} args={[bushyTrunkGeo, distantTrunkMat, 1000]} frustumCulled={false} />
      <instancedMesh ref={distLeaf2} args={[bushyLeafGeo, distantLeafMat, 1000]} frustumCulled={false} />
      {decorative.map((t, i) => {
        const idStr = `${t.chunkKey}_${t.localId}_tree`
        if (cutResources[idStr]) return null
        return (
        <group
          key={idStr}
          ref={(el) => (groupRefs.current[i] = el)}
          position={[t.x, t.y, t.z]}
          scale={t.s}
          rotation={[0, t.rot, 0]}
          onClick={(e) => onDecorativeClick(t, e)}
          onPointerOver={() => { document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { document.body.style.cursor = '' }}
        >
          <TreeParts variant={t.variant} shape={t.shape} />
        </group>
      )})}
      <PlantedTrees trees={trees} />
    </group>
  )
}
