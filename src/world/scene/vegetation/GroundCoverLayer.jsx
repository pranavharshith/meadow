import { useLayoutEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  getTerrainPlotRev,
  plotSignatureForChunk,
  syncTerrainPlots,
} from '../../noise'
import { CHUNK } from '../../chunk'
import { P } from '../../../player-state'
import { useStore } from '../../../store'
import { coverScaleFor, NATURE_RINGS, terrainSegmentsFor } from '../contracts/quality'
import { useAdaptiveNatureTier } from '../contracts/useAdaptiveNatureTier'
import GroundCoverChunk from './GroundCoverChunk'

/** Grass, flowers, understory, leaf litter, stones, twigs, and old stumps. */
export default function GroundCoverLayer() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const density = useStore((state) => state.grassDensity)
  const plots = useStore((state) => state.plots)
  const autoTier = useAdaptiveNatureTier(density !== 'off')

  useLayoutEffect(() => syncTerrainPlots(plots), [plots])
  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const densityScale = coverScaleFor(density, autoTier)
  if (densityScale === 0) return null

  const segments = terrainSegmentsFor(density)
  const plotRevision = getTerrainPlotRev()
  const chunks = []
  for (let dx = -NATURE_RINGS.vegetation; dx <= NATURE_RINGS.vegetation; dx++) {
    for (let dz = -NATURE_RINGS.vegetation; dz <= NATURE_RINGS.vegetation; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      const plotSignature = plotSignatureForChunk(cx, cz, CHUNK)
      chunks.push(
        <GroundCoverChunk
          key={`${cx},${cz},${densityScale},${segments},${plotRevision},${plotSignature}`}
          cx={cx}
          cz={cz}
          densityScale={densityScale}
          segments={segments}
          plots={plots}
          plotSignature={plotSignature}
        />,
      )
    }
  }

  return <group name="layered-forest-floor">{chunks}</group>
}
