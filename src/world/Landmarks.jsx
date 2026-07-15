import * as THREE from 'three'
import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, getTerrainPlotRev } from './noise'
import {
  trunkGeo, leafGeo, trunkMat, leafMats,
  willowTrunkGeo, willowTrunkMat, willowLeafGeo, willowLeafMats,
} from './tree-assets'
import { LANDMARKS, NEAR_RANGE, DISCOVER_RANGE, nearestLandmark } from './places'
import { P, place, landmarkColliders } from '../player-state'
import { useStore } from '../store'
import SpawnPlaza from './SpawnPlaza'

// Distance cull radius for landmark set pieces (G3.8)
const LANDMARK_CULL = 380

/** Soft collision radii by landmark kind (G3.4) */
const COLLIDER_R = {
  spawn: 0, // obelisk handled in Player
  oak: 1.35,
  pond: 0,
  windmill: 1.5,
  stone: 1.7,
  grove: 0,
  willow: 1.2,
  ruin: 2.4,
  hollow: 0,
  bridge: 0, // towers registered separately
  flowers: 0,
  clearing: 0,
  lighthouse: 2.0,
  stream: 0,
  canyon: 2.5,
  hill: 1.1,
}

// Module-level materials — allocated once, reused across all instances
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

// Flower petal colours — shared across FlowerField instances
const flowerMats = [
  '#ff6eb4', '#ffb347', '#ffd966', '#c084fc',
  '#67e8f9', '#86efac', '#ff9de2',
].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, flatShading: false }))

// =============================================================================
// Grounded wrapper — live terrain Y + distance cull (G3.1 / G3.8)
// =============================================================================
function Grounded({ x, z, children, cull = LANDMARK_CULL }) {
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    const d = Math.hypot(P.pos.x - x, P.pos.z - z)
    const show = d < cull
    ref.current.visible = show
    if (show) {
      ref.current.position.y = terrainHeight(x, z)
    }
  })
  // Initial Y so first frame is correct
  const y0 = terrainHeight(x, z)
  return (
    <group ref={ref} position={[x, y0, z]}>
      {children}
    </group>
  )
}

/** Register static colliders once (G3.4) */
function useLandmarkColliders() {
  useEffect(() => {
    landmarkColliders.length = 0
    for (const lm of LANDMARKS) {
      const r = COLLIDER_R[lm.kind] ?? 0
      if (r > 0) landmarkColliders.push({ x: lm.x, z: lm.z, r })
      // Bridge: two tower centers
      if (lm.kind === 'bridge') {
        landmarkColliders.push({ x: lm.x - 4.5, z: lm.z, r: 1.6 })
        landmarkColliders.push({ x: lm.x + 4.5, z: lm.z, r: 1.6 })
      }
    }
    return () => {
      landmarkColliders.length = 0
    }
  }, [])
}

// =============================================================================
// Tree sub-components — trunks centered so base sits on y=0 (G3.2)
// trunkGeo height 2.8 → center at 1.4; willow 3.8 → 1.9
// =============================================================================

function BigTree({ scale = 2.4 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[0]} position={[0, 2.9, 0]} scale={[1.7, 1.5, 1.7]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[1]} position={[0.7, 2.5, 0.3]} scale={1.0} castShadow />
      <mesh geometry={leafGeo} material={leafMats[2]} position={[-0.6, 2.4, -0.35]} scale={0.95} castShadow />
    </group>
  )
}

function SmallTree({ variant = 0, scale = 1 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 1.4, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[variant % 3]} position={[0, 2.85, 0]} scale={[1.3, 1.2, 1.3]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 1) % 3]} position={[0.5, 2.45, 0.22]} scale={0.8} castShadow />
    </group>
  )
}

function WillowTree() {
  return (
    <group>
      <mesh geometry={willowTrunkGeo} material={willowTrunkMat} position={[0, 1.9, 0]} castShadow receiveShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[0]} position={[0, 4.0, 0]} scale={[1.6, 1.8, 1.6]} castShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[1]} position={[0.5, 3.4, 0.4]} scale={0.8} castShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[2]} position={[-0.4, 3.2, -0.3]} scale={0.7} castShadow />
    </group>
  )
}

// =============================================================================
// Landmark feature components
// =============================================================================

