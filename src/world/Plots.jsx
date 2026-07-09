import * as THREE from 'three'
import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { useStore } from '../store'
import { terrainHeight } from './noise'

// ── Constants ────────────────────────────────────────────────────────────────
const STONE_H     = 0.35   // height of stone base
const POST_W      = 0.18   // post cross-section (square)
const POST_H      = 0.80   // wood post height above stone top
const SEGMENT_LEN = 2.0    // target spacing between posts

const WOOD_POST   = '#b87d3e'
const WOOD_RAIL   = '#d4a055'
const STONE_A     = '#9a9590'
const STONE_B     = '#7c7870'

// ── One complete fence panel: post + 3 rails bridging to the next post ───────
function FencePanel({ x1, z1, x2, z2 }) {
  const y1 = terrainHeight(x1, z1)
  const y2 = terrainHeight(x2, z2)

  const dx   = x2 - x1
  const dz   = z2 - z1
  const groundLen = Math.hypot(dx, dz)
  const dy   = y2 - y1
  const len  = Math.hypot(groundLen, dy)
  
  // yaw: angle in XZ plane
  const yaw  = Math.atan2(dx, dz)
  // pitch: tilt to match the slope between the two posts
  const pitch = Math.atan2(dy, groundLen)

  const mx   = (x1 + x2) / 2
  const mz   = (z1 + z2) / 2
  const my   = (y1 + y2) / 2   // average terrain height at mid-span

  // Post is placed at x1,z1 (start of this segment)
  const postY = y1 + STONE_H

  // Three evenly-spaced rail heights above the stone top
  const railFracs = [0.28, 0.58, 0.88]

  return (
    <group>
      {/* Stone base block at post position */}
      <mesh position={[x1, y1 + STONE_H / 2, z1]} castShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_A} roughness={0.95} />
      </mesh>

      {/* Wooden post */}
      <mesh position={[x1, postY + POST_H / 2, z1]} castShadow>
        <boxGeometry args={[POST_W, POST_H, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>

      {/* Post cap */}
      <mesh position={[x1, postY + POST_H + 0.06, z1]} castShadow>
        <boxGeometry args={[POST_W + 0.06, 0.10, POST_W + 0.06]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.75} />
      </mesh>

      {/* Three horizontal rails, pitched to follow terrain slope.
          Using YXZ order so yaw applies first, then pitch tilts it along the span. */}
      {railFracs.map((frac, i) => {
        const ry = my + STONE_H + POST_H * frac
        return (
          <mesh
            key={i}
            position={[mx, ry, mz]}
            rotation={[pitch, yaw, 0, 'YXZ']}
            castShadow
          >
            <boxGeometry args={[0.07, 0.07, len]} />
            <meshStandardMaterial color={WOOD_RAIL} roughness={0.75} />
          </mesh>
        )
      })}
    </group>
  )
}

// ── Stone infill: A single deep block spanning the gap, tilted to follow slope ──
function StoneWall({ x1, z1, x2, z2 }) {
  const y1 = terrainHeight(x1, z1)
  const y2 = terrainHeight(x2, z2)
  const dx = x2 - x1
  const dz = z2 - z1
  const groundLen = Math.hypot(dx, dz)
  const dy = y2 - y1
  const len = Math.hypot(groundLen, dy)
  
  const yaw = Math.atan2(dx, dz)
  const pitch = Math.atan2(dy, groundLen)
  
  const mx = (x1 + x2) / 2
  const mz = (z1 + z2) / 2
  const my = (y1 + y2) / 2
  
  // We make the stone block extra tall (2 units) and shift it down 1 unit.
  // This ensures the bottom vertices are buried deep underground, so it dynamically 
  // "stretches" into the terrain without showing gaps, matching the exact slope.
  return (
    <mesh
      position={[mx, my + STONE_H / 2 - 1.0, mz]}
      rotation={[pitch, yaw, 0, 'YXZ']}
      castShadow
    >
      <boxGeometry args={[0.26, STONE_H + 2.0, len]} />
      <meshStandardMaterial color={STONE_B} roughness={0.95} />
    </mesh>
  )
}

// ── Generate perimeter sample points ─────────────────────────────────────────
function usePlotPoints(plot) {
  const isRect = plot.shapeType === 1
  const cx = plot.x
  const cz = plot.z
  const w  = plot.width  ?? plot.radius ?? 10
  const d  = plot.depth  ?? plot.radius ?? 10

  return useMemo(() => {
    const pts = []
    if (isRect) {
      const edges = [
        [cx - w, cz - d, cx + w, cz - d],
        [cx + w, cz - d, cx + w, cz + d],
        [cx + w, cz + d, cx - w, cz + d],
        [cx - w, cz + d, cx - w, cz - d],
      ]
      for (const [sx, sz, ex, ez] of edges) {
        const n = Math.max(Math.round(Math.hypot(ex - sx, ez - sz) / SEGMENT_LEN), 2)
        for (let i = 0; i < n; i++) {
          const t = i / n
          pts.push({ x: sx + (ex - sx) * t, z: sz + (ez - sz) * t })
        }
      }
    } else {
      const circ = 2 * Math.PI * w
      const n = Math.max(Math.round(circ / SEGMENT_LEN), 8)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        pts.push({ x: cx + Math.cos(a) * w, z: cz + Math.sin(a) * w })
      }
    }
    return pts
  }, [cx, cz, isRect, w, d])
}

