import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import * as THREE from 'three'
import Environment from './world/Environment'
import Terrain from './world/Terrain'
import GrassField from './world/GrassField'
import TreesField from './world/TreesField'
import Rocks from './world/Rocks'
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
  useEffect(() => {
    useStore.getState().claimDailyBonus()
  }, [])

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 4, 10], fov: 62, near: 0.1, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.05
        }}
      >
        {/* warm haze that hides the horizon so the world feels endless */}
        <fog attach="fog" args={['#e7d8b8', 90, 320]} />

        <WindClock />

        <Suspense fallback={null}>
          <Environment />
          <Terrain />
          <GrassField />
          <Rocks />
          <TreesField />
          <Landmarks />
          <Birds />
          <Butterflies />
          <Fireflies />
          <Petals />
          <Weather />
          <RemotePlayers />
        </Suspense>

        <Player />
        <CameraRig />
        <Net />
        <Effects />
      </Canvas>

      <Controls />
      <Ambience />
      <Hud />
      <LoadingFade />
    </>
  )
}