/** Pond shore rocks — Y updated live so shore tracks terrain (G3.1/G3.3) */
function PondMarker() {
  const groupRef = useRef()
  const specs = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        const r = 10.0 + (i % 3) * 0.7
        return { a, r, s: 0.45 + (i % 3) * 0.28 }
      }),
    [],
  )
  // Parent Grounded places at pond center; rocks offset in XZ, live Y
  useFrame(() => {
    if (!groupRef.current) return
    const parent = groupRef.current.parent
    if (!parent) return
    const cx = parent.position.x
    const cz = parent.position.z
    groupRef.current.children.forEach((mesh, i) => {
      const sp = specs[i]
      if (!sp) return
      const rx = Math.cos(sp.a) * sp.r
      const rz = Math.sin(sp.a) * sp.r
      const ry = terrainHeight(cx + rx, cz + rz) - parent.position.y + sp.s * 0.35
      mesh.position.set(rx, ry, rz)
    })
  })
  return (
    <group ref={groupRef}>
      {specs.map((sp, i) => (
        <mesh key={i} rotation={[0.1, sp.a, 0.12]} material={pondRockMat} castShadow receiveShadow>
          <dodecahedronGeometry args={[sp.s, 0]} />
        </mesh>
      ))}
    </group>
  )
}

function Windmill() {
  const bladeRef = useRef()
  useFrame((_, dt) => {
    if (bladeRef.current) bladeRef.current.rotation.z += dt * 0.5
  })
  return (
    <group>
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

function SunStone() {
  return (
    <mesh position={[0, 1.4, 0]} castShadow>
      <dodecahedronGeometry args={[2, 0]} />
      <meshStandardMaterial color="#f0c060" emissive="#ffb43a" emissiveIntensity={0.5} roughness={0.4} flatShading />
    </mesh>
  )
}

// --- New landmark kinds (FIX #2) -------------------------------------------

/** RUIN — stone arch (local space; parent Grounded sets world Y) */
function Ruin() {
  return (
    <group>
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

/** HOLLOW — ring of dark rocks + fireflies (local space) */
function HollowFireflies({ y = 0 }) {
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
    const t = clock.elapsedTime
    const arr = ref.current.geometry.attributes.position.array
    for (let i = 0; i < COUNT; i++) {
      const p = phases[i]
      arr[i * 3] = Math.cos(p.a + t * p.sa * 0.5) * p.r
      arr[i * 3 + 1] = y + p.h + Math.sin(t * p.sa + p.ph) * 0.35
      arr[i * 3 + 2] = Math.sin(p.a + t * p.sa * 0.5) * p.r
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

function Hollow() {
  const specs = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + i * 0.22
        const r = 3.0 + (i % 3) * 0.9
        return { a, r, s: 0.5 + (i % 3) * 0.25 }
      }),
    [],
  )
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current?.parent) return
    const px = groupRef.current.parent.position.x
    const py = groupRef.current.parent.position.y
    const pz = groupRef.current.parent.position.z
    groupRef.current.children.forEach((mesh, i) => {
      if (mesh.type === 'Points') return
      const sp = specs[i]
      if (!sp) return
      const lx = Math.cos(sp.a) * sp.r
      const lz = Math.sin(sp.a) * sp.r
      const ly = terrainHeight(px + lx, pz + lz) - py + sp.s * 0.4
      mesh.position.set(lx, ly, lz)
    })
  })
  return (
    <group>
      <group ref={groupRef}>
        {specs.map((sp, i) => (
          <mesh key={i} rotation={[0.1, sp.a, 0.15]} material={hollowRockMat} castShadow receiveShadow>
            <dodecahedronGeometry args={[sp.s, 0]} />
          </mesh>
        ))}
      </group>
      <HollowFireflies y={0} />
    </group>
  )
}

