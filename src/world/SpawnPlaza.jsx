import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'

// ─────────────────────────────────────────────────────────────────────────────
// SpawnPlaza — The Meadow Gate
//
// A sunken, bowl-like stone sanctuary nestled into the rolling grassy terrain
// at world origin (0, 0). All players spawn within this plaza, so it acts as
// a natural meeting point. The terrain naturally forms a depression here; the
// plaza is deliberately constructed at the bottom of that bowl.
//
// Made of:
//   • A thick stone foundation slab at the bowl's floor
//   • 3 raised concentric stone step rings (outer aged limestone → middle dark
//     flagstone → center mossy-green disc with pulsing glow), each elevated
//     above the previous so they form visible tiers
//   • A stacked-stone circular wall built from many individual rocks arranged
//     in tight rings at increasing heights (Stonehenge-style enclosure)
//   • 8 tall upright gate pillars evenly spaced at the wall edge
//   • An intricately carved center obelisk topped with a radiant golden cone
//   • A warm pulsing golden light emanating from the center
// ─────────────────────────────────────────────────────────────────────────────

function stoneMat(color, emissive = '#000000', emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.03,
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
    flatShading: true,
  })
}

// ── Materials ────────────────────────────────────────────────────────────────
const outerStepMat   = stoneMat('#9a9080')
const middleStepMat  = stoneMat('#87796a')
const innerStepMat   = stoneMat('#756858')
const centerDiscMat  = stoneMat('#6a8a58', '#2a5a18', 0.12)
const wallRockMat    = stoneMat('#706050')
const wallRockMat2   = stoneMat('#635545')
const pillarMat      = stoneMat('#b0a690')
const pillarCapMat   = stoneMat('#ccc0aa')
const obeliskMat     = new THREE.MeshStandardMaterial({ color: '#c0b498', roughness: 0.78, metalness: 0.05 })

// ── Static geometries ────────────────────────────────────────────────────────
const centerDiscGeo    = (() => { const g = new THREE.CircleGeometry(4.8, 64);        g.rotateX(-Math.PI / 2); return g })()
// Hoisted to avoid allocating new GPU geometry on every re-render (fix #8)
const outerStepTopGeo  = (() => { const g = new THREE.RingGeometry(8.6, 10.0, 56);   g.rotateX(-Math.PI / 2); return g })()
const middleStepTopGeo = (() => { const g = new THREE.RingGeometry(5.2,  6.8, 56);   g.rotateX(-Math.PI / 2); return g })()

// Wall rock shapes — flat slabs & rounded boulders for the stacked wall
const wallRockGeos = (() => {
  const g0 = new THREE.DodecahedronGeometry(1, 0); g0.scale(1.4, 0.55, 0.9)   // flat slab
  const g1 = new THREE.DodecahedronGeometry(1, 0); g1.scale(1.0, 0.7, 0.8)    // rounded block
  const g2 = new THREE.DodecahedronGeometry(1, 0); g2.scale(0.8, 0.9, 0.75)   // near-sphere
  const g3 = new THREE.DodecahedronGeometry(1, 0); g3.scale(1.6, 0.45, 0.85)  // thin slab
  return [g0, g1, g2, g3]
})()

// Pillar geometry — tall upright rectangular block
const pillarGeo    = new THREE.BoxGeometry(1.3, 4.8, 1.0)
const pillarCapGeo = new THREE.BoxGeometry(1.6, 0.28, 1.3)

const NUM_PILLARS   = 8
const WALL_RADIUS   = 12.8   // radius of the stone wall centre-line
const PILLAR_RADIUS = 13.0   // pillars sit just at the outer face of the wall

// Deterministic pseudo-random helpers (avoid re-randomising on each render)
function seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

// ── Plaza geometry constants (shared with Player grounding) ──────────────────
const SLAB_H  = 0.7
const STEP1_H = 0.55
const STEP2_H = 0.45
const STEP3_H = 0.35

// Full radius of the base slab — players outside this fall back to raw terrain.
// Set to cover the slab outer edge (WALL_RADIUS + 2.0 = 14.8) with a small margin.
/** Outer walkable plaza radius — keep ≤ PLAZA_FLAT_R (15) in noise.js (C6). */
export const PLAZA_OUTER_RADIUS = 14.5

/**
 * Returns the Y coordinate of the walkable plaza floor at world position (wx, wz).
 * Mirrors the exact same height arithmetic used when building the step geometry
 * so the player stands flush on the surface rather than sinking into raw terrain.
 *
 * Zones (measured from plaza centre at cx/cz):
 *   r > 14.5  → raw terrain (returns null, caller falls back to terrainHeight)
 *   r <= 10.0 → top of outer step ring  (step1Top)
 *   r <=  6.8 → top of middle step ring (step2Top)
 *   r <=  4.8 → top of inner platform   (step3Top)
 *   else      → top of the base slab    (slabTop)   ← was missing, caused sinking
 */
