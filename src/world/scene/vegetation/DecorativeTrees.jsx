import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../../store'
import DecorativeTreeSpecies from './tree-species'
import { proceduralTreeId } from './tree-generation'
import { buildTreeLodMatrices, TREE_LOD_BUCKETS, TREE_LOD_DISTANCE } from './tree-lod'

const LOD_CAPACITY = 1100

export default function DecorativeTrees({ trees, cutResources }) {
  const nearRefs = useRef([])
  const trunkRefs = useRef([])
  const leafRefs = useRef([])
  const previousCamera = useRef(new THREE.Vector3(9999, 9999, 9999))
  const dirty = useRef(true)
  const cutProcedural = useStore((state) => state.cutProcedural)
  const lodMatrices = useMemo(() => trees.map(buildTreeLodMatrices), [trees])

  useEffect(() => {
    dirty.current = true
  }, [trees, cutResources])

  useFrame(({ camera }) => {
    if (trunkRefs.current.some((mesh) => !mesh) || leafRefs.current.some((mesh) => !mesh)) return
    const moved = previousCamera.current.distanceToSquared(camera.position) >= 4
    if (!moved && !dirty.current) return
    previousCamera.current.copy(camera.position)
    dirty.current = false

    const counts = new Array(TREE_LOD_BUCKETS.length).fill(0)
    const thresholdSquared = TREE_LOD_DISTANCE * TREE_LOD_DISTANCE

    for (let i = 0; i < trees.length; i++) {
      const tree = trees[i]
      const cut = !!cutResources[proceduralTreeId(tree)]
      const distanceSquared = (tree.x - camera.position.x) ** 2 + (tree.z - camera.position.z) ** 2
      const near = !cut && distanceSquared < thresholdSquared
      if (nearRefs.current[i]) nearRefs.current[i].visible = near
      if (cut || near) continue

      const matrices = lodMatrices[i]
      const index = counts[matrices.bucket]++
      trunkRefs.current[matrices.bucket].setMatrixAt(index, matrices.trunkMatrix)
      leafRefs.current[matrices.bucket].setMatrixAt(index, matrices.leafMatrix)
    }

    for (let bucket = 0; bucket < TREE_LOD_BUCKETS.length; bucket++) {
      const trunk = trunkRefs.current[bucket]
      const leaves = leafRefs.current[bucket]
      trunk.count = counts[bucket]
      leaves.count = counts[bucket]
      trunk.instanceMatrix.needsUpdate = true
      leaves.instanceMatrix.needsUpdate = true
    }
  })

  const handleClick = (tree, event) => {
    event.stopPropagation()
    cutProcedural(tree.chunkKey, tree.localId, 'tree', proceduralTreeId(tree))
  }

  return (
    <group name="decorative-woodland">
      {TREE_LOD_BUCKETS.map((bucket, index) => (
        <Fragment key={`tree-lod-${index}`}>
          <instancedMesh
            ref={(mesh) => { trunkRefs.current[index] = mesh }}
            args={[bucket.trunkGeometry, bucket.trunkMaterial, LOD_CAPACITY]}
            castShadow
            receiveShadow
            frustumCulled={false}
          />
          <instancedMesh
            ref={(mesh) => { leafRefs.current[index] = mesh }}
            args={[bucket.leafGeometry, bucket.leafMaterial, LOD_CAPACITY]}
            castShadow
            frustumCulled={false}
          />
        </Fragment>
      ))}

      {trees.map((tree, index) => {
        const id = proceduralTreeId(tree)
        if (cutResources[id]) return null
        return (
          <group
            key={id}
            ref={(group) => { nearRefs.current[index] = group }}
            position={[tree.x, tree.y, tree.z]}
            rotation={[tree.leanX, tree.rotation, tree.leanZ]}
            scale={[
              tree.scale * tree.width,
              tree.scale * tree.height,
              tree.scale * tree.width,
            ]}
            onClick={(event) => handleClick(tree, event)}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { document.body.style.cursor = '' }}
          >
            <DecorativeTreeSpecies shape={tree.shape} variant={tree.variant} />
          </group>
        )
      })}
    </group>
  )
}
