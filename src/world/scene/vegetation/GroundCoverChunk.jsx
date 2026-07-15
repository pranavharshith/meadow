import * as THREE from 'three'
import { useMemo } from 'react'
import { CHUNK } from '../../chunk'
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

export default function GroundCoverChunk({ cx, cz, densityScale, segments, plots, plotSignature }) {
  const cover = useMemo(
    () => generateGroundCover(cx, cz, densityScale, plots, segments),
    [cx, cz, densityScale, segments, plots, plotSignature],
  )
  const boundingSphere = useMemo(
    () => new THREE.Sphere(
      new THREE.Vector3(cx * CHUNK + CHUNK / 2, 0, cz * CHUNK + CHUNK / 2),
      80,
    ),
    [cx, cz],
  )
  const shared = { boundingSphere }

  return (
    <group name={`forest-floor-${cx}-${cz}`}>
      <StaticInstanceBatch {...shared} name="meadow-grass" geometry={grassTuftGeometry} material={grassMaterial} instances={cover.grass} receiveShadow />
      <StaticInstanceBatch {...shared} name="wildflowers" geometry={flowerGeometry} material={flowerMaterial} instances={cover.flowers} />
      <StaticInstanceBatch {...shared} name="forest-ferns" geometry={fernGeometry} material={fernMaterial} instances={cover.ferns} receiveShadow />
      <StaticInstanceBatch {...shared} name="berry-shrubs" geometry={shrubGeometry} material={shrubMaterial} instances={cover.shrubs} castShadow receiveShadow />
      <StaticInstanceBatch {...shared} name="shrub-berries" geometry={berryGeometry} material={berryMaterial} instances={cover.berries} />
      <StaticInstanceBatch {...shared} name="leaf-litter" geometry={fallenLeafGeometry} material={leafMaterial} instances={cover.leaves} receiveShadow />
      <StaticInstanceBatch {...shared} name="fallen-twigs" geometry={twigGeometry} material={twigMaterial} instances={cover.twigs} receiveShadow />
      <StaticInstanceBatch {...shared} name="forest-pebbles" geometry={pebbleGeometry} material={pebbleMaterial} instances={cover.pebbles} castShadow receiveShadow />
      <StaticInstanceBatch {...shared} name="old-stumps" geometry={stumpGeometry} material={stumpMaterial} instances={cover.stumps} castShadow receiveShadow />
      <StaticInstanceBatch {...shared} name="stump-rings" geometry={stumpCapGeometry} material={stumpCapMaterial} instances={cover.stumpCaps} receiveShadow />
    </group>
  )
}
