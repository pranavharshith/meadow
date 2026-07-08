import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import {
  trunkGeo, leafGeo, trunkMat, leafMats,
  willowTrunkGeo, willowTrunkMat, willowLeafGeo, willowLeafMats,
} from './tree-assets'
import { LANDMARKS, NEAR_RANGE, DISCOVER_RANGE, nearestLandmark } from './places'
import { P, place } from '../player-state'
import { useStore } from '../store'
import SpawnPlaza from './SpawnPlaza'

// =============================================================================
// Module-level materials — allocated once, reused across all instances
// =============================================================================
const _sm = (color, rough = 0.92, flat = true) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: flat })

const ruinMat        = _sm('#8a7a6a')
const hollowRockMat  = _sm('#3a3530')
const bridgeStoneMat = _sm('#9a8a70', 0.90)
const bridgePlankMat = _sm('#6a5a40', 0.95)
const stemMat        = _sm('#5a8a3a', 0.90, false)
const clearingMat    = _sm('#b0a090')
const lhBodyMat      = _sm('#e8e0d0', 0.80, false)
const lhStripeMat    = _sm('#c0382a', 0.80, false)
const lhRoofMat      = _sm('#4a4a4a', 0.90)
const lhGlassMat     = new THREE.MeshStandardMaterial({
  color: '#ffe88a',
  emissive: new THREE.Color('#ffcc44'),
  emissiveIntensity: 0.85,
  roughness: 0.15,
  transparent: true,
  opacity: 0.88,
})
const canyonMatA     = _sm('#9a6a4a')
const canyonMatB     = _sm('#7a5038')
const dockMat        = _sm('#7a5a3a', 0.90, false)
const pondRockMat    = _sm('#7a7060')

// Seven flower petal colours — shared across all FlowerField instances
const flowerMats = [
  '#ff6eb4', '#ffb347', '#ffd966', '#c084fc',
  '#67e8f9', '#86efac', '#ff9de2',
].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, flatShading: false }))

// =============================================================================
// Tree sub-components
// =============================================================================

/**
 * BigTree (Lonely Oak)  — FIX #4
 * trunkGeo height = 2.8. Old position [0, 0.75, 0] ? bottom at -0.65; with
 * scale 2.4 that became -1.56 underground.  Now center = half-height = 1.4
 * ? bottom exactly at y=0.  Leaf positions shifted up by 0.65 accordingly.
 */
function BigTree({ scale = 2.4 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo}  material={trunkMat}    position={[0,    1.40, 0]}    castShadow receiveShadow />
      <mesh geometry={leafGeo}   material={leafMats[0]} position={[0,    2.90, 0]}    scale={[1.7, 1.5, 1.7]} castShadow />
      <mesh geometry={leafGeo}   material={leafMats[1]} position={[0.70, 2.50, 0.30]} scale={1.00} castShadow />
      <mesh geometry={leafGeo}   material={leafMats[2]} position={[-0.6, 2.40,-0.35]} scale={0.95} castShadow />
    </group>
  )
}

function SmallTree({ variant = 0, scale = 1 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo} material={trunkMat}                position={[0,    0.75, 0]}    castShadow receiveShadow />
      <mesh geometry={leafGeo}  material={leafMats[variant % 3]}   position={[0,    1.95, 0]}    scale={[1.3, 1.2, 1.3]} castShadow />
      <mesh geometry={leafGeo}  material={leafMats[(variant+1)%3]} position={[0.50, 1.55, 0.22]} scale={0.80} castShadow />
    </group>
  )
}

// FIX #6 — 'willow' kind now uses the existing willow assets from tree-assets.js
function WillowTree() {
  return (
    <>
      <mesh geometry={willowTrunkGeo} material={willowTrunkMat}    position={[0,     1.70, 0]}    castShadow receiveShadow />
      <mesh geometry={willowLeafGeo}  material={willowLeafMats[0]} position={[0,     3.80, 0]}    scale={[1.6, 1.8, 1.6]} castShadow />
      <mesh geometry={willowLeafGeo}  material={willowLeafMats[1]} position={[0.50,  3.20, 0.40]} scale={0.80} castShadow />
      <mesh geometry={willowLeafGeo}  material={willowLeafMats[2]} position={[-0.40, 3.00,-0.30]} scale={0.70} castShadow />
    </>
  )
}

