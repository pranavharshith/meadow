import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mulberry32, terrainHeight } from './noise'
import { P, treeRegistry } from '../player-state'

const COUNT = 12
const WING_COLORS = ['#d99aae', '#dfb45f', '#91add1', '#ae92c7', '#ddd6bd']

/** Small triangular butterflies that gather around mature nearby trees. */
export default function Butterflies() {
  const groupRefs = useRef([])
  const leftRefs = useRef([])
  const rightRefs = useRef([])

  const flutters = useMemo(() => {
    const random = mulberry32(2024)
    return Array.from({ length: COUNT }, () => ({
      anchorX: P.pos.x + (random() - 0.5) * 40,
      anchorZ: P.pos.z + (random() - 0.5) * 40,
      radius: 1.2 + random() * 3.2,
      speed: 0.5 + random() * 0.9,
      phase: random() * Math.PI * 2,
      height: 0.6 + random() * 1.8,
      flap: 12 + random() * 8,
      colorIndex: (random() * WING_COLORS.length) | 0,
      nextAnchorAt: 0,
    }))
  }, [])

  const wingGeometry = useMemo(() => {
    const geometry = new THREE.CircleGeometry(0.14, 3)
    geometry.translate(0.11, 0, 0)
    return geometry
  }, [])
  const materials = useMemo(() => WING_COLORS.map((color) => new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    side: THREE.DoubleSide,
  })), [])
  const random = useMemo(() => mulberry32(88), [])

  const pickAnchor = (flutter) => {
    let best = null
    let bestDistance = 900
    for (let index = 0; index < treeRegistry.length; index++) {
      const tree = treeRegistry[index]
      if (!tree.mature) continue
      const distance = (tree.x - P.pos.x) ** 2 + (tree.z - P.pos.z) ** 2
      if (distance < bestDistance && random() < 0.6) {
        bestDistance = distance
        best = tree
      }
    }
    if (best) {
      flutter.anchorX = best.x + (random() - 0.5) * 2
      flutter.anchorZ = best.z + (random() - 0.5) * 2
    } else {
      flutter.anchorX = P.pos.x + (random() - 0.5) * 34
      flutter.anchorZ = P.pos.z + (random() - 0.5) * 34
    }
  }

  useFrame(({ clock }) => {
    const time = clock.elapsedTime
    for (let index = 0; index < COUNT; index++) {
      const flutter = flutters[index]
      const group = groupRefs.current[index]
      if (!group) continue

      if (time > flutter.nextAnchorAt) {
        pickAnchor(flutter)
        flutter.nextAnchorAt = time + 5 + random() * 6
      }
      if (Math.hypot(flutter.anchorX - P.pos.x, flutter.anchorZ - P.pos.z) > 45) {
        pickAnchor(flutter)
        flutter.nextAnchorAt = time + 5 + random() * 6
      }

      const angle = time * flutter.speed + flutter.phase
      const x = flutter.anchorX + Math.cos(angle) * flutter.radius
      const z = flutter.anchorZ + Math.sin(angle * 1.3) * flutter.radius
      group.position.set(
        x,
        terrainHeight(x, z) + flutter.height + Math.sin(time * 2 + flutter.phase) * 0.35,
        z,
      )
      group.rotation.y = -angle

      const flap = 0.2 + Math.abs(Math.sin(time * flutter.flap + flutter.phase)) * 1.1
      if (rightRefs.current[index]) rightRefs.current[index].rotation.y = flap
      if (leftRefs.current[index]) leftRefs.current[index].rotation.y = Math.PI - flap
    }
  })

  return (
    <group name="butterflies">
      {flutters.map((flutter, index) => (
        <group key={index} ref={(group) => { groupRefs.current[index] = group }}>
          <group ref={(wing) => { rightRefs.current[index] = wing }}>
            <mesh geometry={wingGeometry} material={materials[flutter.colorIndex]} />
          </group>
          <group ref={(wing) => { leftRefs.current[index] = wing }} rotation={[0, Math.PI, 0]}>
            <mesh geometry={wingGeometry} material={materials[flutter.colorIndex]} />
          </group>
        </group>
      ))}
    </group>
  )
}
