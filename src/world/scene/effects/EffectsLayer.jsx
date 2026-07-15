import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  Outline,
  SMAA,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, KernelSize } from 'postprocessing'
import { useStore } from '../../../store'

/** Warning-free color and selection stack; grounding comes from scene lighting. */
export default function EffectsLayer() {
  const enabled = useStore((state) => state.effects)
  if (!enabled) return null

  return (
    <EffectComposer disableNormalPass multisampling={0} autoClear={false}>
      <HueSaturation saturation={0.025} />
      <BrightnessContrast brightness={0.008} contrast={0.015} />
      <Bloom
        mipmapBlur
        intensity={0.25}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.16}
      />
      <Outline
        blendFunction={BlendFunction.SCREEN}
        visibleEdgeColor={0xffcf6b}
        hiddenEdgeColor={0x000000}
        edgeStrength={8}
        pulseSpeed={0.45}
        blur
        kernelSize={KernelSize.SMALL}
        xRay={false}
      />
      <Vignette offset={0.36} darkness={0.3} />
      <SMAA />
    </EffectComposer>
  )
}
