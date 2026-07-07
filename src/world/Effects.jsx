import { EffectComposer, Bloom, Vignette, Outline } from '@react-three/postprocessing'
import { BlendFunction, KernelSize } from 'postprocessing'

// Soft bloom + gentle vignette + an amber outline for whatever the player has
// selected in the world (a tree or rock they placed). The outline is driven by
// <Select enabled> wrappers up the tree; postprocessing collects those meshes
// through the enclosing <Selection> context in App.jsx.
export default function Effects() {
  return (
    <EffectComposer disableNormalPass multisampling={4} autoClear={false}>
      <Bloom
        mipmapBlur
        intensity={0.55}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.25}
      />
      <Outline
        blendFunction={BlendFunction.SCREEN}
        visibleEdgeColor={0xffcf6b}     // warm gold when the tree/rock is in view
        hiddenEdgeColor={0x8a5a1a}      // dimmer amber where it's occluded
        edgeStrength={9}
        pulseSpeed={0.5}
        blur
        kernelSize={KernelSize.SMALL}
        xRay
      />
      <Vignette offset={0.28} darkness={0.55} />
    </EffectComposer>
  )
}
