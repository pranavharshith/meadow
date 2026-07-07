import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { mulberry32 } from './noise'

// A few small dark birds gliding in wide circles high above, wings flapping.
// Each wing hinges at the body (parented to a pivot) so the flap looks right,
// and the birds bank gently into their turns. Their circles drift with the
// player so there is always something alive in the sky.
export default function Birds() {
  const groupRefs = useRef([])
  const leftRefs = useRef([])
  const rightRefs = useRef([])
  const { camera } = useThree()

  const birds = useMemo(() => {
    const rng = mulberry32(77)
    const arr = []
    for (let i = 0; i < 7; i++) {
      arr.push({
        ox: (rng() - 0.5) * 120,
        oz: (rng() - 0.5) * 120,
        R: 14 + rng() * 30,
        h: 22 + rng() * 16,
        speed: 0.15 + rng() * 0.15,
        phase: rng() * Math.PI * 2,
        flap: 6 + rng() * 3,
      })
    }
    return arr
  }, [])

  const wingGeo = useMemo(() => {
    // hinge at the inner edge: shift the quad so x=0 is the shoulder
    const g = new THREE.PlaneGeometry(1.3, 0.5)
    g.translate(0.65, 0, 0)
    return g
  }, [])
  const bodyGeo = useMemo(() => new THREE.ConeGeometry(0.13, 0.9, 5), [])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#31353b',
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    []
  )

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // slowly drift the flock centre toward the player so birds stay in view
    const px = camera.position.x
    const pz = camera.position.z
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      const g = groupRefs.current[i]
      if (!g) continue
      const ang = t * b.speed + b.phase
      const cx = px + b.ox
      const cz = pz + b.oz
      g.position.set(
        cx + Math.cos(ang) * b.R,
        b.h + Math.sin(t * 0.4 + b.phase) * 1.5,
        cz + Math.sin(ang) * b.R
      )
      g.rotation.set(0, -ang + Math.PI / 2, 0)
      // bank into the circle
      g.rotateZ(0.35)

      const f = Math.sin(t * b.flap + b.phase) * 0.6
      const l = leftRefs.current[i]
      const r = rightRefs.current[i]
      if (l) l.rotation.z = f
      if (r) r.rotation.z = -f
    }
  })

  return (
    <group>
      {birds.map((b, i) => (
        <group key={i} ref={(el) => (groupRefs.current[i] = el)}>
          <mesh geometry={bodyGeo} material={mat} rotation={[Math.PI / 2, 0, 0]} />
          {/* pivot at the shoulder so the wing hinges at the body */}
          <group ref={(el) => (rightRefs.current[i] = el)}>
            <mesh geometry={wingGeo} material={mat} />
          </group>
          <group ref={(el) => (leftRefs.current[i] = el)} rotation={[0, Math.PI, 0]}>
            <mesh geometry={wingGeo} material={mat} />
          </group>
        </group>
      ))}
    </group>
  )
}
