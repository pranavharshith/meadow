import * as THREE from 'three'
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

/** Warm color grade plus the gold selection outline for pickable world items. */
export default function EffectsLayer() {
  const enabled = useStore((state) => state.effects)
  if (!enabled) return null

  return (
    // multisampling={0} + disableNormalPass + 8-bit targets: avoids ANGLE
    // depth-stencil blit (GL_INVALID_OPERATION: read/write depth stencil same
    // image) that floods the console and can brick the context after too many errors.
    <EffectComposer
      multisampling={0}
      disableNormalPass
      frameBufferType={THREE.UnsignedByteType}
    >
      <HueSaturation saturation={0.03} />
      <BrightnessContrast brightness={0.008} contrast={0.02} />
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
