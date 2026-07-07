import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

// A soft glowing ring drawn flat on the ground under a selectable item.
// Used to indicate hover (green) and selection (gold). Rendered slightly
// above the terrain to avoid z-fighting, additive blended so it reads as
// light rather than paint.
//
// state:
//   - 'hover'    → soft green, thin, gentle pulse
//   - 'selected' → warm gold, stronger, faster pulse
export default function SelectionRing({ radius = 0.9, state = 'hover' }) {
  const meshRef = useRef()
  const matRef = useRef()

  // Ring geometry: annulus flat on XZ plane. Reused per state via useMemo.
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(radius * 0.85, radius * 1.05, 48)
    g.rotateX(-Math.PI / 2) // lay flat on ground
    return g
  }, [radius])

  const color = state === 'selected' ? '#ffcf6b' : '#9aefb0'
  const baseOpacity = state === 'selected' ? 0.75 : 0.5
  const pulseSpeed = state === 'selected' ? 4.2 : 2.6

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (matRef.current) {
      matRef.current.opacity = baseOpacity + Math.sin(t * pulseSpeed) * 0.15
    }
    if (meshRef.current) {
      const s = 1 + Math.sin(t * pulseSpeed) * 0.04
      meshRef.current.scale.set(s, 1, s)
    }
  })

  return (
    <mesh ref={meshRef} geometry={geo} position={[0, 0.06, 0]} raycast={() => null}>
      <meshBasicMaterial
        ref={matRef}
        color={color}
        transparent
        opacity={baseOpacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
