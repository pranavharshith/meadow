import { useEffect, useRef, useState } from 'react'
import { plotSignatureForChunk } from '../../noise'
import { CHUNK } from '../../chunk'
import { treeRegistry } from '../../../player-state'
import { generateTreeChunk, proceduralTreeId, treeRegistryEntry } from './tree-generation'

function removeDecorativeRegistryEntries() {
  let writeIndex = 0
  for (let i = 0; i < treeRegistry.length; i++) {
    if (treeRegistry[i]._source !== 'decorative') treeRegistry[writeIndex++] = treeRegistry[i]
  }
  treeRegistry.length = writeIndex
}

/** Streams deterministic tree records and synchronizes gameplay colliders. */
export function useDecorativeTrees(center, plots, cutResources) {
  const chunks = useRef(new Map())
  const signatures = useRef(new Map())
  const [trees, setTrees] = useState([])

  useEffect(() => {
    let changed = false
    const activeKeys = new Set()

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const key = `${cx},${cz}`
        const signature = plotSignatureForChunk(cx, cz, CHUNK)
        activeKeys.add(key)

        if (chunks.current.has(key) && signatures.current.get(key) !== signature) {
          chunks.current.delete(key)
          changed = true
        }
        if (!chunks.current.has(key)) {
          chunks.current.set(key, generateTreeChunk(cx, cz, plots))
          signatures.current.set(key, signature)
          changed = true
        }
      }
    }

    for (const key of chunks.current.keys()) {
      if (!activeKeys.has(key)) {
        chunks.current.delete(key)
        signatures.current.delete(key)
        changed = true
      }
    }

    if (changed) {
      const next = []
      for (const chunkTrees of chunks.current.values()) next.push(...chunkTrees)
      setTrees(next)
    }
  }, [center.cx, center.cz, plots])

  useEffect(() => {
    removeDecorativeRegistryEntries()
    for (const tree of trees) {
      if (!cutResources[proceduralTreeId(tree)]) treeRegistry.push(treeRegistryEntry(tree))
    }
    return removeDecorativeRegistryEntries
  }, [trees, cutResources])

  return trees
}
