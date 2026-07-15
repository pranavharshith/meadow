import { useMemo } from 'react'
import { Sky } from '@react-three/drei'
import { useStore } from '../../../store'
import AtmosphericFog from './AtmosphericFog'
import DirectionalSun from './DirectionalSun'
import { createSunDirection } from './lighting-config'

/** Golden key light, restrained cool fill, sky, and distance atmosphere. */
export default function EnvironmentLayer() {
  const shadows = useStore((state) => state.shadows)
  const sunDirection = useMemo(createSunDirection, [])

  return (
    <>
      <AtmosphericFog />
      <Sky
        distance={450000}
        sunPosition={sunDirection}
        turbidity={8.5}
        rayleigh={2.4}
        mieCoefficient={0.0055}
        mieDirectionalG={0.82}
      />
      <hemisphereLight args={['#cfe0ed', '#3a4428', 0.52]} />
      <ambientLight intensity={0.07} color="#fff0d8" />
      <DirectionalSun direction={sunDirection} shadows={shadows} />
    </>
  )
}
