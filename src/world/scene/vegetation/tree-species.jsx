import { generateTreeGeometries } from '../../ProceduralTree'
import {
  bushyLeafGeo,
  bushyLeafMats,
  bushyTrunkGeo,
  cherryLeafGeo,
  cherryLeafMats,
  cherryTrunkGeo,
  leafMats,
  pineLeafGeo,
  pineLeafMats,
  pineTrunkGeo,
  pineTrunkMat,
  trunkMat,
  willowLeafGeo,
  willowLeafMats,
  willowTrunkGeo,
  willowTrunkMat,
} from '../../tree-assets'

/** A small shared library of branch silhouettes keeps nearby woods varied. */
export const broadleafVariants = Array.from({ length: 7 }, (_, index) =>
  generateTreeGeometries(`decorative-woodland-${index}`),
)

function Broadleaf({ variant }) {
  const safeVariant = variant ?? 0
  const geometry = broadleafVariants[safeVariant % broadleafVariants.length]
  return (
    <>
      <mesh geometry={geometry.trunkGeo} material={trunkMat} castShadow receiveShadow />
      <mesh geometry={geometry.leafGeo} material={leafMats[safeVariant % leafMats.length]} castShadow />
    </>
  )
}

function Pine({ variant }) {
  const safeVariant = variant ?? 0
  return (
    <>
      <mesh geometry={pineTrunkGeo} material={pineTrunkMat} position={[0, 1.6, 0]} castShadow receiveShadow />
      <mesh geometry={pineLeafGeo} material={pineLeafMats[safeVariant % 3]} position={[0, 4.05, 0]} scale={[1.05, 1.15, 1.05]} castShadow />
      <mesh geometry={pineLeafGeo} material={pineLeafMats[(safeVariant + 1) % 3]} position={[0, 3.18, 0]} scale={[1.35, 0.82, 1.35]} castShadow />
      <mesh geometry={pineLeafGeo} material={pineLeafMats[(safeVariant + 2) % 3]} position={[0, 2.48, 0]} scale={[1.55, 0.62, 1.55]} castShadow />
    </>
  )
}

function Bushy({ variant }) {
  const safeVariant = variant ?? 0
  return (
    <>
      <mesh geometry={bushyTrunkGeo} material={trunkMat} position={[0, 0.9, 0]} castShadow receiveShadow />
      <mesh geometry={bushyLeafGeo} material={bushyLeafMats[safeVariant % 3]} position={[0, 2.42, 0]} scale={[1.25, 1.08, 1.25]} castShadow />
      <mesh geometry={bushyLeafGeo} material={bushyLeafMats[(safeVariant + 1) % 3]} position={[0.58, 2.1, 0.25]} scale={0.72} castShadow />
      <mesh geometry={bushyLeafGeo} material={bushyLeafMats[(safeVariant + 2) % 3]} position={[-0.48, 2.16, -0.34]} scale={0.68} castShadow />
    </>
  )
}

function Willow({ variant }) {
  const safeVariant = variant ?? 0
  return (
    <>
      <mesh geometry={willowTrunkGeo} material={willowTrunkMat} position={[0, 1.9, 0]} castShadow receiveShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[safeVariant % 3]} position={[0, 4.05, 0]} scale={[1.18, 1.1, 1.18]} castShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[(safeVariant + 1) % 3]} position={[0.78, 3.02, 0.38]} scale={[0.82, 1.28, 0.82]} rotation={[0, 0, -0.25]} castShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[(safeVariant + 2) % 3]} position={[-0.68, 3.1, -0.42]} scale={[0.78, 1.2, 0.78]} rotation={[0.16, 0, 0.24]} castShadow />
      <mesh geometry={willowLeafGeo} material={willowLeafMats[safeVariant % 3]} position={[0.12, 2.72, -0.82]} scale={[0.72, 1.12, 0.72]} castShadow />
    </>
  )
}

function Cherry({ variant }) {
  const safeVariant = variant ?? 0
  return (
    <>
      <mesh geometry={cherryTrunkGeo} material={trunkMat} position={[0, 1.3, 0]} castShadow receiveShadow />
      <mesh geometry={cherryLeafGeo} material={cherryLeafMats[safeVariant % 3]} position={[0, 3.14, 0]} scale={[1.32, 1.08, 1.32]} castShadow />
      <mesh geometry={cherryLeafGeo} material={cherryLeafMats[(safeVariant + 1) % 3]} position={[0.7, 2.62, 0.35]} scale={0.76} castShadow />
      <mesh geometry={cherryLeafGeo} material={cherryLeafMats[(safeVariant + 2) % 3]} position={[-0.62, 2.66, -0.28]} scale={0.72} castShadow />
    </>
  )
}

/** Nearby decorative tree body; world variation is applied by its parent. */
export default function DecorativeTreeSpecies({ shape = 0, variant = 0 }) {
  if (shape === 1) return <Pine variant={variant} />
  if (shape === 2) return <Bushy variant={variant} />
  if (shape === 3) return <Willow variant={variant} />
  if (shape === 4) return <Cherry variant={variant} />
  return <Broadleaf variant={variant} />
}
