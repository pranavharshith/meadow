import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32 } from './noise'
import { P, treeRegistry } from '../player-state'

// Soft fluttering butterflies that gather around trees. They pick a nearby
// (preferably mature) tree as an anchor and wander around it, so grown groves
// naturally become livelier — beauty as the reward for planting, not gold.
const COUNT = 20
const WING = ['#f2a9c4', '#f6c66b', '#a9c8f0', '#c8a2e0', '#ffffff']

export default function Butterflies() {
  const groupRefs = useRef([])
  const leftRefs = useRef([])
  const rightRefs = useRef([])

  const flutters = useMemo(() => {
    const rng = mulberry32(2024)
    const arr = []
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        ax: P.pos.x + (rng() - 0.5) * 40,
        az: P.pos.z + (rng() - 0.5) * 40,
        r: 1.2 + rng() * 3.2,
        speed: 0.5 + rng() * 0.9,
        phase: rng() * Math.PI * 2,
        height: 0.6 + rng() * 1.8,
        flap: 12 + rng() * 8,
        color: WING[(rng() * WING.length) | 0],
        next: 0,
      })
    }
    return arr
  }, [])

  const wingGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.34, 0.26)
    g.translate(0.17, 0, 0)
    return g
  }, [])
  const mats = useMemo(
    () =>
      WING.map(
        (c) =>
          new THREE.MeshStandardMaterial({
            color: c,
            emissive: c,
            emissiveIntensity: 0.12,
            roughness: 0.6,
            side: THREE.DoubleSide,
          })
      ),
    []
  )

  const pickAnchor = (f, rng) => {
    // favour a nearby mature tree; otherwise wander to a random nearby spot
    let best = null
    let bestD = 900
    for (let i = 0; i < treeRegistry.length; i++) {
      const t = treeRegistry[i]
      if (!t.mature) continue
      const d = (t.x - P.pos.x) ** 2 + (t.z - P.pos.z) ** 2
      if (d < bestD && Math.random() < 0.6) {
        bestD = d
        best = t
      }
    }
    if (best) {
      f.ax = best.x + (rng() - 0.5) * 2
      f.az = best.z + (rng() - 0.5) * 2
    } else {
      f.ax = P.pos.x + (rng() - 0.5) * 34
      f.az = P.pos.z + (rng() - 0.5) * 34
    }
  }

  const rng = useMemo(() => mulberry32(88), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    for (let i = 0; i < COUNT; i++) {
      const f = flutters[i]
      const g = groupRefs.current[i]
      if (!g) continue

      if (t > f.next) {
        pickAnchor(f, rng)
        f.next = t + 5 + rng() * 6
      }
      // drift the anchor gently toward the player so butterflies stay in view
      const toP = Math.hypot(f.ax - P.pos.x, f.az - P.pos.z)
      if (toP > 46) {
        f.ax += (P.pos.x - f.ax) * 0.01
        f.az += (P.pos.z - f.az) * 0.01
      }

      const ang = t * f.speed + f.phase
      const x = f.ax + Math.cos(ang) * f.r
      const z = f.az + Math.sin(ang * 1.3) * f.r
      const y = terrainHeight(x, z) + f.height + Math.sin(t * 2 + f.phase) * 0.35
      g.position.set(x, y, z)
      g.rotation.y = -ang

      const flap = 0.2 + Math.abs(Math.sin(t * f.flap + f.phase)) * 1.1
      if (rightRefs.current[i]) rightRefs.current[i].rotation.y = flap
      if (leftRefs.current[i]) leftRefs.current[i].rotation.y = Math.PI - flap
    }
  })

  return (
    <group>
      {flutters.map((f, i) => {
        const mat = mats[WING.indexOf(f.color)] || mats[0]
        return (
          <group key={i} ref={(el) => (groupRefs.current[i] = el)}>
            <group ref={(el) => (rightRefs.current[i] = el)}>
              <mesh geometry={wingGeo} material={mat} />
            </group>
            <group ref={(el) => (leftRefs.current[i] = el)} rotation={[0, Math.PI, 0]}>
              <mesh geometry={wingGeo} material={mat} />
            </group>
          </group>
        )
      })}
    </group>
  )
}