// =============================================================================
// Landmark feature components
// =============================================================================

/**
 * POND MARKER — FIX #3
 * Crystal Pond's animated rippling water is already in Water.jsx.  The old
 * Pond component drew a second overlapping circle causing z-fighting.  We
 * now only render decorative waterside rocks so the landmark has 3-D presence.
 */
function PondMarker({ x, z }) {
  const rocks = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const a  = (i / 7) * Math.PI * 2
      const r  = 10.0 + (i % 3) * 0.70
      const rx = x + Math.cos(a) * r
      const rz = z + Math.sin(a) * r
      return { rx, ry: terrainHeight(rx, rz), rz, a, s: 0.45 + (i % 3) * 0.28 }
    }),
  [x, z])

  return (
    <group>
      {rocks.map((r, i) => (
        <mesh key={i} position={[r.rx, r.ry + r.s * 0.35, r.rz]}
          rotation={[0.10, r.a, 0.12]} material={pondRockMat} castShadow receiveShadow>
          <dodecahedronGeometry args={[r.s, 0]} />
        </mesh>
      ))}
    </group>
  )
}

function Windmill({ x, z }) {
  const bladeRef = useRef()
  const y = useMemo(() => terrainHeight(x, z), [x, z])
  useFrame((_, dt) => { if (bladeRef.current) bladeRef.current.rotation.z += dt * 0.5 })
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.4, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.55, 4.8, 10]} />
        <meshStandardMaterial color="#e7e0d0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow>
        <coneGeometry args={[0.7, 1, 10]} />
        <meshStandardMaterial color="#8a5a3b" roughness={0.9} />
      </mesh>
      <group ref={bladeRef} position={[0, 4.4, 0.6]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.25, 3.2, 0.08]} />
            <meshStandardMaterial color="#d8cdb6" roughness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function SunStone({ x, z }) {
  const y = useMemo(() => terrainHeight(x, z), [x, z])
  return (
    <mesh position={[x, y + 1.4, z]} castShadow>
      <dodecahedronGeometry args={[2, 0]} />
      <meshStandardMaterial color="#f0c060" emissive="#ffb43a" emissiveIntensity={0.5} roughness={0.4} flatShading />
    </mesh>
  )
}

// --- New landmark kinds (FIX #2) -------------------------------------------

/** RUIN — stone arch with cracked lintel and fallen rubble */
function Ruin({ x, z, y }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[-1.65, 2.40, 0]} material={ruinMat} castShadow receiveShadow>
        <boxGeometry args={[0.90, 4.80, 0.90]} />
      </mesh>
      <mesh position={[1.65, 2.40, 0]} material={ruinMat} castShadow receiveShadow>
        <boxGeometry args={[0.90, 4.80, 0.90]} />
      </mesh>
      <mesh position={[0, 5.05, 0]} rotation={[0, 0, 0.055]} material={ruinMat} castShadow>
        <boxGeometry args={[3.85, 0.65, 0.90]} />
      </mesh>
      <mesh position={[0.90, 0.28, 1.30]} rotation={[0.30, 0.90, 0.20]} material={ruinMat} castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.50, 0.70]} />
      </mesh>
      <mesh position={[-1.10, 0.18,-0.90]} rotation={[0.10, 1.30, 0.10]} material={ruinMat} castShadow receiveShadow>
        <boxGeometry args={[0.55, 0.40, 0.60]} />
      </mesh>
    </group>
  )
}

