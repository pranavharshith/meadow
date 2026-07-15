/**
 * LEGACY SCENE REFERENCE — LIGHTING (archived 2026-07-15)
 * Superseded by the modular scene/environment implementation. Keep for visual
 * comparison and migration history; this file is intentionally not imported.
 */
import * as THREE from 'three'
import { useMemo } from 'react'
import { Sky } from '@react-three/drei'

// Golden hour, ~5-6pm: sun low on the horizon (long warm light), not a full
// orange sunset. The directional light shares the sun direction so shadows
// match the sky.
export default function Environment() {
  const sun = useMemo(() => {
    const elevation = 7 // degrees above horizon -> long soft light
    const azimuth = 165
    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    return new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
  }, [])

  return (
    <>
      <Sky
        sunPosition={sun}
        turbidity={9}
        rayleigh={2.2}
        mieCoefficient={0.006}
        mieDirectionalG={0.85}
      />

      <hemisphereLight args={['#ffe6c2', '#4a5a2e', 0.7]} />
      <ambientLight intensity={0.14} color="#fff2df" />

      <directionalLight
        position={[sun.x * 120, sun.y * 120, sun.z * 120]}
        intensity={2.4}
        color="#ffd39a"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={320}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-bias={-0.0005}
      />
    </>
  )
}
