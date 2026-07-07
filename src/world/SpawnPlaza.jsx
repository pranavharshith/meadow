import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'

// ─────────────────────────────────────────────────────────────────────────────
// SpawnPlaza — The Meadow Gate
//
// A circular mossy-stone floor at world origin (0, 0). All players spawn
// within this plaza, so it acts as a natural meeting point. Made of:
//   • 3 concentric stone-tile rings (outer border, middle, center disc)
//   • 8 standing stones evenly around the outer ring
//   • A softly glowing moss-green center
//   • A faint golden ambient light emanating from the center pillar
// ─────────────────────────────────────────────────────────────────────────────

// Smooth stone tile material with subtle mossy tint
function stoneMat(color, emissive = '#000000', emissiveIntensity = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0.04,
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
  })
}

const outerRingMat  = stoneMat('#a09880') // aged limestone
const middleRingMat = stoneMat('#8d8070') // darker flagstone
const centerDiscMat = stoneMat('#7a9a68', '#3a6a28', 0.12) // mossy green center, soft glow
const standingStoneMat = stoneMat('#b8ae9a') // standing stone pillars
const capStoneMat   = stoneMat('#d4cabb') // lighter cap on top of each pillar

// Pre-build geometries once (not inside the component to avoid re-creation)
const outerRingGeo  = new THREE.RingGeometry(10.5, 13.5, 64)
outerRingGeo.rotateX(-Math.PI / 2)
const middleRingGeo = new THREE.RingGeometry(5.5, 10.5, 64)
middleRingGeo.rotateX(-Math.PI / 2)
const centerDiscGeo = new THREE.CircleGeometry(5.5, 64)
centerDiscGeo.rotateX(-Math.PI / 2)
const stoneGeo      = new THREE.BoxGeometry(0.9, 2.8, 0.55)
const stoneCapGeo   = new THREE.BoxGeometry(1.1, 0.22, 0.75)

// A glowing moss-light point at the center (warm golden-green)
const NUM_STONES = 8
const STONE_RADIUS = 12.2

export default function SpawnPlaza({ x = 0, z = 0 }) {
  const glowRef   = useRef()
  const ringRef   = useRef()
  const centerRef = useRef()

  // Ground Y at the plaza center
  const y = useMemo(() => terrainHeight(x, z), [x, z])

  // Animate: gentle glow pulse on the center disc and inner light
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Very subtle breathing glow on the moss center
    if (centerRef.current) {
      const mat = centerRef.current.material
      mat.emissiveIntensity = 0.10 + Math.sin(t * 0.7) * 0.06
    }
    // Soft pulsing point light
    if (glowRef.current) {
      glowRef.current.intensity = 0.55 + Math.sin(t * 0.8 + 1.2) * 0.18
    }
  })

  // 8 standing stones evenly spaced around the outer ring
  const stones = useMemo(() => {
    return Array.from({ length: NUM_STONES }, (_, i) => {
      const angle = (i / NUM_STONES) * Math.PI * 2
      const sx = x + Math.cos(angle) * STONE_RADIUS
      const sz = z + Math.sin(angle) * STONE_RADIUS
      const sy = terrainHeight(sx, sz)
      const tiltZ = (Math.random() - 0.5) * 0.06
      const tiltX = (Math.random() - 0.5) * 0.06
      return { sx, sy, sz, angle, tiltX, tiltZ, i }
    })
  }, [x, z])

  return (
    <group>
      {/* ── Floor tiles (flat, 1mm above terrain so no z-fight) ── */}
      <mesh geometry={outerRingGeo}  material={outerRingMat}  position={[x, y + 0.01, z]} receiveShadow />
      <mesh geometry={middleRingGeo} material={middleRingMat} position={[x, y + 0.02, z]} receiveShadow />
      <mesh
        ref={centerRef}
        geometry={centerDiscGeo}
        material={centerDiscMat}
        position={[x, y + 0.03, z]}
        receiveShadow
      />

      {/* ── Soft golden-green glow from the center ── */}
      <pointLight
        ref={glowRef}
        position={[x, y + 1.4, z]}
        color="#a8d878"
        intensity={0.6}
        distance={18}
        decay={2}
        castShadow={false}
      />

      {/* ── Standing stones ── */}
      {stones.map(({ sx, sy, sz, angle, tiltX, tiltZ, i }) => (
        <group
          key={i}
          position={[sx, sy, sz]}
          rotation={[tiltX, angle + Math.PI / 2, tiltZ]}
        >
          {/* Shaft */}
          <mesh
            geometry={stoneGeo}
            material={standingStoneMat}
            position={[0, 1.4, 0]}
            castShadow
            receiveShadow
          />
          {/* Cap (slightly wider slab on top) */}
          <mesh
            geometry={stoneCapGeo}
            material={capStoneMat}
            position={[0, 2.85, 0]}
            castShadow
          />
        </group>
      ))}

      {/* ── Decorative carved center post (thin obelisk) ── */}
      <mesh position={[x, y + 0.01, z]} castShadow>
        <cylinderGeometry args={[0.18, 0.26, 2.4, 8]} />
        <meshStandardMaterial color="#c8bea8" roughness={0.75} />
      </mesh>
      <mesh position={[x, y + 2.42, z]} castShadow>
        <coneGeometry args={[0.18, 0.55, 8]} />
        <meshStandardMaterial
          color="#e8d89a"
          emissive="#ffe060"
          emissiveIntensity={0.35}
          roughness={0.5}
        />
      </mesh>
    </group>
  )
}
