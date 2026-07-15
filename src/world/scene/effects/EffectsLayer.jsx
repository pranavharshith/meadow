import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  SMAA,
  Vignette,
} from '@react-three/postprocessing'
import { useStore } from '../../../store'

/** Warning-free color stack; no depth-consuming passes so the composer never
 *  shares a depth texture between read/write targets (avoids the invalid
 *  glBlitFramebuffer depth-stencil blit). Grounding comes from scene lighting. */
export default function EffectsLayer() {
  const enabled = useStore((state) => state.effects)
  if (!enabled) return null

  return (
    <EffectComposer disableNormalPass multisampling={0} autoClear={false}>
      <HueSaturation saturation={0.03} />
      <BrightnessContrast brightness={0.008} contrast={0.02} />
      <Bloom
        mipmapBlur
        intensity={0.25}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.16}
      />
      <Vignette offset={0.36} darkness={0.3} />
      <SMAA />
    </EffectComposer>
  )
}
