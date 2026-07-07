import * as THREE from 'three'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useStore } from '../store'
import { P } from '../player-state'
import { terrainHeight } from './noise'

const PATH_SEGMENTS = 48
const ARROW_SIZE = 1.2
const ARRIVE_DIST = 15
const PATH_Y_OFFSET = 0.25 // hover above terrain

// Generates a smooth curve from player to target with a slight S-bend so it
// looks like a natural path rather than a straight line.
function buildCurve(px, pz, tx, tz) {
  const dx = tx - px
  const dz = tz - pz
  const dist = Math.hypot(dx, dz)
  // perpendicular offset for the two control points (makes it curvy)
  const perp = Math.min(dist * 0.18, 20)
  const nx = -dz / dist
  const nz = dx / dist

  const p0 = new THREE.Vector3(px, 0, pz)
  const p1 = new THREE.Vector3(px + dx * 0.3 + nx * perp, 0, pz + dz * 0.3 + nz * perp)
  const p2 = new THREE.Vector3(px + dx * 0.7 - nx * perp, 0, pz + dz * 0.7 - nz * perp)
  const p3 = new THREE.Vector3(tx, 0, tz)

  return new THREE.CubicBezierCurve3(p0, p1, p2, p3)
}

export default function NavPath() {
  const navTarget = useStore((s) => s.navTarget)
  const clearNav = useStore((s) => s.clearNav)
  const flash = useStore((s) => s.flash)
  const lineRef = useRef()
  const arrowRef = useRef()

  // Pre-allocate geometry buffer
  const positions = useMemo(() => new Float32Array((PATH_SEGMENTS + 1) * 3), [])

  useFrame(() => {
    if (!navTarget) return
    if (!lineRef.current || !arrowRef.current) return

    const px = P.pos.x
    const pz = P.pos.z
    const tx = navTarget.x
    const tz = navTarget.z
    const dist = Math.hypot(tx - px, tz - pz)

    // Arrival check
    if (dist < ARRIVE_DIST) {
      clearNav()
      flash(`arrived at ${navTarget.name}`)
      return
    }

    // Build curve and sample points
    const curve = buildCurve(px, pz, tx, tz)
    const pts = curve.getPoints(PATH_SEGMENTS)

    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      const p = pts[i]
      const y = terrainHeight(p.x, p.z) + PATH_Y_OFFSET
      positions[i * 3] = p.x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = p.z
    }

    lineRef.current.geometry.attributes.position.array = positions
    lineRef.current.geometry.attributes.position.needsUpdate = true

    // Position the arrow at ~8 units ahead on the curve (about 10-15% along)
    const arrowT = Math.min(8 / dist, 0.15)
    const arrowPt = curve.getPointAt(arrowT)
    const arrowTangent = curve.getTangentAt(arrowT)
    const ay = terrainHeight(arrowPt.x, arrowPt.z) + PATH_Y_OFFSET + 0.1

    arrowRef.current.position.set(arrowPt.x, ay, arrowPt.z)
    // Rotate arrow to face along the path tangent
    const angle = Math.atan2(arrowTangent.x, arrowTangent.z)
    arrowRef.current.rotation.set(-Math.PI / 2, 0, -angle)
  })

  if (!navTarget) return null

  return (
    <group>
      {/* Curvy path line */}
      <line ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={PATH_SEGMENTS + 1}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#5bb8ff"
          transparent
          opacity={0.7}
          linewidth={1}
          depthWrite={false}
        />
      </line>

      {/* Single directional arrow (cone pointing forward) */}
      <mesh ref={arrowRef}>
        <coneGeometry args={[ARROW_SIZE * 0.5, ARROW_SIZE, 3]} />
        <meshBasicMaterial
          color="#5bb8ff"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
