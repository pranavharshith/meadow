import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { P, treeRegistry, rockRegistry, craftedRegistry, placement } from '../player-state'
import { useStore } from '../store'
import { ROCK_GEOS } from './rock-assets'
import { CraftedItemParts } from './CraftedItems'
import { terrainHeight } from './noise'
import { LANDMARKS } from './places'
import {
  isOverWater as pointInWater,
  STREAM_SAMPLE_POINTS,
  STREAM_WIDTH,
  PONDS,
} from './water-path'
import { plazaFloorHeight, PLAZA_OUTER_RADIUS } from './SpawnPlaza'

// Placement preview:
//   Renders a translucent green/red ghost of the tree or rock being placed,
//   1.8 units in front of the player, following as they turn or walk.
//   Green when the spot is valid; red when it isn't — the player can only
//   confirm placement on a green ghost. Validity is re-checked every frame
//   against ALL nearby trees/rocks (decorative + user-placed) so overlap
//   is impossible.
//
// Rules for "cannot place here":
//   1. Too close to any tree in `treeRegistry`
//   2. Too close to any rock in `rockRegistry`
//   3. Too close to any crafted item in `craftedRegistry`
//   4. On terrain that's too steep (feels physically wrong)
//   5. Below the water line

const PLACE_DIST = 1.8            // distance in front of the player
const PLACE_BUFFER = 0.6          // extra clearance between neighbours

// Ghost-side radii: sized to match the actual visual extent of the object
// being placed, not just its trunk. A broadleaf tree's canopy sits inside
// a 1.5-unit horizontal envelope; rocks are ~1.0. These pair with the
// `placementR` values published by TreesField/Rocks so the check operates
// on real silhouettes rather than physics radii.
const TREE_RADIUS = 1.5
const ROCK_RADIUS = 1.1
const CRAFTED_RADIUS = 0.8
const PLOT_RADIUS = 10
const PLOT_LANDMARK_MIN = 20      // min distance from a landmark centre
const PLOT_PLOT_MIN = 15          // min distance from another plot's centre
const SLOPE_LIMIT = 1.8           // max height delta across a 1-unit probe
const WATER_MARGIN = 0.4

function isOverWater(x, z) {
  return pointInWater(x, z, WATER_MARGIN)
}

const COLOR_OK = new THREE.Color('#7ee38a')
const COLOR_BAD = new THREE.Color('#ff6a60')

// Rock geometries now imported from rock-assets.js

// Ghost visuals per shape. We deliberately use simplified silhouettes rather
// than the real assets — the ghost only needs to communicate footprint +
// rough shape, and keeping it lightweight means zero perf cost when active.
function TreeGhost({ shape, material }) {
  switch (shape) {
    case 1: // Pine
      return (
        <>
          <mesh position={[0, 1.5, 0]} material={material}>
            <cylinderGeometry args={[0.15, 0.2, 3, 6]} />
          </mesh>
          <mesh position={[0, 3.6, 0]} material={material}>
            <coneGeometry args={[1.4, 3.5, 8]} />
          </mesh>
        </>
      )
    case 2: // Bushy
      return (
        <>
          <mesh position={[0, 0.9, 0]} material={material}>
            <cylinderGeometry args={[0.2, 0.25, 1.6, 6]} />
          </mesh>
          <mesh position={[0, 2.4, 0]} scale={[1.3, 1.1, 1.3]} material={material}>
            <sphereGeometry args={[1.3, 12, 8]} />
          </mesh>
        </>
      )
    case 3: // Willow
      return (
        <>
          <mesh position={[0, 1.7, 0]} material={material}>
            <cylinderGeometry args={[0.16, 0.22, 3.2, 6]} />
          </mesh>
          <mesh position={[0, 3.8, 0]} scale={[1.6, 1.8, 1.6]} material={material}>
            <sphereGeometry args={[1.4, 12, 10]} />
          </mesh>
        </>
      )
    default: // Broadleaf
      return (
        <>
          <mesh position={[0, 1.4, 0]} material={material}>
            <cylinderGeometry args={[0.18, 0.22, 2.8, 6]} />
          </mesh>
          <mesh position={[0, 3.4, 0]} scale={[1.5, 1.4, 1.5]} material={material}>
            <sphereGeometry args={[1.3, 12, 8]} />
          </mesh>
        </>
      )
  }
}

