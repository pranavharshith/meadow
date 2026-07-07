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
import NavPath from './world/NavPath'
import WaterEffect from './world/WaterEffect'
import Water from './world/Water'
import { useStore } from './store'

// Fades the warm-haze overlay out once the scene is ready, for a soft entrance.
function LoadingFade() {
  const { active } = useProgress()
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!active) {
      const id = setTimeout(() => setGone(true), 250)
      return () => clearTimeout(id)
    }
  }, [active])
  return <div className={`fade${gone ? ' gone' : ''}`} />
}

export default function App() {
  const shadows = useStore((s) => s.shadows)
  const particles = useStore((s) => s.particles)

  // Claim the daily bonus once we know whether we're online (server-truthed)
  // or offline (localStorage-tracked). Firing after `online` flips avoids a
  // race where the offline path awards +10 then the server also awards +10.
  const online = useStore((s) => s.online)
  useEffect(() => {
    const t = setTimeout(() => useStore.getState().claimDailyBonus(), 800)
    return () => clearTimeout(t)
  }, [online])

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 4, 10], fov: 62, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
        // Clicking any non-interactive object (terrain, sky, empty space)
        // deselects the currently-picked tree/rock. Clicking a tree/rock
        // stops propagation so this handler only fires for empty clicks.
        onPointerMissed={() => useStore.getState().clearSelection()}
      >
        {/* warm haze that hides the horizon so the world feels endless */}
        <fog attach="fog" args={['#e7d8b8', 90, 320]} />

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
            <TreesField />
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
      <LoadingFade />
    </>
  )
}
