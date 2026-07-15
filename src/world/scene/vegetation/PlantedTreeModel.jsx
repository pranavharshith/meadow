import { useEffect, useMemo, useState } from 'react'
import { generateTreeGeometries } from '../../ProceduralTree'
import {
  bushyLeafMats,
  cherryLeafMats,
  goldenLeafMat,
  goldenTrunkMat,
  leafMats,
  mushroomCapGeo,
  mushroomCapMat,
  mushroomStemGeo,
  mushroomStemMat,
  pineLeafMats,
  pineTrunkMat,
  starLeafMat,
  starTrunkMat,
  trunkMat,
  willowLeafMats,
  willowTrunkMat,
} from '../../tree-assets'

export default function PlantedTreeModel({ seed, shape = 0, variant = 0, dyeMaterial }) {
  const [geometry] = useState(() => generateTreeGeometries(seed))
  useEffect(() => () => {
    geometry.trunkGeo.dispose()
    geometry.leafGeo.dispose()
  }, [geometry])

  const appearance = useMemo(() => {
    let trunk = trunkMat
    let leaves = dyeMaterial || leafMats[variant % leafMats.length]
    let glow = null
    if (shape === 1) {
      trunk = pineTrunkMat
      leaves = dyeMaterial || pineLeafMats[variant % pineLeafMats.length]
    } else if (shape === 2) {
      leaves = dyeMaterial || bushyLeafMats[variant % bushyLeafMats.length]
    } else if (shape === 3) {
      trunk = willowTrunkMat
      leaves = dyeMaterial || willowLeafMats[variant % willowLeafMats.length]
    } else if (shape === 4) {
      leaves = dyeMaterial || cherryLeafMats[variant % cherryLeafMats.length]
    } else if (shape === 10) {
      trunk = goldenTrunkMat
      leaves = dyeMaterial || goldenLeafMat
      glow = dyeMaterial?.color || goldenLeafMat.color
    } else if (shape === 11) {
      trunk = starTrunkMat
      leaves = dyeMaterial || starLeafMat
      glow = dyeMaterial?.color || starLeafMat.color
    }
    return { trunk, leaves, glow }
  }, [shape, variant, dyeMaterial])

  if (shape === 5) {
    return (
      <>
        <mesh geometry={mushroomStemGeo} material={mushroomStemMat} position={[0, 0.4, 0]} castShadow receiveShadow />
        <mesh geometry={mushroomCapGeo} material={dyeMaterial || mushroomCapMat} position={[0, 0.9, 0]} castShadow />
      </>
    )
  }

  return (
    <>
      <mesh geometry={geometry.trunkGeo} material={appearance.trunk} castShadow receiveShadow />
      <mesh geometry={geometry.leafGeo} material={appearance.leaves} castShadow />
      {appearance.glow && <pointLight color={appearance.glow} intensity={1.5} distance={9} position={[0, 3.5, 0]} />}
    </>
  )
}