export function plazaFloorHeight(wx, wz, cx = 0, cz = 0) {
  const r = Math.hypot(wx - cx, wz - cz)
  if (r > PLAZA_OUTER_RADIUS) return null   // outside plaza, use terrain

  const terrainY = terrainHeight(cx, cz)
  const slabTop  = terrainY + SLAB_H                  // top of the base stone slab
  const step1Top = slabTop  + STEP1_H                 // top of outer step ring
  const step2Top = step1Top + STEP2_H                 // top of middle step ring
  const step3Top = step2Top + STEP3_H                 // top of inner platform

  if (r <= 4.8)  return step3Top   // center platform
  if (r <= 6.8)  return step2Top   // middle ring
  if (r <= 10.0) return step1Top   // outer ring
  return slabTop                    // slab foundation (between outer ring and wall)
}

export default function SpawnPlaza({ x = 0, z = 0 }) {
  const glowRef   = useRef()
  const centerRef = useRef()

  // Terrain height at plaza centre (bottom of the bowl, ~ -7.5)
  const y = useMemo(() => terrainHeight(x, z), [x, z])

  // The slab top surface becomes our reference floor level
  // (SLAB_H / STEP*_H constants are module-level so plazaFloorHeight() can share them)
  const floorY  = y + SLAB_H * 0.5   // Y of the slab top surface

  // Cumulative Y tops — must match plazaFloorHeight() arithmetic exactly
  const step1Top = floorY + SLAB_H * 0.5 + STEP1_H
  const step2Top = step1Top + STEP2_H
  const step3Top = step2Top + STEP3_H

  // ── Pulsing animation ──────────────────────────────────────────────────────
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (centerRef.current) {
      centerRef.current.material.emissiveIntensity = 0.10 + Math.sin(t * 0.7) * 0.06
    }
    if (glowRef.current) {
      glowRef.current.intensity = 0.7 + Math.sin(t * 0.75 + 1.2) * 0.22
    }
  })

  // ── Upright gate pillars evenly spaced around the wall ────────────────────
  const pillars = useMemo(() => {
    return Array.from({ length: NUM_PILLARS }, (_, i) => {
      const angle = (i / NUM_PILLARS) * Math.PI * 2
      const px = x + Math.cos(angle) * PILLAR_RADIUS
      const pz = z + Math.sin(angle) * PILLAR_RADIUS
      return { px, pz, angle }
    })
  }, [x, z])

  // ── Stacked stone wall made of many individual rock chunks ─────────────────
  // Arranged in 5 tight horizontal layers at increasing heights, covering
  // a full ring at WALL_RADIUS ± a small radial jitter. This gives the look
  // of hand-stacked boulders forming a circular enclosure.
  const wallRocks = useMemo(() => {
    const arr = []
    const ROCKS_PER_LAYER = 36
    const NUM_LAYERS      = 5
    const LAYER_HEIGHT    = 0.62   // vertical spacing between layers
    const rng = seededRng(42)

    for (let layer = 0; layer < NUM_LAYERS; layer++) {
      const layerY = floorY + SLAB_H * 0.5 + STEP1_H * 0.5 + layer * LAYER_HEIGHT
      for (let i = 0; i < ROCKS_PER_LAYER; i++) {
        const baseAngle = (i / ROCKS_PER_LAYER) * Math.PI * 2
        const angleJitter = (rng() - 0.5) * (Math.PI * 2 / ROCKS_PER_LAYER) * 0.6
        const angle = baseAngle + angleJitter
        const radialJitter = (rng() - 0.5) * 0.9
        const r = WALL_RADIUS + radialJitter
        const rx = x + Math.cos(angle) * r
        const rz = z + Math.sin(angle) * r
        const heightJitter = (rng() - 0.5) * 0.18
        const scale = 0.52 + rng() * 0.32
        const shape = (rng() * 4) | 0
        const mat = (layer + i) % 3 === 0 ? 'dark' : 'light'
        arr.push({
          x: rx, y: layerY + heightJitter, z: rz,
          rot: rng() * Math.PI * 2,
          tiltX: (rng() - 0.5) * 0.18,
          tiltZ: (rng() - 0.5) * 0.18,
          scale,
          shape,
          mat,
        })
      }
    }
    return arr
  }, [x, z, floorY])

  return (
    <group>

      {/* ── Thick stone foundation slab (fills the bowl floor) ── */}
      <mesh position={[x, floorY, z]} receiveShadow>
        <cylinderGeometry args={[WALL_RADIUS + 1.5, WALL_RADIUS + 2.0, SLAB_H, 56]} />
        <meshStandardMaterial color="#5e5444" roughness={0.97} />
      </mesh>

      {/* ── Step ring 1 — OUTER (widest, lowest raised tier) ── */}
      <mesh position={[x, step1Top - STEP1_H * 0.5, z]} receiveShadow castShadow>
        <cylinderGeometry args={[10.0, 10.5, STEP1_H, 56]} />
        <meshStandardMaterial color={outerStepMat.color} roughness={0.9} flatShading />
      </mesh>
      {/* Flat top face of outer step — uses hoisted geometry (fix #8) */}
      <mesh geometry={outerStepTopGeo} position={[x, step1Top + 0.005, z]} receiveShadow>
        <meshStandardMaterial color="#9a9080" roughness={0.88} />
      </mesh>

      {/* ── Step ring 2 — MIDDLE tier ── */}
      <mesh position={[x, step2Top - STEP2_H * 0.5, z]} receiveShadow castShadow>
        <cylinderGeometry args={[6.8, 7.2, STEP2_H, 56]} />
        <meshStandardMaterial color={middleStepMat.color} roughness={0.9} flatShading />
      </mesh>
      {/* Flat top face of middle step — uses hoisted geometry (fix #8) */}
      <mesh geometry={middleStepTopGeo} position={[x, step2Top + 0.005, z]} receiveShadow>
        <meshStandardMaterial color="#87796a" roughness={0.88} />
      </mesh>

      {/* ── Step ring 3 — INNER platform ── */}
      <mesh position={[x, step3Top - STEP3_H * 0.5, z]} receiveShadow castShadow>
        <cylinderGeometry args={[4.8, 5.2, STEP3_H, 56]} />
        <meshStandardMaterial color={innerStepMat.color} roughness={0.9} flatShading />
      </mesh>

      {/* ── Center mossy disc on top of inner platform ── */}
      <mesh
        ref={centerRef}
        geometry={centerDiscGeo}
        material={centerDiscMat}
        position={[x, step3Top + 0.01, z]}
        receiveShadow
      />

      {/* ── Stacked stone wall — individual rocks in layers ── */}
      {wallRocks.map((r, i) => (
        <mesh
          key={i}
          geometry={wallRockGeos[r.shape]}
          material={r.mat === 'dark' ? wallRockMat2 : wallRockMat}
          position={[r.x, r.y, r.z]}
          rotation={[r.tiltX, r.rot, r.tiltZ]}
          scale={r.scale}
          castShadow
          receiveShadow
        />
      ))}

      {/* ── Upright gate pillars at the wall rim ── */}
      {pillars.map(({ px, pz, angle }, i) => (
        <group
          key={i}
          position={[px, floorY + SLAB_H * 0.5, pz]}
          rotation={[0, angle + Math.PI / 2, 0]}
        >
          {/* Pillars are at r=13, outside the outer step ring (r≤10.5) but on the
              slab (r≤14.8). Base them at slabTop so they sit flush (fix #1). */}
          {/* Pillar body — upright, no random tilt */}
          <mesh
            geometry={pillarGeo}
            material={pillarMat}
            position={[0, 2.4, 0]}
            castShadow
            receiveShadow
          />
          {/* Flat cap stone */}
          <mesh
            geometry={pillarCapGeo}
            material={pillarCapMat}
            position={[0, 4.94, 0]}
            castShadow
          />
        </group>
      ))}

      {/* ── Center obelisk — stepped base + tall shaft + golden cone ── */}
      {/* Base step 1 */}
      <mesh position={[x, step3Top + 0.17, z]} castShadow>
        <cylinderGeometry args={[0.58, 0.72, 0.34, 8]} />
        <primitive object={obeliskMat} attach="material" />
      </mesh>
      {/* Base step 2 */}
      <mesh position={[x, step3Top + 0.49, z]} castShadow>
        <cylinderGeometry args={[0.44, 0.58, 0.28, 8]} />
        <primitive object={obeliskMat} attach="material" />
      </mesh>
      {/* Main shaft — taller so it rises above the wall */}
      <mesh position={[x, step3Top + 1.85, z]} castShadow>
        <cylinderGeometry args={[0.20, 0.30, 2.88, 8]} />
        <primitive object={obeliskMat} attach="material" />
      </mesh>
      {/* Decorative band ring */}
      <mesh position={[x, step3Top + 2.5, z]} castShadow>
        <torusGeometry args={[0.24, 0.05, 6, 14]} />
        <meshStandardMaterial color="#b8a888" roughness={0.65} metalness={0.25} />
      </mesh>
      {/* Golden cone tip */}
      <mesh position={[x, step3Top + 3.65, z]} castShadow>
        <coneGeometry args={[0.28, 0.88, 8]} />
        <meshStandardMaterial
          color="#ead898"
          emissive="#ffcc44"
          emissiveIntensity={0.55}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>

      {/* ── Pulsing warm golden light emanating from center ── */}
      <pointLight
        ref={glowRef}
        position={[x, step3Top + 3.2, z]}
        color="#ffb060"
        intensity={0.75}
        distance={28}
        decay={2}
        castShadow={false}
      />

    </group>
  )
}
