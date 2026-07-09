import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { P } from '../player-state'
import { useStore } from '../store'

const COUNT = 90
const RADIUS = 42

// Soft glowing motes that drift near the player at dusk. Bloom makes them glow.
export default function Fireflies() {
  const enabled = useStore((s) => s.fireflies)
  const ref = useRef()

  const { positions, colors, offs } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const offs = []
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * RADIUS
      offs.push({
        x: P.pos.x + Math.cos(a) * r,
        z: P.pos.z + Math.sin(a) * r,
        y: 0.6 + Math.random() * 2.6,
        sx: 0.3 + Math.random() * 0.5,
        sy: 0.6 + Math.random() * 0.8,
        sz: 0.3 + Math.random() * 0.5,
        px: Math.random() * 6.28,
        py: Math.random() * 6.28,
        pz: Math.random() * 6.28,
        pulseSpeed: 1.5 + Math.random() * 2,
        pulsePhase: Math.random() * 6.28,
      })
    }
    return { positions, colors, offs }
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
    if (!ref.current) return
    const t = clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    const col = ref.current.geometry.attributes.color.array
    const px = P.pos.x
    const pz = P.pos.z
    
    for (let i = 0; i < COUNT; i++) {
      const o = offs[i]
      
      // Wrapping logic (Toroidal)
      let dx = o.x - px
      let dz = o.z - pz
      if (dx > RADIUS) o.x -= RADIUS * 2
      if (dx < -RADIUS) o.x += RADIUS * 2
      if (dz > RADIUS) o.z -= RADIUS * 2
      if (dz < -RADIUS) o.z += RADIUS * 2

      // Subtle chaotic drift in world space
      o.x += Math.sin(t * o.sx + o.px) * 0.008
      o.z += Math.cos(t * o.sz + o.pz) * 0.008

      const y = terrainHeight(o.x, o.z) + o.y + Math.sin(t * o.sy + o.py) * 0.4
      arr[i * 3] = o.x
      arr[i * 3 + 1] = y
      arr[i * 3 + 2] = o.z
      
      // Pulse intensity using additive blending (darker = more transparent)
      const intensity = 0.15 + Math.max(0, Math.sin(t * o.pulseSpeed + o.pulsePhase)) * 0.85
      col[i * 3] = 1.0 * intensity     // R
      col[i * 3 + 1] = 0.95 * intensity // G
      col[i * 3 + 2] = 0.69 * intensity // B
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.geometry.attributes.color.needsUpdate = true
  })

  if (!enabled) return null

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={COUNT} array={colors} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={1.1}
        map={tex}
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}
