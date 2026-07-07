import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { P } from '../player-state'
import { wetness } from '../wind'
import { terrainHeight } from './noise'

// Gentle, always-bright weather. Soft clouds drift overhead constantly; every
// so often a light rain passes through (wetness ramps up, then clears). It
// never gets dark — the world just feels a little different each time you visit.
//
// Rain is drawn as short vertical LINE SEGMENTS (streaks) instead of point
// sprites. A point sprite of 0.08 units becomes a specular speck that reads
// as snow at any distance; line segments read as rain even when they're a
// few pixels tall on-screen.
const CLOUDS = 10
const RAIN_DROPS = 700
const RAIN_AREA = 90       // horizontal extent of the rain cell around the player
const RAIN_CEILING = 26    // how high above the player rain spawns
const STREAK_LENGTH = 0.55 // world-space length of each rain streak
const FALL_SPEED = 30      // world units / second
const WIND_LEAN_X = 2.8    // horizontal skew of streaks (visual wind)

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
  const cloudMats = useRef([])
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

  // Rain streak geometry: two vertices per drop (top and bottom of a streak).
  // We store the drop's TOP-Y in a per-drop scratch to preserve length while
  // both vertices are advanced by the fall speed each frame.
  const { rainGeo, dropTopY, rainCount } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const positions = new Float32Array(RAIN_DROPS * 2 * 3)
    const topY = new Float32Array(RAIN_DROPS)
    for (let i = 0; i < RAIN_DROPS; i++) {
      const x = (Math.random() - 0.5) * RAIN_AREA
      const y = Math.random() * RAIN_CEILING
      const z = (Math.random() - 0.5) * RAIN_AREA
      topY[i] = y
      // Top vertex
      positions[i * 6 + 0] = x + WIND_LEAN_X * (STREAK_LENGTH / (STREAK_LENGTH + 1))
      positions[i * 6 + 1] = y
      positions[i * 6 + 2] = z
      // Bottom vertex (lower, and slightly offset for wind lean)
      positions[i * 6 + 3] = x
      positions[i * 6 + 4] = y - STREAK_LENGTH
      positions[i * 6 + 5] = z
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { rainGeo: g, dropTopY: topY, rainCount: RAIN_DROPS }
  }, [])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)

    // --- weather state machine --------------------------------------------
    timer.current -= step
    if (timer.current <= 0) {
      raining.current = !raining.current
      timer.current = raining.current ? 18 + Math.random() * 22 : 40 + Math.random() * 70
    }
    const target = raining.current ? 1 : 0
    // Frame-rate-independent lerp with τ ≈ 1.8 s. Fast enough to feel
    // responsive, slow enough to feel gentle.
    const k = 1 - Math.exp(-step / 1.8)
    wetness.value += (target - wetness.value) * k

    if (rainMatRef.current) rainMatRef.current.opacity = wetness.value * 0.55

    // --- clouds drift + darken slightly when it rains ---------------------
    const cg = cloudRef.current
    if (cg) {
      // Clouds are a touch denser (more opaque, cooler) during rain to hint
      // at the change without ever going dark.
      const cloudOpacity = 0.45 + wetness.value * 0.28
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
        const cm = cloudMats.current[i]
        if (cm) cm.opacity = cloudOpacity
      }
    }

    // --- rain streaks -----------------------------------------------------
    if (wetness.value <= 0.02) {
      if (rainRef.current) rainRef.current.visible = false
      return
    }
    const rp = rainRef.current
    if (!rp) return
    rp.visible = true

    // Anchor the rain cell to the player each frame so we always have rain
    // around them without moving 700 particles' world positions.
    rp.position.set(P.pos.x, 0, P.pos.z)

    const arr = rp.geometry.attributes.position.array
    const fall = FALL_SPEED * step

    for (let i = 0; i < rainCount; i++) {
      // Advance both vertices of the streak by the same fall amount so its
      // length stays constant.
      let topYi = dropTopY[i] - fall
      // A drop is "on the ground" when the streak's BOTTOM (topY - length)
      // drops below the terrain height at its current XZ. Because rain
      // position is anchored to (P.pos.x, 0, P.pos.z), local (x,z) map to
      // world (P.pos.x + x, P.pos.z + z).
      const localX = arr[i * 6 + 3]
      const localZ = arr[i * 6 + 5]
      const groundLocalY = terrainHeight(P.pos.x + localX, P.pos.z + localZ)
      if (topYi - STREAK_LENGTH < groundLocalY) {
        // Respawn at the top of the rain cell at a new local XZ.
        const nx = (Math.random() - 0.5) * RAIN_AREA
        const nz = (Math.random() - 0.5) * RAIN_AREA
        const ny = RAIN_CEILING - Math.random() * 4
        topYi = ny
        // Top vertex (skewed for wind lean)
        arr[i * 6 + 0] = nx + WIND_LEAN_X * 0.02
        arr[i * 6 + 2] = nz
        // Bottom vertex
        arr[i * 6 + 3] = nx
        arr[i * 6 + 5] = nz
      }
      dropTopY[i] = topYi
      arr[i * 6 + 1] = topYi
      arr[i * 6 + 4] = topYi - STREAK_LENGTH
    }
    rp.geometry.attributes.position.needsUpdate = true
  })

  return (
    <group>
      <group ref={cloudRef}>
        {clouds.map((c, i) => (
          <sprite key={i} scale={[c.s, c.s * 0.55, 1]}>
            <spriteMaterial
              ref={(m) => (cloudMats.current[i] = m)}
              map={tex}
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>

      <lineSegments ref={rainRef} geometry={rainGeo} visible={false}>
        <lineBasicMaterial
          ref={rainMatRef}
          color="#cfe0ea"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  )
}
