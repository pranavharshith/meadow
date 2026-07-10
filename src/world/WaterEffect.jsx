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

const POOL_SIZE = 50

export default function WaterEffect() {
  const waterEvents = useStore((s) => s.waterEvent) // wait, waterEvent is a single object or signal?
  const instancedRef = useRef()
  const rippleRef = useRef()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const lastEventId = useRef(0)

  // Pool state
  const pool = useMemo(() => {
    const arr = []
    for (let i = 0; i < POOL_SIZE; i++) {
      const p = []
      for (let j = 0; j < PARTICLE_COUNT; j++) {
        const angle = (j / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5)
        const speed = 1.2 + Math.random() * 1.5
        const rise = 2.0 + Math.random() * 1.5
        p.push({ vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: rise, scale: 0.6 + Math.random() * 0.8, rotSpeed: (Math.random() - 0.5) * 12 })
      }
      arr.push({ active: false, time: 0, x: 0, y: 0, z: 0, particles: p })
    }
    return arr
  }, [])

  useFrame((_, dt) => {
    if (!instancedRef.current || !rippleRef.current) return

    // Check for new event
    const e = useStore.getState().waterEvent
    if (e && e.id !== lastEventId.current) {
      lastEventId.current = e.id
      // Find inactive
      for (let i = 0; i < POOL_SIZE; i++) {
        if (!pool[i].active) {
          pool[i].active = true
          pool[i].time = 0
          pool[i].x = e.x
          pool[i].z = e.z
          pool[i].y = terrainHeight(e.x, e.z)
          break
        }
      }
    }

    let dropsDirty = false
    let rippleDirty = false

    for (let i = 0; i < POOL_SIZE; i++) {
      const effect = pool[i]
      if (!effect.active) continue

      effect.time += dt
      const t = effect.time
      const progress = t / DURATION

      if (progress > 1) {
        effect.active = false
        // Hide ripple
        dummy.position.set(0, -9999, 0)
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        rippleRef.current.setMatrixAt(i, dummy.matrix)
        rippleDirty = true
        // Hide drops
        for (let j = 0; j < PARTICLE_COUNT; j++) {
          instancedRef.current.setMatrixAt(i * PARTICLE_COUNT + j, dummy.matrix)
        }
        dropsDirty = true
        continue
      }

      // Update Ripple
      const rScale = 1 + progress * 3.5
      dummy.position.set(effect.x, effect.y + 0.05, effect.z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(rScale, rScale, rScale)
      dummy.updateMatrix()
      rippleRef.current.setMatrixAt(i, dummy.matrix)
      // Note: InstancedMesh doesn't support per-instance opacity easily without instanced color,
      // so we use scale to fade it out, or we can just accept it doesn't fade, or scale Y to 0.
      // To simulate fade without custom shader, we shrink it rapidly at the end.
      rippleDirty = true

      // Update Drops
      const fade = Math.max(0, 1 - progress * progress)
      const gravity = 8.0
      
      for (let j = 0; j < PARTICLE_COUNT; j++) {
        const p = effect.particles[j]
        const px = effect.x + p.vx * t
        const py = effect.y + p.vy * t - 0.5 * gravity * t * t + 0.3
        const pz = effect.z + p.vz * t

        dummy.position.set(px, Math.max(py, effect.y), pz)
        dummy.rotation.set(t * p.rotSpeed, t * p.rotSpeed, 0)
        const s = p.scale * fade
        dummy.scale.set(s, s, s)
        dummy.updateMatrix()
        instancedRef.current.setMatrixAt(i * PARTICLE_COUNT + j, dummy.matrix)
      }
      dropsDirty = true
    }

    if (dropsDirty) instancedRef.current.instanceMatrix.needsUpdate = true
    if (rippleDirty) rippleRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={rippleRef} args={[rippleGeo, rippleMat, POOL_SIZE]} />
      <instancedMesh ref={instancedRef} args={[dropGeo, dropMat, POOL_SIZE * PARTICLE_COUNT]} />
    </group>
  )
}