/** HOLLOW — ring of dark rocks + green firefly cluster anchored to location */
function HollowFireflies({ x, z, y }) {
  const COUNT = 28
  const ref   = useRef()

  const { positions, phases } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3)
    const phases    = Array.from({ length: COUNT }, (_, i) => ({
      r:  1.5 + (i * 0.618 % 4.0),
      a:  (i / COUNT) * Math.PI * 2,
      h:  0.4 + (i * 0.30 % 2.5),
      sa: 0.25 + (i * 0.17 % 0.50),
      ph: (i * 0.70) % 6.28,
    }))
    return { positions, phases }
  }, [])

  const ffTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(180,255,140,1)')
    g.addColorStop(1, 'rgba(100,200,80,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
    return new THREE.CanvasTexture(c)
  }, [])

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t   = clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < COUNT; i++) {
      const p         = phases[i]
      arr[i * 3]     = x + Math.cos(p.a + t * p.sa * 0.5) * p.r
      arr[i * 3 + 1] = y + p.h + Math.sin(t * p.sa + p.ph) * 0.35
      arr[i * 3 + 2] = z + Math.sin(p.a + t * p.sa * 0.5) * p.r
    }
    ref.current.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={COUNT} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.55} map={ffTex} color="#b0ff80"
        transparent opacity={0.90} depthWrite={false}
        blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

function Hollow({ x, z, y }) {
  const rocks = useMemo(() =>
    Array.from({ length: 9 }, (_, i) => {
      const a  = (i / 9) * Math.PI * 2 + i * 0.22
      const r  = 3.0 + (i % 3) * 0.90
      const rx = x + Math.cos(a) * r
      const rz = z + Math.sin(a) * r
      return { x: rx, y: terrainHeight(rx, rz), z: rz, a, s: 0.50 + (i % 3) * 0.25 }
    }),
  [x, z])

  return (
    <group>
      {rocks.map((r, i) => (
        <mesh key={i} position={[r.x, r.y + r.s * 0.40, r.z]}
          rotation={[0.10, r.a, 0.15]} material={hollowRockMat} castShadow receiveShadow>
          <dodecahedronGeometry args={[r.s, 0]} />
        </mesh>
      ))}
      <HollowFireflies x={x} z={z} y={y} />
    </group>
  )
}

/** BRIDGE — two stone towers, left deck breaks mid-span, right section collapsed */
function Bridge({ x, z, y }) {
  return (
    <group position={[x, y, z]}>
      <mesh position={[-4.50, 2.50, 0]} material={bridgeStoneMat} castShadow receiveShadow>
        <boxGeometry args={[2.20, 5.00, 2.20]} />
      </mesh>
      <mesh position={[4.50, 2.50, 0]} material={bridgeStoneMat} castShadow receiveShadow>
        <boxGeometry args={[2.20, 5.00, 2.20]} />
      </mesh>
      <mesh position={[-2.0, 5.10, 0]} rotation={[0, 0, -0.10]} material={bridgePlankMat} castShadow>
        <boxGeometry args={[4.80, 0.28, 1.80]} />
      </mesh>
      <mesh position={[1.60, 0.30, 0.60]} rotation={[0.35, 0.30, 0.15]} material={bridgePlankMat} castShadow receiveShadow>
        <boxGeometry args={[3.60, 0.28, 1.80]} />
      </mesh>
    </group>
  )
}

/** FLOWER FIELD — 38 deterministically-placed colourful flowers */
function FlowerField({ x, z }) {
  const flowers = useMemo(() => {
    let seed = Math.abs(((x * 127) ^ (z * 311)) | 0) + 1
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff }
    return Array.from({ length: 38 }, (_, i) => {
      const a     = (i / 38) * Math.PI * 2 + rng() * 0.45
      const r     = 1.5 + rng() * 6.5
      const fx    = x + Math.cos(a) * r
      const fz    = z + Math.sin(a) * r
      const stemH = 0.50 + rng() * 0.85
      return { fx, fy: terrainHeight(fx, fz), fz, stemH, mi: i % flowerMats.length, rot: rng() * Math.PI * 2 }
    })
  }, [x, z])

  return (
    <group>
      {flowers.map((f, i) => (
        <group key={i} position={[f.fx, f.fy, f.fz]} rotation={[0, f.rot, 0]}>
          <mesh position={[0, f.stemH * 0.5, 0]} material={stemMat} castShadow>
            <cylinderGeometry args={[0.04, 0.055, f.stemH, 4]} />
          </mesh>
          <mesh position={[0, f.stemH + 0.14, 0]} material={flowerMats[f.mi]} castShadow>
            <sphereGeometry args={[0.20, 6, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** CLEARING — ring of standing stones, each following per-stone terrain height */
function Clearing({ x, z }) {
  const stones = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => {
      const a  = (i / 10) * Math.PI * 2
      const sx = x + Math.cos(a) * 8.0
      const sz = z + Math.sin(a) * 8.0
      const h  = 0.80 + (i % 3) * 0.55
      return { sx, sy: terrainHeight(sx, sz), sz, a, h }
    }),
  [x, z])

  return (
    <group>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.sx, s.sy + s.h, s.sz]}
          rotation={[0.04, s.a, 0.04]} material={clearingMat} castShadow receiveShadow>
          <boxGeometry args={[0.52, s.h * 2, 0.36]} />
        </mesh>
      ))}
    </group>
  )
}

