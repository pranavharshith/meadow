import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { terrainHeight } from './noise'

// Beautiful 3D water droplet + geometric ripple burst that plays at a tree's position 
// when the player waters it. Low-poly icosahedrons burst outward and shrink, while
// a sharp ring expands on the ground.

const PARTICLE_COUNT = 16 
const DURATION = 1.1 

// Shared Geometry and Materials for efficiency
const dropGeo = new THREE.IcosahedronGeometry(0.06, 0)
const dropMat = new THREE.MeshStandardMaterial({
  color: '#40a0ff',
  emissive: '#103060',
  roughness: 0.1,
  metalness: 0.2,
  transparent: true,
  opacity: 0.9,
  flatShading: true
})

const rippleGeo = new THREE.RingGeometry(0.3, 0.45, 32)
const rippleMat = new THREE.MeshBasicMaterial({
  color: '#80c0ff',
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
  depthWrite: false
})

export default function WaterEffect() {
  const waterEvent = useStore((s) => s.waterEvent)
  const groupRef = useRef()
  const instancedRef = useRef()
  const rippleRef = useRef()
  const timeRef = useRef(-1)
  const posRef = useRef(new THREE.Vector3())

  // Per-particle initial trajectories
  const particles = useMemo(() => {
    const vels = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5)
      const speed = 1.2 + Math.random() * 1.5
      const rise = 2.0 + Math.random() * 1.5
      vels.push({
        vx: Math.cos(angle) * speed,
        vz: Math.sin(angle) * speed,
        vy: rise,
        scale: 0.6 + Math.random() * 0.8,
        rotSpeed: (Math.random() - 0.5) * 12
      })
    }
    return vels
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastEventRef = useRef(null)

  useFrame((_, dt) => {
    if (!groupRef.current) return

    if (waterEvent && waterEvent !== lastEventRef.current) {
      lastEventRef.current = waterEvent
      timeRef.current = 0
      const wy = terrainHeight(waterEvent.x, waterEvent.z)
      posRef.current.set(waterEvent.x, wy, waterEvent.z)
      groupRef.current.position.copy(posRef.current)
    }

    if (timeRef.current < 0) {
      groupRef.current.visible = false
      return
    }

    groupRef.current.visible = true
    timeRef.current += dt

    const t = timeRef.current
    const progress = t / DURATION

    if (progress > 1) {
      timeRef.current = -1
      groupRef.current.visible = false
      return
    }

    // Ripple expansion and fade
    if (rippleRef.current) {
      const rScale = 1 + progress * 3.5
      rippleRef.current.scale.set(rScale, rScale, rScale)
      rippleRef.current.material.opacity = (1 - progress) * 0.8
    }

    // 3D Droplets physics
    if (instancedRef.current) {
      const fade = Math.max(0, 1 - progress * progress) // rapid shrink at end
      const gravity = 8.0

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i]
        
        // Arc trajectory relative to group
        const px = p.vx * t
        const py = p.vy * t - 0.5 * gravity * t * t + 0.3
        const pz = p.vz * t

        dummy.position.set(px, Math.max(py, 0), pz)
        
        // Spinning drops
        dummy.rotation.x = t * p.rotSpeed
        dummy.rotation.y = t * p.rotSpeed
        
        // Shrink as they fall
        const s = p.scale * fade
        dummy.scale.set(s, s, s)
        
        dummy.updateMatrix()
        instancedRef.current.setMatrixAt(i, dummy.matrix)
      }
      instancedRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={rippleRef} geometry={rippleGeo} material={rippleMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} />
      <instancedMesh ref={instancedRef} args={[dropGeo, dropMat, PARTICLE_COUNT]} />
    </group>
  )
}
