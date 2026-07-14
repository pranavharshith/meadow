import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { Selection } from '@react-three/postprocessing'
import * as THREE from 'three'
import Environment from './world/Environment'
import Terrain from './world/Terrain'
import GrassField from './world/GrassField'
import TreesField from './world/TreesField'
import Rocks from './world/Rocks'
import PlacedRocks from './world/PlacedRocks'
import PlotList from './world/Plots'
import PlacementPreview from './world/PlacementPreview'
import CraftedItems from './world/CraftedItems'
import Birds from './world/Birds'
import Butterflies from './world/Butterflies'
import Fireflies from './world/Fireflies'
import Petals from './world/Petals'
import Weather from './world/Weather'
import Landmarks from './world/Landmarks'
import Player from './world/Player'
import RemotePlayers from './world/RemotePlayers'
import CameraRig from './world/CameraRig'
import WindClock from './world/WindClock'
import Effects from './world/Effects'
import Controls from './Controls'
import Ambience from './Ambience'
import Net from './net/Net'
import Hud from './ui/Hud'
import WelcomeScreen from './ui/WelcomeScreen'
import NavPath from './world/NavPath'
import WaterEffect from './world/WaterEffect'
import Water from './world/Water'
import { useStore } from './store'

// Fades the warm-haze overlay out once the scene is ready, for a soft entrance.
// After the fade finishes we unmount so it can never intercept pointer events.
function LoadingFade() {
  const { active } = useProgress()
  const [phase, setPhase] = useState('loading') // loading | fading | done

  useEffect(() => {
    if (!active && phase === 'loading') {
      const id = setTimeout(() => setPhase('fading'), 250)
      return () => clearTimeout(id)
    }
  }, [active, phase])

  useEffect(() => {
    if (phase !== 'fading') return
    const id = setTimeout(() => setPhase('done'), 1500) // match CSS fade duration + buffer
    return () => clearTimeout(id)
  }, [phase])

  if (phase === 'done') return null

  return (
    <div
      className={`fade${phase === 'fading' ? ' gone' : ''}`}
      aria-hidden="true"
      // Always non-interactive; gone only affects opacity
    />
  )
}

export default function App() {
  const shadows = useStore((s) => s.shadows)
  const showNav = useStore((s) => s.showNav)
  const particles = useStore((s) => s.particles)
  const viewMode = useStore((s) => s.viewMode)

  // Daily bonus is handled in Net.jsx where the definitive online/offline
  // state is known. Nothing to do here.

  return (
    <>
      <Canvas
        onPointerDown={(e) => {
          if (e.target.tagName === 'CANVAS') document.activeElement?.blur()
        }}
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 4, 10], fov: 62, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
        // Clicking any non-interactive object (terrain, sky, empty space)
        // deselects the currently-picked tree/rock. During placement mode
        // we skip this so the ghost isn't interrupted by casual clicks.
        onPointerMissed={() => {
          const st = useStore.getState()
          if (!st.placementMode && !st.isDraggingCamera) st.clearSelection()
        }}
      >
        {/* warm haze that hides the horizon so the world feels endless.
            Pushed out during map view so it doesn't cloud up the camera looking straight down. */}
        <fog attach="fog" args={['#e7d8b8', viewMode === 'top' ? 250 : 90, viewMode === 'top' ? 600 : 320]} />

        <WindClock />

        {/* <Selection> gives postprocessing's Outline effect a place to
            collect selected meshes. Any <Select enabled> inside this tree
            (see TreesField/PlacedRocks) opts its meshes into the outline. */}
        <Selection>
          <Suspense fallback={null}>
            <Environment />
            <Terrain />
            <GrassField />
            <Rocks />
            <PlacedRocks />
            <Suspense fallback={null}>
              <PlotList />
            </Suspense>
            <TreesField />
            <CraftedItems />
            <PlacementPreview />
            <Water />
            <Landmarks />
            {particles && <Birds />}
            {particles && <Butterflies />}
            <Fireflies />
            {particles && <Petals />}
            <Weather />
            <RemotePlayers />
          </Suspense>

          <Player />
          <CameraRig />
          <NavPath />
          <WaterEffect />
          <Net />
          <Effects />
        </Selection>
      </Canvas>

      <Controls />
      <Ambience />
      <Hud />
      <WelcomeScreen />
      <LoadingFade />
    </>
  )
}