/** BRIDGE — two stone towers (local space) */
function Bridge() {
  return (
    <group>
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

/** FLOWER FIELD — live Y per flower (G3.1) */
function FlowerField() {
  const specs = useMemo(() => {
    let seed = 42
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    return Array.from({ length: 38 }, (_, i) => {
      const a = (i / 38) * Math.PI * 2 + rng() * 0.45
      const r = 1.5 + rng() * 6.5
      return {
        lx: Math.cos(a) * r,
        lz: Math.sin(a) * r,
        stemH: 0.5 + rng() * 0.85,
        mi: i % flowerMats.length,
        rot: rng() * Math.PI * 2,
      }
    })
  }, [])
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current?.parent) return
    const px = groupRef.current.parent.position.x
    const py = groupRef.current.parent.position.y
    const pz = groupRef.current.parent.position.z
    groupRef.current.children.forEach((g, i) => {
      const sp = specs[i]
      if (!sp) return
      const ly = terrainHeight(px + sp.lx, pz + sp.lz) - py
      g.position.set(sp.lx, ly, sp.lz)
    })
  })
  return (
    <group ref={groupRef}>
      {specs.map((f, i) => (
        <group key={i} rotation={[0, f.rot, 0]}>
          <mesh position={[0, f.stemH * 0.5, 0]} material={stemMat} castShadow>
            <cylinderGeometry args={[0.04, 0.055, f.stemH, 4]} />
          </mesh>
          <mesh position={[0, f.stemH + 0.14, 0]} material={flowerMats[f.mi]} castShadow>
            <sphereGeometry args={[0.2, 6, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** CLEARING — standing stones with live Y */
function Clearing() {
  const specs = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return { a, r: 8.0, h: 0.8 + (i % 3) * 0.55 }
      }),
    [],
  )
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current?.parent) return
    const px = groupRef.current.parent.position.x
    const py = groupRef.current.parent.position.y
    const pz = groupRef.current.parent.position.z
    groupRef.current.children.forEach((mesh, i) => {
      const sp = specs[i]
      if (!sp) return
      const lx = Math.cos(sp.a) * sp.r
      const lz = Math.sin(sp.a) * sp.r
      const ly = terrainHeight(px + lx, pz + lz) - py + sp.h
      mesh.position.set(lx, ly, lz)
    })
  })
  return (
    <group ref={groupRef}>
      {specs.map((s, i) => (
        <mesh key={i} rotation={[0.04, s.a, 0.04]} material={clearingMat} castShadow receiveShadow>
          <boxGeometry args={[0.52, s.h * 2, 0.36]} />
        </mesh>
      ))}
    </group>
  )
}

/** LIGHTHOUSE — striped tower with beacon */
function Lighthouse() {
  const glowRef = useRef()
  useFrame(({ clock }) => {
    if (glowRef.current) glowRef.current.intensity = 1.8 + Math.sin(clock.elapsedTime * 1.6) * 0.6
  })
  return (
    <group>
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

/** STREAM MARKER — wooden dock (slightly above bed / shore) */
function StreamMarker() {
  return (
    <group position={[0, 0.12, 0]}>
      <mesh position={[0, 0.2, 0]} material={dockMat} castShadow receiveShadow>
        <boxGeometry args={[3.8, 0.2, 1.0]} />
      </mesh>
      {[-1.5, 0, 1.5].map((px, i) => (
        <mesh key={i} position={[px, -0.25, 0.6]} material={dockMat} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 1.0, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** CANYON — spires with live Y */
function Canyon() {
  const specs = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + i * 0.38
        const r = 1.8 + ((i * 1.618) % 4.0)
        return {
          a,
          r,
          h: 2.5 + ((i * 1.4) % 5.0),
          w: 0.4 + (i % 3) * 0.25,
        }
      }),
    [],
  )
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current?.parent) return
    const px = groupRef.current.parent.position.x
    const py = groupRef.current.parent.position.y
    const pz = groupRef.current.parent.position.z
    groupRef.current.children.forEach((mesh, i) => {
      const sp = specs[i]
      if (!sp) return
      const lx = Math.cos(sp.a) * sp.r
      const lz = Math.sin(sp.a) * sp.r
      const ly = terrainHeight(px + lx, pz + lz) - py + sp.h * 0.5
      mesh.position.set(lx, ly, lz)
    })
  })
  return (
    <group ref={groupRef}>
      {specs.map((s, i) => (
        <mesh
          key={i}
          rotation={[0.06, s.a * 0.25, 0.07]}
          material={i % 2 === 0 ? canyonMatA : canyonMatB}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[s.w * 0.3, s.w, s.h * 2, 5]} />
        </mesh>
      ))}
    </group>
  )
}

