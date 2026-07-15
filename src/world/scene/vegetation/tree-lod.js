import * as THREE from 'three'
import {
  bushyLeafGeo,
  bushyLeafMats,
  bushyTrunkGeo,
  cherryLeafGeo,
  cherryLeafMats,
  cherryTrunkGeo,
  leafGeo,
  leafMats,
  pineLeafGeo,
  pineLeafMats,
  pineTrunkGeo,
  pineTrunkMat,
  trunkGeo,
  trunkMat,
  willowLeafGeo,
  willowLeafMats,
  willowTrunkGeo,
  willowTrunkMat,
} from '../../tree-assets'

export const TREE_LOD_DISTANCE = 76
export const TREE_LOD_BUCKETS = [
  { trunkGeometry: trunkGeo, trunkMaterial: trunkMat, leafGeometry: leafGeo, leafMaterial: leafMats[0], trunkY: 1.4, leafY: 3.35, leafScale: [1.48, 1.34, 1.48] },
  { trunkGeometry: pineTrunkGeo, trunkMaterial: pineTrunkMat, leafGeometry: pineLeafGeo, leafMaterial: pineLeafMats[0], trunkY: 1.6, leafY: 3.35, leafScale: [1.35, 1.08, 1.35] },
  { trunkGeometry: bushyTrunkGeo, trunkMaterial: trunkMat, leafGeometry: bushyLeafGeo, leafMaterial: bushyLeafMats[0], trunkY: 0.9, leafY: 2.42, leafScale: [1.28, 1.08, 1.28] },
  { trunkGeometry: willowTrunkGeo, trunkMaterial: willowTrunkMat, leafGeometry: willowLeafGeo, leafMaterial: willowLeafMats[0], trunkY: 1.9, leafY: 3.65, leafScale: [1.28, 1.34, 1.28] },
  { trunkGeometry: cherryTrunkGeo, trunkMaterial: trunkMat, leafGeometry: cherryLeafGeo, leafMaterial: cherryLeafMats[0], trunkY: 1.3, leafY: 3.05, leafScale: [1.42, 1.18, 1.42] },
]

const parent = new THREE.Object3D()
const local = new THREE.Object3D()

export function buildTreeLodMatrices(tree) {
  parent.position.set(tree.x, tree.y, tree.z)
  parent.rotation.set(tree.leanX, tree.rotation, tree.leanZ)
  parent.scale.set(tree.scale * tree.width, tree.scale * tree.height, tree.scale * tree.width)
  parent.updateMatrix()

  const bucket = TREE_LOD_BUCKETS[tree.shape] ? tree.shape : 0
  const definition = TREE_LOD_BUCKETS[bucket]

  local.position.set(0, definition.trunkY, 0)
  local.rotation.set(0, 0, 0)
  local.scale.set(1, 1, 1)
  local.updateMatrix()
  const trunkMatrix = parent.matrix.clone().multiply(local.matrix)

  local.position.set(0, definition.leafY, 0)
  local.scale.set(...definition.leafScale)
  local.updateMatrix()
  const leafMatrix = parent.matrix.clone().multiply(local.matrix)

  return { bucket, trunkMatrix, leafMatrix }
}
