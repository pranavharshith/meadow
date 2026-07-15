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
          antialias: true,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
        onPointerMissed={() => {
          const state = useStore.getState()
          if (!state.placementMode && !state.isDraggingCamera) state.clearSelection()
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
