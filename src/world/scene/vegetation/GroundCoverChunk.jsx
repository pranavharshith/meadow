import { useMemo } from 'react'
import { generateGroundCover } from './ground-cover-distribution'
import StaticInstanceBatch from './StaticInstanceBatch'
import {
  berryGeometry,
  berryMaterial,
  fallenLeafGeometry,
  fernGeometry,
  fernMaterial,
  flowerGeometry,
  flowerMaterial,
  grassMaterial,
  grassTuftGeometry,
  leafMaterial,
  pebbleGeometry,
  pebbleMaterial,
  shrubGeometry,
  shrubMaterial,
  stumpCapGeometry,
  stumpCapMaterial,
  stumpGeometry,
  stumpMaterial,
  twigGeometry,
  twigMaterial,
} from './ground-cover-assets'

export default function GroundCoverChunk({ cx, cz, densityScale, plots, plotSignature }) {
  const cover = useMemo(
    () => generateGroundCover(cx, cz, densityScale, plots),
    [cx, cz, densityScale, plots, plotSignature],
  )

  return (
    <group name={`forest-floor-${cx}-${cz}`}>
      <StaticInstanceBatch name="meadow-grass" geometry={grassTuftGeometry} material={grassMaterial} instances={cover.grass} receiveShadow />
      <StaticInstanceBatch name="wildflowers" geometry={flowerGeometry} material={flowerMaterial} instances={cover.flowers} />
      <StaticInstanceBatch name="forest-ferns" geometry={fernGeometry} material={fernMaterial} instances={cover.ferns} receiveShadow />
      <StaticInstanceBatch name="berry-shrubs" geometry={shrubGeometry} material={shrubMaterial} instances={cover.shrubs} castShadow receiveShadow />
      <StaticInstanceBatch name="shrub-berries" geometry={berryGeometry} material={berryMaterial} instances={cover.berries} castShadow />
      <StaticInstanceBatch name="leaf-litter" geometry={fallenLeafGeometry} material={leafMaterial} instances={cover.leaves} receiveShadow />
      <StaticInstanceBatch name="fallen-twigs" geometry={twigGeometry} material={twigMaterial} instances={cover.twigs} castShadow receiveShadow />
      <StaticInstanceBatch name="forest-pebbles" geometry={pebbleGeometry} material={pebbleMaterial} instances={cover.pebbles} castShadow receiveShadow />
      <StaticInstanceBatch name="old-stumps" geometry={stumpGeometry} material={stumpMaterial} instances={cover.stumps} castShadow receiveShadow />
      <StaticInstanceBatch name="stump-rings" geometry={stumpCapGeometry} material={stumpCapMaterial} instances={cover.stumpCaps} receiveShadow />
    </group>
  )
}
