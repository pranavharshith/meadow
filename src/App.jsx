import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import * as THREE from 'three'
import WorldScene from './world/scene/WorldScene'
import Controls from './Controls'
import Ambience from './Ambience'
import Hud from './ui/Hud'
import WelcomeScreen from './ui/WelcomeScreen'
import { useStore } from './store'
import { pointer } from './player-state'
import { setRendererApi } from './world/renderer-api'

// Fades the warm haze out once the scene is ready, then unmounts completely.
function LoadingFade() {
  const { active } = useProgress()
  const [phase, setPhase] = useState('loading')

  useEffect(() => {
    if (!active && phase === 'loading') {
      const id = setTimeout(() => setPhase('fading'), 250)
      return () => clearTimeout(id)
    }
  }, [active, phase])

  useEffect(() => {
    if (phase !== 'fading') return
    const id = setTimeout(() => setPhase('done'), 1500)
    return () => clearTimeout(id)
  }, [phase])

  if (phase === 'done') return null
  return <div className={`fade${phase === 'fading' ? ' gone' : ''}`} aria-hidden="true" />
}

export default function App() {
  const shadows = useStore((state) => state.shadows)

  return (
    <>
      <Canvas
        onPointerDown={(event) => {
          if (event.target.tagName === 'CANVAS') document.activeElement?.blur()
        }}
        shadows={shadows}
        dpr={[1, 1.75]}
        camera={{ position: [0, 4, 10], fov: 62, near: 0.1, far: 600 }}
        gl={{
          // No MSAA + no preserveDrawingBuffer: both force depth-stencil resolves
          // that ANGLE rejects ("read and write depth stencil ... same image").
          // SMAA in the effect stack anti-aliases; screenshots force one render
          // via renderer-api before readback instead of preserving the buffer.
          antialias: false,
          stencil: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
          setRendererApi({ gl, scene, camera })
        }}
        onPointerMissed={() => {
          // Ignore the click that ends a camera drag.
          if (pointer.moved) return
          const state = useStore.getState()
          // While placing, a click on open ground (or the ghost) drops the
          // object where people instinctively expect — the key and button
          // still work too. Otherwise an empty click clears the selection.
          if (state.placementMode) state.confirmPlacement()
          else state.clearSelection()
        }}
      >
        <WorldScene />
      </Canvas>

      <Controls />
      <Ambience />
      <Hud />
      <WelcomeScreen />
      <LoadingFade />
    </>
  )
}
