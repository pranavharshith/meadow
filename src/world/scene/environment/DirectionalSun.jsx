import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { P } from '../../../player-state'
import { LIGHTING } from './lighting-config'

const FOLLOW_STEP_SQUARED = 0.25

/** Camera-local shadow rig: higher nearby definition without a larger map. */
export default function DirectionalSun({ direction, shadows }) {
  const light = useRef()
  const target = useRef()
  const lastFocus = useRef({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 })

  useLayoutEffect(() => {
    if (light.current && target.current) light.current.target = target.current
  }, [])

  useFrame(() => {
    if (!light.current || !target.current) return
    const dx = P.pos.x - lastFocus.current.x
    const dy = P.pos.y - lastFocus.current.y
    const dz = P.pos.z - lastFocus.current.z
    if (dx * dx + dy * dy + dz * dz < FOLLOW_STEP_SQUARED) return

    lastFocus.current = { x: P.pos.x, y: P.pos.y, z: P.pos.z }
    target.current.position.set(P.pos.x, P.pos.y + 1, P.pos.z)
    light.current.position.set(
      P.pos.x + direction.x * LIGHTING.sunDistance,
      P.pos.y + direction.y * LIGHTING.sunDistance,
      P.pos.z + direction.z * LIGHTING.sunDistance,
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
