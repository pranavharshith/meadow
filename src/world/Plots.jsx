import * as THREE from 'three'
import { useMemo } from 'react'
import { Text } from '@react-three/drei'
import { useStore } from '../store'
import { terrainHeight } from './noise'

const RADIUS = 10
const POST_COUNT = 32
const POST_H = 0.9
const POST_R = 0.045
const RAIL_W = 0.035
const RAIL_H = 0.04

const COL_OWNER = new THREE.Color('#b8956a')
const COL_OTHER = new THREE.Color('#8a7e6e')

function Fence({ plot }) {
  const isOwner = plot.owner
  const cx = plot.x
  const cz = plot.z
  const color = isOwner ? COL_OWNER : COL_OTHER
  const isRect = plot.shapeType === 1
  const w = plot.width ?? plot.radius ?? 10
  const d = plot.depth ?? plot.radius ?? 10

  const { posts, rails } = useMemo(() => {
    const posts = []
    
    if (isRect) {
      const addEdge = (xStart, zStart, xEnd, zEnd) => {
        const len = Math.hypot(xEnd - xStart, zEnd - zStart)
        const count = Math.max(Math.floor(len / 2.0), 1)
        for (let i = 0; i < count; i++) {
          const t = i / count
          const px = xStart + (xEnd - xStart) * t
          const pz = zStart + (zEnd - zStart) * t
          const py = terrainHeight(px, pz) + 0.2
          posts.push({ x: px, z: pz, y: py })
        }
      }
      addEdge(cx - w, cz - d, cx + w, cz - d)
      addEdge(cx + w, cz - d, cx + w, cz + d)
      addEdge(cx + w, cz + d, cx - w, cz + d)
      addEdge(cx - w, cz + d, cx - w, cz - d)
    } else {
      const PCOUNT = Math.floor(w * 3.2)
      for (let i = 0; i < PCOUNT; i++) {
        const a = (i / PCOUNT) * Math.PI * 2
        const px = cx + Math.cos(a) * w
        const pz = cz + Math.sin(a) * w
        const py = terrainHeight(px, pz) + 0.2
        posts.push({ x: px, z: pz, y: py })
      }
    }

    const rails = []
    const PCOUNT = posts.length
    for (let i = 0; i < PCOUNT; i++) {
      const j = (i + 1) % PCOUNT
      const p1 = posts[i]
      const p2 = posts[j]
      const mx = (p1.x + p2.x) / 2
      const mz = (p1.z + p2.z) / 2
      const my = (p1.y + p2.y) / 2
      const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z)
      const yaw = Math.atan2(p2.x - p1.x, p2.z - p1.z)
      const pitch = Math.atan2(p2.y - p1.y, dist)
      rails.push({ x: mx, z: mz, y: my, len: dist, yaw, pitch })
    }
    return { posts, rails }
  }, [cx, cz, isRect, w, d])

  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }), [color])
  const railMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 }), [color])

  return (
    <group>
      {posts.map((p, i) => (
        <mesh key={`p${i}`} position={[p.x, p.y + POST_H / 2, p.z]} material={mat} castShadow>
          <cylinderGeometry args={[POST_R, POST_R, POST_H, 5]} />
        </mesh>
      ))}
      {rails.map((r, i) => (
        <group key={`r${i}`} position={[r.x, r.y + POST_H * 0.35, r.z]} rotation={[r.pitch, -r.yaw, 0]}>
          <mesh material={railMat} castShadow>
            <boxGeometry args={[r.len, RAIL_H, RAIL_W]} />
          </mesh>
        </group>
      ))}
      {rails.map((r, i) => (
        <group key={`r2${i}`} position={[r.x, r.y + POST_H * 0.65, r.z]} rotation={[r.pitch, -r.yaw, 0]}>
          <mesh material={railMat} castShadow>
            <boxGeometry args={[r.len, RAIL_H, RAIL_W]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Signpost({ p }) {
  const isRect = p.shapeType === 1
  const w = p.width ?? p.radius ?? 10
  const d = p.depth ?? p.radius ?? 10
  // Place the signpost on the south edge of the plot
  const sx = p.x
  const sz = p.z + (isRect ? d : w) - 0.2
  const sy = terrainHeight(sx, sz)
  
  return (
    <group position={[sx, sy, sz]}>
      {/* Wooden Post */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.2, 5]} />
        <meshStandardMaterial color="#6b5a45" roughness={0.9} />
      </mesh>
      
      {/* Wooden Board */}
      <mesh position={[0, 1.0, 0.04]} castShadow>
        <boxGeometry args={[1.4, 0.4, 0.06]} />
        <meshStandardMaterial color="#8a7e6e" roughness={0.9} />
      </mesh>
      
      {/* Text Label on the board */}
      <Text
        position={[0, 1.0, 0.08]}
        fontSize={0.16}
        color={p.owner ? '#a8e6cf' : '#ffe8c4'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#3a2a15"
      >
        {p.owner ? 'Your Plot' : `${p.name || 'Stranger'}'s Plot`}
      </Text>
    </group>
  )
}

export default function Plots() {
  const plots = useStore((s) => s.plots)

  if (!plots || plots.length === 0) return null

  return (
    <group>
      {plots.map((p) => (
        <group key={p.id}>
          <Fence plot={p} />
          <Signpost p={p} />
        </group>
      ))}
    </group>
  )
}