// =============================================================================
// Feature dispatcher — Grounded parent keeps set pieces on terrain (G3.1)
// =============================================================================
function Grove() {
  const offsets = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        return { a, lx: Math.cos(a) * 6, lz: Math.sin(a) * 6, variant: i % 3, scale: 1 + (i % 3) * 0.15 }
      }),
    [],
  )
  const groupRef = useRef()
  useFrame(() => {
    if (!groupRef.current?.parent) return
    const px = groupRef.current.parent.position.x
    const py = groupRef.current.parent.position.y
    const pz = groupRef.current.parent.position.z
    groupRef.current.children.forEach((g, i) => {
      const o = offsets[i]
      if (!o) return
      const ly = terrainHeight(px + o.lx, pz + o.lz) - py
      g.position.set(o.lx, ly, o.lz)
    })
  })
  return (
    <group ref={groupRef}>
      {offsets.map((o, i) => (
        <group key={i}>
          <SmallTree variant={o.variant} scale={o.scale} />
        </group>
      ))}
    </group>
  )
}

function HillStone({ lm }) {
  const seed = lm.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const rotY = (seed * 0.7183) % (Math.PI * 2)
  return (
    <mesh position={[0, 1.1, 0]} rotation={[0.05, rotY, 0.03]} castShadow receiveShadow>
      <boxGeometry args={[0.8, 2.2, 0.5]} />
      <meshStandardMaterial color="#9a938a" roughness={1} flatShading />
    </mesh>
  )
}

function Feature({ lm }) {
  // Spawn plaza has its own height system
  if (lm.kind === 'spawn') {
    return <SpawnPlaza x={lm.x} z={lm.z} />
  }

  let body = null
  switch (lm.kind) {
    case 'oak':
      body = <BigTree />
      break
    case 'pond':
      body = <PondMarker />
      break
    case 'windmill':
      body = <Windmill />
      break
    case 'stone':
      body = <SunStone />
      break
    case 'grove':
      body = <Grove />
      break
    case 'willow':
      body = <WillowTree />
      break
    case 'ruin':
      body = <Ruin />
      break
    case 'hollow':
      body = <Hollow />
      break
    case 'bridge':
      body = <Bridge />
      break
    case 'flowers':
      body = <FlowerField />
      break
    case 'clearing':
      body = <Clearing />
      break
    case 'lighthouse':
      body = <Lighthouse />
      break
    case 'stream':
      body = <StreamMarker />
      break
    case 'canyon':
      body = <Canyon />
      break
    case 'hill':
    default:
      body = <HillStone lm={lm} />
      break
  }

  return (
    <Grounded x={lm.x} z={lm.z}>
      {body}
    </Grounded>
  )
}

// =============================================================================
// Root Landmarks component
// =============================================================================
export default function Landmarks() {
  const discoverLandmark = useStore((s) => s.discoverLandmark)
  useLandmarkColliders()

  // HUD name hysteresis — only switch when new candidate is clearly closer (G3.6)
  const activeLmRef = useRef(null)
  const stickyUntil = useRef(0)

  useFrame(() => {
    const { landmark, dist, nearRange, discoverRange } = nearestLandmark(P.pos.x, P.pos.z)
    if (!landmark) {
      place.name = ''
      return
    }

    const now = performance.now()
    if (activeLmRef.current && activeLmRef.current.id !== landmark.id) {
      const activeDist = Math.hypot(
        activeLmRef.current.x - P.pos.x,
        activeLmRef.current.z - P.pos.z,
      )
      // Need to be clearly closer AND past a short sticky window
      if (dist >= activeDist - 8 || now < stickyUntil.current) {
        const curNear = activeLmRef.current.nearRange ?? NEAR_RANGE
        const curDisc = activeLmRef.current.discoverRange ?? DISCOVER_RANGE
        place.name = activeDist < curNear ? activeLmRef.current.name : ''
        if (activeDist < curDisc) discoverLandmark(activeLmRef.current.id)
        return
      }
      stickyUntil.current = now + 400
    }

    activeLmRef.current = landmark
    place.name = dist < nearRange ? landmark.name : ''
    if (dist < discoverRange) discoverLandmark(landmark.id)
  })

  // Remount features when plot terrain changes so first Y is fresh
  const plotRev = getTerrainPlotRev()

  return (
    <group key={`lm-${plotRev}`}>
      {LANDMARKS.map((lm) => (
        <Feature key={lm.id} lm={lm} />
      ))}
    </group>
  )
}