/** LIGHTHOUSE — striped tower with pulsing point-light beacon (range 90 units) */
function Lighthouse({ x, z, y }) {
  const glowRef = useRef()
  useFrame(({ clock }) => {
    if (glowRef.current) glowRef.current.intensity = 1.8 + Math.sin(clock.elapsedTime * 1.6) * 0.6
  })
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 7.0, 0]} material={lhBodyMat} castShadow receiveShadow>
        <cylinderGeometry args={[1.10, 1.55, 14.0, 12]} />
      </mesh>
      {[3.0, 6.5, 10.0].map((yy, i) => (
        <mesh key={i} position={[0, yy, 0]} material={lhStripeMat} castShadow>
          <cylinderGeometry args={[1.24 - i * 0.04, 1.24 - i * 0.04, 1.1, 12]} />
        </mesh>
      ))}
      <mesh position={[0, 14.60, 0]} material={lhGlassMat} castShadow>
        <cylinderGeometry args={[0.95, 1.05, 1.30, 8]} />
      </mesh>
      <mesh position={[0, 15.85, 0]} material={lhRoofMat} castShadow>
        <coneGeometry args={[1.10, 1.60, 8]} />
      </mesh>
      <pointLight ref={glowRef} position={[0, 14.5, 0]}
        color="#ffe066" intensity={2.0} distance={90} decay={2} />
    </group>
  )
}

