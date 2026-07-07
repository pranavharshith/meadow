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

function Fence({ cx, cz, isOwner }) {
  const color = isOwner ? COL_OWNER : COL_OTHER

    const { posts, rails } = useMemo(() => {
      const posts = []
      for (let i = 0; i < POST_COUNT; i++) {
        const a = (i / POST_COUNT) * Math.PI * 2
        const px = cx + Math.cos(a) * RADIUS
        const pz = cz + Math.sin(a) * RADIUS
        const py = terrainHeight(px, pz) + 0.2
        posts.push({ x: px, z: pz, y: py })
      }
      const rails = []
      for (let i = 0; i < POST_COUNT; i++) {
        const j = (i + 1) % POST_COUNT
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
    }, [cx, cz])

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

export default function Plots() {
  const plots = useStore((s) => s.plots)

  if (!plots || plots.length === 0) return null

  return (
    <group>
      {plots.map((p) => (
        <group key={p.id}>
          <Fence cx={p.x} cz={p.z} isOwner={p.owner} />
          <Text
            position={[p.x, terrainHeight(p.x, p.z) + 1.4, p.z]}
            fontSize={0.5}
            color={p.owner ? '#7ec8ff' : '#b8956a'}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.03}
            outlineColor="#000000"
            transparent
            opacity={0.85}
          >
            {p.owner ? 'Your Plot' : `${p.name || ''}${p.name ? "'s Plot" : ''}`}
          </Text>
        </group>
      ))}
    </group>
  )
}
