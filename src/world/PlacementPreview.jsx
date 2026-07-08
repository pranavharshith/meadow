import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { P, treeRegistry, rockRegistry, placement } from '../player-state'
import { useStore } from '../store'
import { terrainHeight } from './noise'
import { LANDMARKS } from './places'
import { PONDS, STREAM_POINTS, STREAM_WIDTH } from './Water'

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
//   3. On terrain that's too steep (feels physically wrong)
//   4. Below the water line

const PLACE_DIST = 1.8            // distance in front of the player
const PLACE_BUFFER = 0.6          // extra clearance between neighbours

// Ghost-side radii: sized to match the actual visual extent of the object
// being placed, not just its trunk. A broadleaf tree's canopy sits inside
// a 1.5-unit horizontal envelope; rocks are ~1.0. These pair with the
// `placementR` values published by TreesField/Rocks so the check operates
// on real silhouettes rather than physics radii.
const TREE_RADIUS = 1.5
const ROCK_RADIUS = 1.1
const PLOT_RADIUS = 10
const PLOT_LANDMARK_MIN = 20      // min distance from a landmark centre
const PLOT_PLOT_MIN = 15          // min distance from another plot's centre
const SLOPE_LIMIT = 1.8           // max height delta across a 1-unit probe
const WATER_MARGIN = 0.4          // extra padding around ponds/streams

// True if (x,z) sits over one of the ponds or the winding stream.
function isOverWater(x, z) {
  for (const p of PONDS) {
    if (Math.hypot(p.x - x, p.z - z) < p.r + WATER_MARGIN) return true
  }
  // Stream: check distance from each line segment between consecutive points
  const halfW = STREAM_WIDTH * 0.5 + WATER_MARGIN
  for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
    const a = STREAM_POINTS[i]
    const b = STREAM_POINTS[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    if (len2 <= 1e-6) continue
    // Project (x,z) onto segment ab, clamp to [0,1]
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const cx = a.x + dx * t
    const cz = a.z + dz * t
    if (Math.hypot(x - cx, z - cz) < halfW) return true
  }
  return false
}

const COLOR_OK = new THREE.Color('#7ee38a')
const COLOR_BAD = new THREE.Color('#ff6a60')

// Rock geometries mirroring the shapes used elsewhere (see Rocks.jsx).
// Cached once so switching subject doesn't allocate.
const ROCK_GHOST_GEOS = (() => {
  const boulder = new THREE.DodecahedronGeometry(1, 0); boulder.scale(1, 0.5, 1)
  const standing = new THREE.DodecahedronGeometry(1, 0); standing.scale(0.6, 1.4, 0.6)
  const round = new THREE.DodecahedronGeometry(1, 0)
  return { 0: boulder, 1: standing, 2: round }
})()

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
  const geo = ROCK_GHOST_GEOS[rockShape] || ROCK_GHOST_GEOS[2]
  return (
    <mesh geometry={geo} position={[0, 0.7, 0]} scale={[1.0, 0.7, 1.0]} material={material} />
  )
}

function PlotGhost({ material }) {
  return (
    <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <torusGeometry args={[10, 0.15, 8, 48]} />
    </mesh>
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
        toneMapped: false,
      }),
    [mode] // reset when mode changes (tree ↔ rock)
  )

  useFrame(() => {
    if (!mode || !groupRef.current) return

    const px = P.pos.x + Math.sin(P.avatarYaw) * PLACE_DIST
    const pz = P.pos.z + Math.cos(P.avatarYaw) * PLACE_DIST
    const py = terrainHeight(px, pz)

    groupRef.current.position.set(px, py, pz)
    groupRef.current.rotation.y = mode === 'rock' ? P.avatarYaw : 0

    // ── Validity ────────────────────────────────────────────────────────
    const myR = mode === 'rock' ? ROCK_RADIUS : mode === 'plot' ? PLOT_RADIUS : TREE_RADIUS
    let valid = true
    let reason = ''

    if (mode === 'plot') {
      const store = useStore.getState()
      // Check distance from landmarks
      for (const lm of LANDMARKS) {
        if (Math.hypot(lm.x - px, lm.z - pz) < PLOT_LANDMARK_MIN) {
          valid = false
          reason = 'too close to a landmark'
          break
        }
      }
      // Check distance from other plots
      if (valid) {
        for (const p of store.plots) {
          if (Math.hypot(p.x - px, p.z - pz) < PLOT_PLOT_MIN) {
            valid = false
            reason = 'overlaps another plot'
            break
          }
        }
      }
      // Check gold
      if (valid && store.gold < 250) {
        valid = false
        reason = `need 250 gold`
      }
      // Water: check the entire 10-unit radius circle, not just the center
      if (valid) {
        for (const p of PONDS) {
          if (Math.hypot(p.x - px, p.z - pz) < p.r + WATER_MARGIN + PLOT_RADIUS) {
            valid = false
            reason = 'plot would overlap water'
            break
          }
        }
        if (valid) {
          const halfW = STREAM_WIDTH * 0.5 + WATER_MARGIN + PLOT_RADIUS
          for (let i = 0; i < STREAM_POINTS.length - 1; i++) {
            const a = STREAM_POINTS[i]
            const b = STREAM_POINTS[i + 1]
            const dx = b.x - a.x
            const dz = b.z - a.z
            const len2 = dx * dx + dz * dz
            if (len2 <= 1e-6) continue
            let t = ((px - a.x) * dx + (pz - a.z) * dz) / len2
            t = t < 0 ? 0 : t > 1 ? 1 : t
            const cx = a.x + dx * t
            const cz = a.z + dz * t
            if (Math.hypot(px - cx, pz - cz) < halfW) {
              valid = false
              reason = 'plot would overlap water'
              break
            }
          }
        }
      }
      // Slope: sample around the full plot circle so the fence sits flat
      if (valid) {
        const SAMPLES = 8
        let maxH = py
        let minH = py
        for (let i = 0; i < SAMPLES; i++) {
          const a = (Math.PI * 2 * i) / SAMPLES
          const sx = px + Math.cos(a) * PLOT_RADIUS
          const sz = pz + Math.sin(a) * PLOT_RADIUS
          const h = terrainHeight(sx, sz)
          if (h > maxH) maxH = h
          if (h < minH) minH = h
        }
        if (maxH - minH > SLOPE_LIMIT * 2) {
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
    // For plots, skip tree/rock proximity checks (plot is territorial, not physical)
    if (mode !== 'plot') {
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
        <PlotGhost material={material} />
      ) : mode === 'rock' ? (
        <RockGhost rockShape={subject.rockShape ?? 2} material={material} />
      ) : (
        <TreeGhost shape={subject.shape ?? 0} material={material} />
      )}
    </group>
  )
}
