import { Suspense } from 'react'
import { Selection } from '@react-three/postprocessing'
import { useStore } from '../../store'
import Net from '../../net/Net'
import Environment from '../Environment'
import Terrain from '../Terrain'
import GrassField from '../GrassField'
import TreesField from '../TreesField'
import Rocks from '../Rocks'
import PlacedRocks from '../PlacedRocks'
import PlotList from '../Plots'
import PlacementPreview from '../PlacementPreview'
import CraftedItems from '../CraftedItems'
import Birds from '../Birds'
import Butterflies from '../Butterflies'
import Fireflies from '../Fireflies'
import Petals from '../Petals'
import Weather from '../Weather'
import Landmarks from '../Landmarks'
import Player from '../Player'
import RemotePlayers from '../RemotePlayers'
import CameraRig from '../CameraRig'
import WindClock from '../WindClock'
import Effects from '../Effects'
import NavPath from '../NavPath'
import WaterEffect from '../WaterEffect'
import Water from '../Water'

/**
 * Declarative scene composition only. Individual systems live in categorized
 * terrain, vegetation, environment, and effects modules.
 */
export default function WorldScene() {
  const particles = useStore((state) => state.particles)
  const showNavigation = useStore((state) => state.showNav)

  return (
    <>
      <WindClock />
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
        {showNavigation && <NavPath />}
        <WaterEffect />
        <Net />
        <Effects />
      </Selection>
    </>
  )
}
