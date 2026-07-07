import * as THREE from 'three'
import { useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { CHUNK } from './chunk'
import { P } from '../player-state'

const RINGS = 2 // 5x5 ground chunks around the player
const SEG = 40 // resolution per chunk

const LOW = new THREE.Color('#38571d')
const HIGH = new THREE.Color('#8bb352')

const DRY = new THREE.Color('#a98f52')

function GroundChunk({ cx, cz }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(CHUNK, CHUNK, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const originX = cx * CHUNK + CHUNK / 2
    const originZ = cz * CHUNK + CHUNK / 2
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const normals = new Float32Array(pos.count * 3)
    const c = new THREE.Color()
    const e = 1.5
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + originX
      const z = pos.getZ(i) + originZ
      const h = terrainHeight(x, z)
      pos.setX(i, x)
      pos.setZ(i, z)
      pos.setY(i, h)

      // Analytic normal from the height field so lighting is continuous across
      // chunk borders (no seams). n = normalize(-dh/dx, 1, -dh/dz).
      const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
      const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
      const nx = -hx / (2 * e)
      const nz = -hz / (2 * e)
      const inv = 1 / Math.hypot(nx, 1, nz)
      normals[i * 3] = nx * inv
      normals[i * 3 + 1] = inv
      normals[i * 3 + 2] = nz * inv

      const t = THREE.MathUtils.clamp((h + 7.5) / 15, 0, 1)
      const jitter = (Math.sin(x * 12.9 + z * 78.2) * 0.5 + 0.5) * 0.1
      c.copy(LOW).lerp(HIGH, THREE.MathUtils.clamp(t * 0.7 + jitter, 0, 1))
      // steeper ground shows a little warm earth
      const slope = Math.min(Math.hypot(hx, hz) / (2 * e), 1)
      c.lerp(DRY, slope * 0.3)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    return g
  }, [cx, cz])

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

// Continuous ground that follows the player as a window of chunks, so the
// world never ends. Heights come from the shared terrainHeight() so grass,
// trees and ground always line up.
export default function Terrain() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const chunks = []
  for (let dx = -RINGS; dx <= RINGS; dx++) {
    for (let dz = -RINGS; dz <= RINGS; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      chunks.push(<GroundChunk key={`${cx},${cz}`} cx={cx} cz={cz} />)
    }
  }
  return <group>{chunks}</group>
}
