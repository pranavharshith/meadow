import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { P } from '../player-state'

const COUNT = 90
const RADIUS = 42

// Soft glowing motes that drift near the player at dusk. Bloom makes them glow.
export default function Fireflies() {
  const ref = useRef()

  const { positions, offs } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const offs = []
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * RADIUS
      offs.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: 0.6 + Math.random() * 2.6,
        sx: 0.3 + Math.random() * 0.5,
        sy: 0.6 + Math.random() * 0.8,
        sz: 0.3 + Math.random() * 0.5,
        px: Math.random() * 6.28,
        py: Math.random() * 6.28,
        pz: Math.random() * 6.28,
      })
    }
    return { positions, offs }
  }, [])

  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.3, 'rgba(255,244,180,0.85)')
    g.addColorStop(1, 'rgba(255,244,180,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    return t
  }, [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < COUNT; i++) {
      const o = offs[i]
      const x = P.pos.x + o.x + Math.sin(t * o.sx + o.px) * 2
      const z = P.pos.z + o.z + Math.cos(t * o.sz + o.pz) * 2
      const y = terrainHeight(x, z) + o.y + Math.sin(t * o.sy + o.py) * 0.4
      arr[i * 3] = x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = z
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.75}
        map={tex}
        color="#fff3b0"
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}
