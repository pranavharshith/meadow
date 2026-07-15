import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Select } from '@react-three/postprocessing'
import { terrainHeight } from '../../noise'
import { plazaFloorHeight } from '../../SpawnPlaza'
import { makeLeafMat } from '../../tree-assets'
import { treeRegistry } from '../../../player-state'
import { useStore } from '../../../store'
import PlantedTreeModel from './PlantedTreeModel'

const GROW_SECONDS = 90
const CUT_SECONDS = 0.85

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3)
}

function removePlantedRegistryEntries() {
  let writeIndex = 0
  for (let i = 0; i < treeRegistry.length; i++) {
    if (treeRegistry[i]._source !== 'planted') treeRegistry[writeIndex++] = treeRegistry[i]
  }
  treeRegistry.length = writeIndex
}

/** Interactive, persistent player trees kept separate from decorative woods. */
export default function PlantedTrees({ trees }) {
  const actors = useRef([])
  const cutStartedAt = useRef({})
  const cuttingId = useStore((state) => state.cuttingId)
  const selection = useStore((state) => state.selection)
  const setSelection = useStore((state) => state.setSelection)
  const flash = useStore((state) => state.flash)
  const dyeingTreeId = useStore((state) => state.dyeingTreeId)
  const previewColor = useStore((state) => state.previewColor)

  const dyeMaterials = useMemo(() => {
    const materials = {}
    for (const tree of trees) {
      const color = dyeingTreeId === tree.id && previewColor ? previewColor : tree.dye
      if (color) materials[tree.id] = makeLeafMat(color)
    }
    return materials
  }, [trees, dyeingTreeId, previewColor])

  useEffect(() => () => {
    Object.values(dyeMaterials).forEach((material) => material.dispose())
  }, [dyeMaterials])

  useEffect(() => {
    removePlantedRegistryEntries()
    const now = Date.now()
    for (const tree of trees) {
      treeRegistry.push({
        x: tree.x,
        z: tree.z,
        r: Math.max(0.6, (tree.scale || 1) * 0.42),
        placementR: Math.max(1.3, (tree.scale || 1) * 0.65),
        mature: now - tree.plantedAt >= GROW_SECONDS * 1000,
        _source: 'planted',
      })
    }
    return removePlantedRegistryEntries
  }, [trees])

  useFrame(() => {
    const now = Date.now()
    for (let i = 0; i < trees.length; i++) {
      const actor = actors.current[i]
      if (!actor) continue
      const tree = trees[i]
      const baseScale = tree.scale || 1

      if (cuttingId === tree.id) {
        if (!cutStartedAt.current[tree.id]) cutStartedAt.current[tree.id] = performance.now()
        const progress = Math.min((performance.now() - cutStartedAt.current[tree.id]) / 1000 / CUT_SECONDS, 1)
        actor.rotation.z = progress * progress * (Math.PI / 2 + 0.2)
        const shrink = progress > 0.8 ? 1 - (progress - 0.8) * 5 : 1
        actor.scale.setScalar(baseScale * Math.max(shrink, 0.001))
        continue
      }

      if (cutStartedAt.current[tree.id]) {
        delete cutStartedAt.current[tree.id]
        actor.rotation.z = 0
      }

      const ageSeconds = (now - tree.plantedAt) / 1000
      const growth = ageSeconds < GROW_SECONDS
        ? 0.1 + easeOutCubic(ageSeconds / GROW_SECONDS) * 0.9
        : 1
      actor.scale.setScalar(baseScale * growth)
    }
  })

  return (
    <group name="player-planted-trees">
      {trees.map((tree, index) => {
        const owned = !!tree.owner
        const selected = owned && selection?.kind === 'tree' && selection.id === tree.id
        const shape = tree.shape ?? 0
        const variant = tree.variant ?? 0

        const handleClick = (event) => {
          event.stopPropagation()
          if (cuttingId === tree.id) return
          if (!owned) {
            flash('this tree was planted by someone else')
            return
          }
          setSelection(selected ? null : { kind: 'tree', id: tree.id })
        }

        return (
          <group
            key={tree.id}
            position={[
              tree.x,
              plazaFloorHeight(tree.x, tree.z) ?? terrainHeight(tree.x, tree.z),
              tree.z,
            ]}
          >
            <group
              ref={(group) => { actors.current[index] = group }}
              onClick={handleClick}
              onPointerOver={owned ? () => { document.body.style.cursor = 'pointer' } : undefined}
              onPointerOut={owned ? () => { document.body.style.cursor = '' } : undefined}
            >
              <Select enabled={selected}>
                <PlantedTreeModel
                  seed={tree.seed || tree.id}
                  shape={shape}
                  variant={variant}
                  dyeMaterial={dyeMaterials[tree.id] || null}
                />
              </Select>
            </group>
          </group>
        )
      })}
    </group>
  )
}