function RockGhost({ rockShape, material }) {
  const geo = ROCK_GEOS[rockShape ?? 2]
  return (
    <mesh geometry={geo} position={[0, 0.7, 0]} scale={[1.0, 0.7, 1.0]} material={material} />
  )
}

function PlotGhost({ material, subject, groupRef }) {
  const w = subject?.width || 20
  const d = subject?.depth || 20
  
  const geo = useMemo(() => {
    const isCircle = subject?.shapeType === 0
    const g = isCircle ? new THREE.CircleGeometry(w, 48) : new THREE.PlaneGeometry(w * 2, d * 2, 16, 16)
    g.rotateX(-Math.PI / 2)
    return g
  }, [subject, w, d])

  useFrame(() => {
    if (!groupRef.current) return
    const pos = geo.attributes.position
    const cx = groupRef.current.position.x
    const cz = groupRef.current.position.z
    const cy = groupRef.current.position.y
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i)
      const lz = pos.getZ(i)
      const h = terrainHeight(cx + lx, cz + lz)
      pos.setY(i, h - cy + 0.1)
    }
    pos.needsUpdate = true
  })

  return (
    <mesh geometry={geo} material={material} />
  )
}

export default function PlacementPreview() {
  const mode = useStore((s) => s.placementMode)
  const subject = useStore((s) => s.placementSubject)

  const groupRef = useRef()

  // Single shared material so every mesh in the ghost tints together.
  // Cloned per-mount so re-entering placement mode gets a fresh instance.
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COLOR_OK.clone(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [mode] // reset when mode changes (tree ↔ rock)
  )

  useFrame(() => {
    if (!mode || !groupRef.current) return

    const px = P.pos.x + Math.sin(P.avatarYaw) * PLACE_DIST
    const pz = P.pos.z + Math.cos(P.avatarYaw) * PLACE_DIST
    // Use plaza floor height inside the Meadow Gate so the ghost appears on
    // top of the raised stone steps, not sunken into the raw terrain (fix #4)
    const plazaY = plazaFloorHeight(px, pz)
    const py = plazaY !== null ? plazaY : terrainHeight(px, pz)
    const insidePlaza = plazaY !== null

    groupRef.current.position.set(px, py, pz)
    groupRef.current.rotation.y = mode === 'rock' ? P.avatarYaw : 0

    // ── Validity ────────────────────────────────────────────────────────
    const myR = mode === 'rock' ? ROCK_RADIUS : mode === 'crafted' ? CRAFTED_RADIUS : TREE_RADIUS
    let valid = true
    let reason = ''

    // Helper for plot bounds checking
    const inPlot = (px, pz, p) => {
      const w = p.width ?? p.radius ?? 10
      const d = p.depth ?? p.radius ?? 10
      if (p.shapeType === 1) {
        return Math.abs(px - p.x) <= w && Math.abs(pz - p.z) <= d
      }
      return Math.hypot(p.x - px, p.z - pz) <= w
    }

    if (mode === 'plot') {
      const store = useStore.getState()
      const sw = subject.width || 20
      const sd = subject.depth || 20
      
      const checkDist = (ox, oz, minDist) => {
        if (subject.shapeType === 1) {
          // crude AABB expansion check
          return Math.abs(ox - px) < sw + minDist && Math.abs(oz - pz) < sd + minDist
        }
        return Math.hypot(ox - px, oz - pz) < sw + minDist
      }

      // Check distance from landmarks
      for (const lm of LANDMARKS) {
        if (checkDist(lm.x, lm.z, PLOT_LANDMARK_MIN)) {
          valid = false
          reason = 'too close to a landmark'
          break
        }
      }
      // Check distance from other plots
      if (valid) {
        for (const p of store.plots) {
          const pw = p.width ?? p.radius ?? 10
          if (checkDist(p.x, p.z, pw + 5)) { // 5 unit buffer between plots
            valid = false
            reason = 'overlaps another plot'
            break
          }
        }
      }
      // Check gold handled by UI now, but just in case
      let cost = 0
      if (subject.shapeType === 0) cost = Math.round((3.14159 * sw * sw) * 0.8)
      else cost = Math.round((sw * sd) * 0.6)
      if (valid && store.gold < cost) {
        valid = false
        reason = `need ${cost} gold`
      }
      // Water: ponds + dense stream samples (shared path — C3)
      if (valid) {
        for (const p of PONDS) {
          if (checkDist(p.x, p.z, p.r + WATER_MARGIN)) {
            valid = false
            reason = 'plot would overlap water'
            break
          }
        }
        if (valid) {
          for (let i = 0; i < STREAM_SAMPLE_POINTS.length; i += 2) {
            const a = STREAM_SAMPLE_POINTS[i]
            if (checkDist(a.x, a.z, STREAM_WIDTH * 0.5 + WATER_MARGIN + 1.2)) {
              valid = false
              reason = 'plot would overlap water'
              break
            }
          }
        }
      }
      // Slope: sample bounds
      if (valid) {
        let maxH = py
        let minH = py
        const samples = []
        if (subject.shapeType === 0) {
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8
            samples.push({ x: px + Math.cos(a) * sw, z: pz + Math.sin(a) * sw })
          }
        } else {
          samples.push({ x: px - sw, z: pz - sd }, { x: px + sw, z: pz - sd })
          samples.push({ x: px - sw, z: pz + sd }, { x: px + sw, z: pz + sd })
        }
        for (const s of samples) {
          const h = terrainHeight(s.x, s.z)
          if (h > maxH) maxH = h
          if (h < minH) minH = h
        }
        if (maxH - minH > SLOPE_LIMIT * 3) {
          valid = false
          reason = 'ground is too steep for a plot'
        }
      }
    }

    if (valid && mode !== 'plot' && isOverWater(px, pz)) {
      valid = false
      reason = 'cannot place on water'
    }
    if (valid && mode !== 'plot') {
      // Skip the slope check inside the Meadow Gate plaza — the steps are
      // geometrically flat but raw terrainHeight() returns curved bowl values,
      // which would falsely reject valid placements on the flat stone (fix #7).
      if (!insidePlaza) {
        const h0 = terrainHeight(px + 1, pz)
        const h1 = terrainHeight(px - 1, pz)
        const h2 = terrainHeight(px, pz + 1)
        const h3 = terrainHeight(px, pz - 1)
        const maxH = Math.max(h0, h1, h2, h3, py)
        const minH = Math.min(h0, h1, h2, h3, py)
        if (maxH - minH > SLOPE_LIMIT) {
          valid = false
          reason = 'ground is too steep'
        }
      }
    }
    // For plots, skip tree/rock/territory checks (plot is territorial, not physical)
    if (mode !== 'plot') {
      if (valid) {
        const store = useStore.getState()
        for (const p of store.plots) {
          // If we're planting inside a plot that we don't own, block it!
          if (!p.owner && inPlot(px, pz, p)) {
            valid = false
            reason = 'this land belongs to someone else'
            break
          }
        }
      }
      if (valid) {
        for (const t of treeRegistry) {
          const other = t.placementR ?? t.r ?? 0.7
          const d = Math.hypot(t.x - px, t.z - pz)
          if (d < myR + other + PLACE_BUFFER) {
            valid = false
            reason = 'too close to another tree'
            break
          }
        }
      }
      if (valid) {
        for (const r of rockRegistry) {
          const other = r.placementR ?? r.r ?? 0.9
          const d = Math.hypot(r.x - px, r.z - pz)
          if (d < myR + other + PLACE_BUFFER) {
            valid = false
            reason = 'too close to a rock'
            break
          }
        }
      }
      if (valid) {
        for (const c of craftedRegistry) {
          const other = c.placementR ?? c.r ?? 0.8
          const d = Math.hypot(c.x - px, c.z - pz)
          if (d < myR + other + PLACE_BUFFER) {
            valid = false
            reason = 'too close to a crafted item'
            break
          }
        }
      }
    }

    // Publish to the shared ref for the store's confirmPlacement().
    placement.x = px
    placement.z = pz
    placement.yaw = P.avatarYaw
    placement.valid = valid
    placement.reason = reason

    material.color = valid ? COLOR_OK : COLOR_BAD
  })

  if (!mode || !subject) return null

  return (
    <group ref={groupRef}>
      {mode === 'plot' ? (
        <PlotGhost material={material} subject={subject} groupRef={groupRef} />
      ) : mode === 'rock' ? (
        <RockGhost rockShape={subject.rockShape ?? 2} material={material} />
      ) : mode === 'crafted' ? (
        <CraftedItemParts itemId={subject.id} material={material} />
      ) : (
        <TreeGhost shape={subject.shape ?? 0} material={material} />
      )}
    </group>
  )
}
