import * as THREE from 'three'
import { useMemo, useEffect } from 'react'
import { Text } from '@react-three/drei'
import { useStore } from '../store'
import {
  terrainHeight,
  syncTerrainPlots,
  plotPadBaseHeight,
  plotPadSurfaceHeight,
} from './noise'
import {
  normalizePlot,
  normalizePlots,
  PLOT_PAD_TOP,
  PLOT_PAD_THICK,
} from './plot-utils'

// ── Constants ────────────────────────────────────────────────────────────────
const STONE_H = 0.35
const POST_W = 0.18
const POST_H = 0.80
const SEGMENT_LEN = 2.0

const WOOD_POST = '#b87d3e'
const WOOD_RAIL = '#d4a055'
const STONE_A = '#9a9590'
const STONE_B = '#7c7870'
const PAD_TOP = '#a8a49c'
const PAD_SIDE = '#8a8680'

// ── Fence panel ──────────────────────────────────────────────────────────────
function FencePanel({ x1, z1, x2, z2 }) {
  // Sample live height each render so fence tracks pad remesh (G1.7)
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
  const postY = y1 + STONE_H
  const railFracs = [0.28, 0.58, 0.88]

  return (
    <group>
      <mesh position={[x1, y1 + STONE_H / 2, z1]} castShadow receiveShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_A} roughness={0.95} />
      </mesh>
      <mesh position={[x1, postY + POST_H / 2, z1]} castShadow>
        <boxGeometry args={[POST_W, POST_H, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>
      <mesh position={[x1, postY + POST_H + 0.06, z1]} castShadow>
        <boxGeometry args={[POST_W + 0.06, 0.1, POST_W + 0.06]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.75} />
      </mesh>
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

  return (
    <mesh
      position={[mx, my + STONE_H / 2 - 0.4, mz]}
      rotation={[pitch, yaw, 0, 'YXZ']}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[0.26, STONE_H + 0.8, len]} />
      <meshStandardMaterial color={STONE_B} roughness={0.95} />
    </mesh>
  )
}

function usePlotPoints(plot) {
  const p = normalizePlot(plot)
  const isRect = p.shapeType === 1
  const { x: cx, z: cz, width: w, depth: d } = p

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

function Fence({ plot }) {
  const pts = usePlotPoints(plot)
  const n = pts.length
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

/**
 * Visible stone pad — top face matches terrainHeight pad surface (G1.2).
 * Slightly inset so fence posts sit on the rim without z-fighting.
 */
function PlotPad({ plot }) {
  const p = normalizePlot(plot)
  const base = plotPadBaseHeight(p)
  const topY = base + PLOT_PAD_TOP
  const midY = topY - PLOT_PAD_THICK * 0.5
  const isRect = p.shapeType === 1
  const inset = 0.12
  const w = Math.max(1, p.width - inset)
  const d = Math.max(1, p.depth - inset)

  if (isRect) {
    return (
      <mesh position={[p.x, midY, p.z]} receiveShadow castShadow>
        <boxGeometry args={[w * 2, PLOT_PAD_THICK, d * 2]} />
        <meshStandardMaterial color={PAD_TOP} roughness={0.92} metalness={0.02} />
      </mesh>
    )
  }

  return (
    <group>
      <mesh position={[p.x, midY, p.z]} receiveShadow castShadow>
        <cylinderGeometry args={[w, w, PLOT_PAD_THICK, 48]} />
        <meshStandardMaterial color={PAD_TOP} roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[p.x, topY + 0.004, p.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[w * 0.9, w + 0.02, 48]} />
        <meshStandardMaterial color={PAD_SIDE} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Signpost({ plot }) {
  const p = normalizePlot(plot)
  const isRect = p.shapeType === 1
  const w = p.width
  const d = p.depth
  const sx = p.x
  const sz = p.z + (isRect ? d : w) + 0.35
  const sy = terrainHeight(sx, sz)

  const label = p.owner
    ? '✦ Your Plot'
    : `${p.name ? p.name + "'s Plot" : 'Claimed'}`

  const base = STONE_H

  return (
    <group position={[sx, sy, sz]}>
      <mesh position={[-0.82, base + STONE_H / 2, 0]} castShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_A} roughness={0.95} />
      </mesh>
      <mesh position={[-0.82, base + POST_H / 2, 0]} castShadow>
        <boxGeometry args={[POST_W, POST_H + base, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>
      <mesh position={[0.82, base + STONE_H / 2, 0]} castShadow>
        <boxGeometry args={[0.28, STONE_H, 0.28]} />
        <meshStandardMaterial color={STONE_B} roughness={0.95} />
      </mesh>
      <mesh position={[0.82, base + POST_H / 2, 0]} castShadow>
        <boxGeometry args={[POST_W, POST_H + base, POST_W]} />
        <meshStandardMaterial color={WOOD_POST} roughness={0.8} />
      </mesh>
      <mesh position={[0, base + POST_H * 0.65, 0.07]} castShadow>
        <boxGeometry args={[1.84, 0.58, 0.09]} />
        <meshStandardMaterial color="#7a5022" roughness={0.85} />
      </mesh>
      <mesh position={[0, base + POST_H * 0.65 + 0.31, 0.07]}>
        <boxGeometry args={[1.9, 0.08, 0.13]} />
        <meshStandardMaterial color="#5a3a15" roughness={0.9} />
      </mesh>
      <mesh position={[0, base + POST_H * 0.65 - 0.31, 0.07]}>
        <boxGeometry args={[1.9, 0.08, 0.13]} />
        <meshStandardMaterial color="#5a3a15" roughness={0.9} />
      </mesh>
      <Text
        position={[0, base + POST_H * 0.65, 0.14]}
        fontSize={0.28}
        color={p.owner ? '#a8f4cc' : '#ffe8c0'}
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

function PlotInstance({ plot }) {
  const p = useMemo(() => normalizePlot(plot), [plot])
  // Key forces fence remount when pad height identity changes
  const padY = plotPadSurfaceHeight(p)
  return (
    <group key={`${p.id}-${padY.toFixed(3)}`}>
      <PlotPad plot={p} />
      <Fence plot={p} />
      <Signpost plot={p} />
    </group>
  )
}

export default function Plots() {
  const plots = useStore((s) => s.plots)

  // Keep height field in sync as soon as plots change (G1.3)
  useEffect(() => {
    syncTerrainPlots(plots)
  }, [plots])

  if (!plots || plots.length === 0) return null
  const list = normalizePlots(plots)

  return (
    <group>
      {list.map((p) => (
        <PlotInstance key={p.id} plot={p} />
      ))}
    </group>
  )
}
