import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  Outline,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction, KernelSize } from 'postprocessing'
import { useStore } from '../../../store'

/** Restrained grounding and grade; intentionally disabled by the Effects setting. */
export default function EffectsLayer() {
  const enabled = useStore((state) => state.effects)
  if (!enabled) return null

  return (
    <EffectComposer disableNormalPass multisampling={2} autoClear={false}>
      <N8AO
        halfRes
        quality="low"
        aoRadius={1.7}
        distanceFalloff={0.75}
        intensity={0.58}
        aoSamples={8}
        denoiseSamples={4}
        denoiseRadius={8}
        color="#362f22"
      />
      <HueSaturation saturation={0.055} />
      <BrightnessContrast brightness={0.005} contrast={0.035} />
      <Bloom
        mipmapBlur
        intensity={0.34}
        luminanceThreshold={0.88}
        luminanceSmoothing={0.2}
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
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  )
}
