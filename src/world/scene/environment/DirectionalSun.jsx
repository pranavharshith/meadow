import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { P } from '../../../player-state'
import { LIGHTING } from './lighting-config'

/** Camera-local shadow rig: higher nearby definition without a larger map. */
export default function DirectionalSun({ direction, shadows }) {
  const light = useRef()
  const target = useRef()

  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current
  }, [])

  useFrame(() => {
    if (!light.current || !target.current) return
    const focusX = P.pos.x
    const focusZ = P.pos.z
    target.current.position.set(focusX, P.pos.y + 1, focusZ)
    light.current.position.set(
      focusX + direction.x * LIGHTING.sunDistance,
      P.pos.y + direction.y * LIGHTING.sunDistance,
      focusZ + direction.z * LIGHTING.sunDistance,
    )
    target.current.updateMatrixWorld()
  })

  return (
    <>
      <object3D ref={target} />
      <directionalLight
        ref={light}
        intensity={LIGHTING.sunIntensity}
        color="#ffd5a0"
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={LIGHTING.shadowFar}
        shadow-camera-left={-LIGHTING.shadowExtent}
        shadow-camera-right={LIGHTING.shadowExtent}
        shadow-camera-top={LIGHTING.shadowExtent}
        shadow-camera-bottom={-LIGHTING.shadowExtent}
        shadow-bias={-0.00018}
        shadow-normalBias={0.035}
        shadow-radius={3}
      />
    </>
  )
}