// ── Full fence for one plot ───────────────────────────────────────────────────
function Fence({ plot }) {
  const pts = usePlotPoints(plot)
  const n   = pts.length

  return (
    <group>
      {pts.map((pt, i) => {
        const next = pts[(i + 1) % n]
        return (
          <group key={i}>
            <StoneWall x1={pt.x} z1={pt.z} x2={next.x} z2={next.z} />
            <FencePanel x1={pt.x} z1={pt.z} x2={next.x} z2={next.z} />
          </group>
        )
      })}
    </group>
  )
}

// ── Sign ──────────────────────────────────────────────────────────────────────
function Signpost({ plot }) {
  const isRect = plot.shapeType === 1
  const w  = plot.width  ?? plot.radius ?? 10
  const d  = plot.depth  ?? plot.radius ?? 10
  const sx = plot.x
  const sz = plot.z + (isRect ? d : w) + 0.35
  const sy = terrainHeight(sx, sz)

  const label = plot.owner
    ? '✦ Your Plot'
    : `${plot.name ? plot.name + "'s Plot" : 'Claimed'}`

  const base = STONE_H

  return (
    <group position={[sx, sy, sz]}>
      {/* Left post */}
      <mesh position={[-0.82, base + STONE_H / 2, 0]} castShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_A} roughness={0.95} />
      </mesh>
      <mesh position={[-0.82, base + POST_H / 2, 0]} castShadow>
        <boxGeometry args={[POST_W, POST_H + base, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>
      {/* Right post */}
      <mesh position={[0.82, base + STONE_H / 2, 0]} castShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_B} roughness={0.95} />
      </mesh>
      <mesh position={[0.82, base + POST_H / 2, 0]} castShadow>
        <boxGeometry args={[POST_W, POST_H + base, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>
      {/* Sign board */}
      <mesh position={[0, base + POST_H * 0.65, 0.07]} castShadow>
        <boxGeometry args={[1.84, 0.58, 0.09]} />
        <meshStandardMaterial color="#7a5022" roughness={0.85} />
      </mesh>
      {/* Trim top */}
      <mesh position={[0, base + POST_H * 0.65 + 0.31, 0.07]}>
        <boxGeometry args={[1.90, 0.08, 0.13]} />
        <meshStandardMaterial color="#5a3a15" roughness={0.9} />
      </mesh>
      {/* Trim bottom */}
      <mesh position={[0, base + POST_H * 0.65 - 0.31, 0.07]}>
        <boxGeometry args={[1.90, 0.08, 0.13]} />
        <meshStandardMaterial color="#5a3a15" roughness={0.9} />
      </mesh>
      {/* Text */}
      <Text
        position={[0, base + POST_H * 0.65, 0.14]}
        fontSize={0.28}
        color={plot.owner ? '#a8f4cc' : '#ffe8c0'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.016}
        outlineColor="#2a1205"
        maxWidth={1.7}
      >
        {label}
      </Text>
    </group>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Plots() {
  const plots = useStore((s) => s.plots)
  if (!plots || plots.length === 0) return null
  return (
    <group>
      {plots.map((p) => (
        <group key={p.id}>
          <Fence plot={p} />
          <Signpost plot={p} />
        </group>
      ))}
    </group>
  )
}
