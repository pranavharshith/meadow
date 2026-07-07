import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { P } from '../player-state'
import { wetness } from '../wind'

// Gentle, always-bright weather. Soft clouds drift overhead constantly; every
// so often a light rain passes through (wetness ramps up, then clears). It
// never gets dark — the world just feels a little different each time you visit.
const CLOUDS = 10
const RAIN = 700
const RAIN_AREA = 60

function softTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.5, 'rgba(255,250,242,0.5)')
  g.addColorStop(1, 'rgba(255,250,242,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

export default function Weather() {
  const cloudRef = useRef()
  const rainRef = useRef()
  const rainMatRef = useRef()
  // weather timeline: dry stretch, then a rain pass, repeating with variation
  const timer = useRef(20 + Math.random() * 40)
  const raining = useRef(false)

  const tex = useMemo(softTexture, [])

  const clouds = useMemo(() => {
    const arr = []
    for (let i = 0; i < CLOUDS; i++) {
      arr.push({
        x: (Math.random() - 0.5) * 400,
        z: (Math.random() - 0.5) * 400,
        y: 70 + Math.random() * 40,
        s: 40 + Math.random() * 70,
        drift: 0.6 + Math.random() * 0.8,
      })
    }
    return arr
  }, [])

  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(RAIN * 3)
    for (let i = 0; i < RAIN; i++) {
      pos[i * 3] = (Math.random() - 0.5) * RAIN_AREA
      pos[i * 3 + 1] = Math.random() * 24
      pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)

    // --- weather state machine ---
    timer.current -= step
    if (timer.current <= 0) {
      raining.current = !raining.current
      timer.current = raining.current ? 18 + Math.random() * 22 : 40 + Math.random() * 70
    }
    const target = raining.current ? 1 : 0
    wetness.value += (target - wetness.value) * (1 - Math.exp(-step * 0.4))
    if (rainMatRef.current) rainMatRef.current.opacity = wetness.value * 0.5

    // --- clouds drift and wrap around the player ---
    const cg = cloudRef.current
    if (cg) {
      for (let i = 0; i < CLOUDS; i++) {
        const c = clouds[i]
        c.x += c.drift * step
        const rel = c.x - P.pos.x
        if (rel > 260) c.x -= 520
        if (rel < -260) c.x += 520
        const relZ = c.z - P.pos.z
        if (relZ > 260) c.z -= 520
        if (relZ < -260) c.z += 520
        const sp = cg.children[i]
        if (sp) sp.position.set(c.x, c.y, c.z)
      }
    }

    // --- rain falls around the player (only meaningful when wet) ---
    if (wetness.value > 0.02 && rainRef.current) {
      const arr = rainRef.current.geometry.attributes.position.array
      const fall = 26 * step
      for (let i = 0; i < RAIN; i++) {
        arr[i * 3 + 1] -= fall
        if (arr[i * 3 + 1] < 0) {
          arr[i * 3] = (Math.random() - 0.5) * RAIN_AREA
          arr[i * 3 + 1] = 20 + Math.random() * 6
          arr[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA
        }
      }
      rainRef.current.geometry.attributes.position.needsUpdate = true
      rainRef.current.position.set(P.pos.x, P.pos.y, P.pos.z)
      rainRef.current.visible = true
    } else if (rainRef.current) {
      rainRef.current.visible = false
    }
  })

  return (
    <group>
      <group ref={cloudRef}>
        {clouds.map((c, i) => (
          <sprite key={i} scale={[c.s, c.s * 0.55, 1]}>
            <spriteMaterial map={tex} transparent opacity={0.5} depthWrite={false} />
          </sprite>
        ))}
      </group>

      <points ref={rainRef} geometry={rainGeo} visible={false}>
        <pointsMaterial
          ref={rainMatRef}
          color="#cfe0ea"
          size={0.08}
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  )
}
