import { Fragment, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Select } from '@react-three/postprocessing'
import { pointer } from '../../../player-state'
import { useStore } from '../../../store'
import DecorativeTreeSpecies from './tree-species'
import { proceduralTreeId } from './tree-generation'
import { buildTreeLodMatrices, TREE_LOD_BUCKETS, TREE_LOD_DISTANCE } from './tree-lod'

const LOD_CAPACITY = 1100
const LOD_UPDATE_DISTANCE_SQUARED = 16

export default function DecorativeTrees({ trees, cutResources }) {
  const nearRefs = useRef([])
  const trunkRefs = useRef([])
  const leafRefs = useRef([])
  // Maps a live instanced-trunk slot back to its tree so distant trees stay
  // pickable even though they share one batched draw call.
  const bucketTrees = useRef([])
  const previousCamera = useRef(new THREE.Vector3(9999, 9999, 9999))
  const dirty = useRef(true)
  const selection = useStore((state) => state.selection)
  const setSelection = useStore((state) => state.setSelection)
  const lodMatrices = useMemo(() => trees.map(buildTreeLodMatrices), [trees])

  useEffect(() => {
    dirty.current = true
  }, [trees, cutResources])

  useFrame(({ camera }) => {
    const missingBatch = TREE_LOD_BUCKETS.some(
      (_, index) => !trunkRefs.current[index] || !leafRefs.current[index],
    )
    if (missingBatch) return

    const moved = previousCamera.current.distanceToSquared(camera.position) >= LOD_UPDATE_DISTANCE_SQUARED
    if (!moved && !dirty.current) return
    previousCamera.current.copy(camera.position)
    dirty.current = false

    const counts = new Array(TREE_LOD_BUCKETS.length).fill(0)
    const trail = bucketTrees.current
    for (let bucket = 0; bucket < TREE_LOD_BUCKETS.length; bucket++) {
      if (!trail[bucket]) trail[bucket] = []
    }
    const thresholdSquared = TREE_LOD_DISTANCE * TREE_LOD_DISTANCE

    for (let index = 0; index < trees.length; index++) {
      const tree = trees[index]
      const cut = !!cutResources[proceduralTreeId(tree)]
      const distanceSquared = (tree.x - camera.position.x) ** 2 + (tree.z - camera.position.z) ** 2
      const near = !cut && distanceSquared < thresholdSquared
      if (nearRefs.current[index]) nearRefs.current[index].visible = near
      if (cut || near) continue

      const matrices = lodMatrices[index]
      const instanceIndex = counts[matrices.bucket]++
      trunkRefs.current[matrices.bucket].setMatrixAt(instanceIndex, matrices.trunkMatrix)
      leafRefs.current[matrices.bucket].setMatrixAt(instanceIndex, matrices.leafMatrix)
      trail[matrices.bucket][instanceIndex] = tree
    }

    for (let bucket = 0; bucket < TREE_LOD_BUCKETS.length; bucket++) {
      const trunk = trunkRefs.current[bucket]
      const leaves = leafRefs.current[bucket]
      trunk.count = counts[bucket]
      leaves.count = counts[bucket]
      trunk.instanceMatrix.needsUpdate = true
      leaves.instanceMatrix.needsUpdate = true
      trail[bucket].length = counts[bucket]
    }
  })

  // Clicking a wild tree selects it (soft gold outline when near); pressing X
  // then harvests it — the same calm rhythm as planted trees. A click that was
  // really a camera drag is ignored.
  const toggleSelect = (tree) => {
    if (pointer.moved || !tree.harvestable) return
    const id = proceduralTreeId(tree)
    const current = useStore.getState().selection
    const already = current && current.kind === 'procedural' && current.id === id
    setSelection(already ? null : {
      kind: 'procedural',
      id,
      chunkKey: tree.chunkKey,
      localId: tree.localId,
      resourceKind: 'tree',
    })
  }

  const handleNearClick = (tree, event) => {
    event.stopPropagation()
    toggleSelect(tree)
  }

  const handleFarClick = (bucket, event) => {
    event.stopPropagation()
    if (pointer.moved) return
    const tree = bucketTrees.current[bucket]?.[event.instanceId]
    if (tree) toggleSelect(tree)
  }

  return (
    <group name="decorative-woodland">
      {TREE_LOD_BUCKETS.map((bucket, index) => (
        <Fragment key={`tree-lod-${index}`}>
          {/* Far trees provide silhouette and color only. Excluding them from
              shadow maps prevents a dark, uniform carpet across the meadow.
              Picking is attached to the low-poly trunk (not the leaf batch) so
              distant trees stay selectable without heavy per-frame raycasts. */}
          <instancedMesh
            ref={(mesh) => { trunkRefs.current[index] = mesh }}
            args={[bucket.trunkGeometry, bucket.trunkMaterial, LOD_CAPACITY]}
            frustumCulled={false}
            onClick={(event) => handleFarClick(index, event)}
          />
          <instancedMesh
            ref={(mesh) => { leafRefs.current[index] = mesh }}
            args={[bucket.leafGeometry, bucket.leafMaterial, LOD_CAPACITY]}
            frustumCulled={false}
          />
        </Fragment>
      ))}

      {trees.map((tree, index) => {
        const id = proceduralTreeId(tree)
        if (cutResources[id]) return null
        const selected = selection && selection.kind === 'procedural' && selection.id === id
        // Only the harvestable subset reacts to clicks; the dense decorative
        // canopy is scenery and stays non-interactive.
        const interactive = tree.harvestable
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
            onClick={interactive ? (event) => handleNearClick(tree, event) : undefined}
            onPointerOver={interactive ? () => { document.body.style.cursor = 'pointer' } : undefined}
            onPointerOut={interactive ? () => { document.body.style.cursor = '' } : undefined}
          >
            <Select enabled={!!selected}>
              <DecorativeTreeSpecies shape={tree.shape} variant={tree.variant} />
            </Select>
          </group>
        )
      })}
    </group>
  )
}
