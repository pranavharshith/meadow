import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { CHUNK } from '../../chunk'
import { P } from '../../../player-state'
import { useStore } from '../../../store'
import DecorativeTrees from './DecorativeTrees'
import PlantedTrees from './PlantedTrees'
import { useDecorativeTrees } from './useDecorativeTrees'

/** Coordinates streamed decorative woodland and persistent planted actors. */
export default function TreeLayer() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const plantedTrees = useStore((state) => state.trees)
  const plots = useStore((state) => state.plots)
  const cutResources = useStore((state) => state.cutResources)

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const decorativeTrees = useDecorativeTrees(center, plots, cutResources)

  return (
    <group name="woodland-tree-layer">
      <DecorativeTrees trees={decorativeTrees} cutResources={cutResources} />
      <PlantedTrees trees={plantedTrees} />
    </group>
  )
}
