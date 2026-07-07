import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

// Soft bloom for the warm highlights + a gentle vignette to focus the frame.
export default function Effects() {
  return (
    <EffectComposer disableNormalPass multisampling={4}>
      <Bloom
        mipmapBlur
        intensity={0.55}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.25}
      />
      <Vignette offset={0.28} darkness={0.55} />
    </EffectComposer>
  )
}
