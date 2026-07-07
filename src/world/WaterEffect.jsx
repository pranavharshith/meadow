import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { terrainHeight } from './noise'

// Beautiful water droplet + sparkle burst that plays at a tree's position when
// the player waters it. Particles rise, arc outward, then fade — like a gentle
// splash of water catching sunlight.

const PARTICLE_COUNT = 24
const DURATION = 1.8 // seconds

// Shared across instances
const dropTex = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, 'rgba(140, 210, 255, 1)')
  g.addColorStop(0.4, 'rgba(100, 190, 255, 0.7)')
  g.addColorStop(1, 'rgba(80, 170, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
})()

export default function WaterEffect() {
  // We listen to a "waterEvent" in the store to trigger the effect
  const waterEvent = useStore((s) => s.waterEvent)
  const ref = useRef()
  const timeRef = useRef(-1)
  const posRef = useRef(new THREE.Vector3())

  // Per-particle random velocities (pre-computed)
  const particles = useMemo(() => {
    const vels = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4
      const speed = 0.8 + Math.random() * 1.2
      const rise = 1.5 + Math.random() * 1.5
      vels.push({
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        vy: rise,
        size: 0.12 + Math.random() * 0.15,
      })
    }
    return vels
  }, [])

  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3), [])
  const sizes = useMemo(() => new Float32Array(PARTICLE_COUNT), [])

  // Detect new water event
  const lastEventRef = useRef(null)

  useFrame((_, dt) => {
    if (!ref.current) return

    // Check for new water event
    if (waterEvent && waterEvent !== lastEventRef.current) {
      lastEventRef.current = waterEvent
      timeRef.current = 0
      const wy = terrainHeight(waterEvent.x, waterEvent.z)
      posRef.current.set(waterEvent.x, wy, waterEvent.z)
    }

    // Not playing
    if (timeRef.current < 0) {
      ref.current.visible = false
      return
    }

    ref.current.visible = true
    timeRef.current += dt

    const t = timeRef.current
    const progress = t / DURATION

    if (progress > 1) {
      timeRef.current = -1
      ref.current.visible = false
      return
    }

    const fade = 1 - progress * progress // quadratic fade out
    const gravity = 3.5

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i]
      // Arc trajectory: rise then fall with gravity
      const px = posRef.current.x + p.vx * t
      const py = posRef.current.y + p.vy * t - 0.5 * gravity * t * t + 0.5
      const pz = posRef.current.z + p.vz * t

      positions[i * 3] = px
      positions[i * 3 + 1] = Math.max(py, posRef.current.y - 0.2)
      positions[i * 3 + 2] = pz
      sizes[i] = p.size * fade * (1 + Math.sin(t * 8 + i) * 0.2)
    }

    const geo = ref.current.geometry
    geo.attributes.position.needsUpdate = true
    geo.attributes.size.needsUpdate = true

    // Fade opacity
    ref.current.material.opacity = fade * 0.9
  })

  return (
    <points ref={ref} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-size" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
      </bufferGeometry>
      <pointsMaterial
        size={0.25}
        map={dropTex}
        color="#8edcff"
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}
