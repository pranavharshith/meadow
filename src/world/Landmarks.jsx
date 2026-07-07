import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { trunkGeo, leafGeo, trunkMat, leafMats } from './tree-assets'
import { LANDMARKS, nearestLandmark, DISCOVER_RANGE, NEAR_RANGE } from './places'
import { P, place } from '../player-state'
import { useStore } from '../store'

function BigTree({ scale = 2.4 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.75, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[0]} position={[0, 2.1, 0]} scale={[1.7, 1.5, 1.7]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[1]} position={[0.7, 1.7, 0.3]} scale={1.0} castShadow />
      <mesh geometry={leafGeo} material={leafMats[2]} position={[-0.6, 1.6, -0.35]} scale={0.95} castShadow />
    </group>
  )
}

function SmallTree({ variant = 0, scale = 1 }) {
  return (
    <group scale={scale}>
      <mesh geometry={trunkGeo} material={trunkMat} position={[0, 0.75, 0]} castShadow receiveShadow />
      <mesh geometry={leafGeo} material={leafMats[variant % 3]} position={[0, 1.95, 0]} scale={[1.3, 1.2, 1.3]} castShadow />
      <mesh geometry={leafGeo} material={leafMats[(variant + 1) % 3]} position={[0.5, 1.55, 0.22]} scale={0.8} castShadow />
    </group>
  )
}

function Pond({ x, z }) {
  const y = useMemo(() => terrainHeight(x, z), [x, z])
  return (
    <mesh position={[x, y + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[9, 48]} />
      <meshStandardMaterial
        color="#8fc7d6"
        roughness={0.15}
        metalness={0.2}
        transparent
        opacity={0.82}
      />
    </mesh>
  )
}

function Windmill({ x, z }) {
  const bladeRef = useRef()
  const y = useMemo(() => terrainHeight(x, z), [x, z])
  useFrame((_, dt) => {
    if (bladeRef.current) bladeRef.current.rotation.z += dt * 0.5
  })
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
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]} position={[0, 0, 0]}>
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

function Feature({ lm }) {
  const y = useMemo(() => terrainHeight(lm.x, lm.z), [lm])
  switch (lm.kind) {
    case 'oak':
      return (
        <group position={[lm.x, y, lm.z]}>
          <BigTree />
        </group>
      )
    case 'pond':
      return <Pond x={lm.x} z={lm.z} />
    case 'windmill':
      return <Windmill x={lm.x} z={lm.z} />
    case 'stone':
      return <SunStone x={lm.x} z={lm.z} />
    case 'grove':
      return (
        <group position={[lm.x, 0, lm.z]}>
          {Array.from({ length: 7 }).map((_, i) => {
            const a = (i / 7) * Math.PI * 2
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
    case 'hill':
    default:
      // a quiet standing stone marks the hilltop
      return (
        <mesh position={[lm.x, y + 1, lm.z]} rotation={[0.06, 0.4, 0.03]} castShadow>
          <boxGeometry args={[0.8, 2.2, 0.5]} />
          <meshStandardMaterial color="#9a938a" roughness={1} flatShading />
        </mesh>
      )
  }
}

export default function Landmarks() {
  const discoverLandmark = useStore((s) => s.discoverLandmark)

  useFrame(() => {
    const { landmark, dist } = nearestLandmark(P.pos.x, P.pos.z)
    if (!landmark) return
    place.name = dist < NEAR_RANGE ? landmark.name : ''
    if (dist < DISCOVER_RANGE) discoverLandmark(landmark.id)
  })

  return (
    <group>
      {LANDMARKS.map((lm) => (
        <Feature key={lm.id} lm={lm} />
      ))}
    </group>
  )
}