/** STREAM MARKER — small wooden dock; water body already in Water.jsx */
function StreamMarker({ x, z, y }) {
  return (
    <group position={[x, y + 0.06, z]}>
      <mesh position={[0, 0.20, 0]} material={dockMat} castShadow receiveShadow>
        <boxGeometry args={[3.80, 0.20, 1.00]} />
      </mesh>
      {[-1.50, 0, 1.50].map((px, i) => (
        <mesh key={i} position={[px,-0.25, 0.60]} material={dockMat} castShadow>
          <cylinderGeometry args={[0.08, 0.10, 1.00, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** CANYON — cluster of tall jagged rock spires, each sampling its own terrain Y */
function Canyon({ x, z }) {
  const spires = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const a  = (i / 8) * Math.PI * 2 + i * 0.38
      const r  = 1.8 + (i * 1.618 % 4.0)
      const sx = x + Math.cos(a) * r
      const sz = z + Math.sin(a) * r
      const h  = 2.5 + (i * 1.40 % 5.0)
      const w  = 0.40 + (i % 3) * 0.25
      return { sx, sy: terrainHeight(sx, sz), sz, h, a, w }
    }),
  [x, z])

  return (
    <group>
      {spires.map((s, i) => (
        <mesh key={i} position={[s.sx, s.sy + s.h * 0.5, s.sz]}
          rotation={[0.06, s.a * 0.25, 0.07]}
          material={i % 2 === 0 ? canyonMatA : canyonMatB}
          castShadow receiveShadow>
          <cylinderGeometry args={[s.w * 0.30, s.w, s.h * 2, 5]} />
        </mesh>
      ))}
    </group>
  )
}

// =============================================================================
// Feature dispatcher
// =============================================================================
function Feature({ lm }) {
  const y = useMemo(() => terrainHeight(lm.x, lm.z), [lm])

  switch (lm.kind) {
    case 'spawn':
      return <SpawnPlaza x={lm.x} z={lm.z} />

    case 'oak':
      return <group position={[lm.x, y, lm.z]}><BigTree /></group>

    case 'pond':
      return <PondMarker x={lm.x} z={lm.z} />

    case 'windmill':
      return <Windmill x={lm.x} z={lm.z} />

    case 'stone':
      return <SunStone x={lm.x} z={lm.z} />

    case 'grove':
      return (
        <group position={[lm.x, y, lm.z]}>
          {Array.from({ length: 7 }, (_, i) => {
            const a  = (i / 7) * Math.PI * 2
            const rx = lm.x + Math.cos(a) * 6
            const rz = lm.z + Math.sin(a) * 6
            return (
              <group key={i} position={[Math.cos(a) * 6, terrainHeight(rx, rz) - y, Math.sin(a) * 6]}>
                <SmallTree variant={i % 3} scale={1 + (i % 3) * 0.15} />
              </group>
            )
          })}
        </group>
      )

    case 'willow':
      return <group position={[lm.x, y, lm.z]}><WillowTree /></group>

    case 'ruin':
      return <Ruin x={lm.x} z={lm.z} y={y} />

    case 'hollow':
      return <Hollow x={lm.x} z={lm.z} y={y} />

    case 'bridge':
      return <Bridge x={lm.x} z={lm.z} y={y} />

    case 'flowers':
      return <FlowerField x={lm.x} z={lm.z} />

    case 'clearing':
      return <Clearing x={lm.x} z={lm.z} />

    case 'lighthouse':
      return <Lighthouse x={lm.x} z={lm.z} y={y} />

    case 'stream':
      return <StreamMarker x={lm.x} z={lm.z} y={y} />

    case 'canyon':
      return <Canyon x={lm.x} z={lm.z} />

    case 'hill':
    default: {
      // FIX #7 — unique per-landmark rotation derived from landmark ID hash.
      // Previously ALL hill/default stones shared the same fixed [0.06, 0.4, 0.03].
      const seed = lm.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
      const rotY = (seed * 0.7183) % (Math.PI * 2)
      return (
        <mesh position={[lm.x, y + 1.10, lm.z]} rotation={[0.05, rotY, 0.03]} castShadow receiveShadow>
          <boxGeometry args={[0.80, 2.20, 0.50]} />
          <meshStandardMaterial color="#9a938a" roughness={1} flatShading />
        </mesh>
      )
    }
  }
}

// =============================================================================
// Root Landmarks component
// =============================================================================
export default function Landmarks() {
  const discoverLandmark = useStore((s) => s.discoverLandmark)

  /**
   * FIX #8 — HUD name hysteresis.
   * Only switch the active landmark when a new candidate is conclusively closer
   * (> 6 units), preventing the name from flickering at landmark boundaries.
   */
  const activeLmRef = useRef(null)

  useFrame(() => {
    const { landmark, dist, nearRange, discoverRange } = nearestLandmark(P.pos.x, P.pos.z)
    if (!landmark) return

    if (activeLmRef.current && activeLmRef.current.id !== landmark.id) {
      const activeDist = Math.hypot(
        activeLmRef.current.x - P.pos.x,
        activeLmRef.current.z - P.pos.z,
      )
      if (dist >= activeDist - 6) {
        // New landmark not conclusively closer — keep active one
        const curNear = activeLmRef.current.nearRange    ?? NEAR_RANGE
        const curDisc = activeLmRef.current.discoverRange ?? DISCOVER_RANGE
        place.name = activeDist < curNear ? activeLmRef.current.name : ''
        if (activeDist < curDisc) discoverLandmark(activeLmRef.current.id)
        return
      }
    }

    activeLmRef.current = landmark
    place.name = dist < nearRange ? landmark.name : ''
    if (dist < discoverRange) discoverLandmark(landmark.id)
  })

  return (
    <group>
      {LANDMARKS.map((lm) => (
        <Feature key={lm.id} lm={lm} />
      ))}
    </group>
  )
}
