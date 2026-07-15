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
import { coverDetailFor, NATURE_RINGS, terrainSegmentsFor } from '../contracts/quality'
import { useAdaptiveNatureTier } from '../contracts/useAdaptiveNatureTier'
import GroundCoverChunk from './GroundCoverChunk'

/** Streams layered meadow grass around the player with a lower-cost outer ring. */
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

  const detail = coverDetailFor(density, autoTier)
  if (detail.near === 0) return null

  const segments = terrainSegmentsFor(density)
  const detailKey = `${detail.near},${detail.mid},${detail.tall},${detail.flowers},${detail.forest}`
  const plotRevision = getTerrainPlotRev()
  const chunks = []

  for (let dx = -NATURE_RINGS.vegetation; dx <= NATURE_RINGS.vegetation; dx++) {
    for (let dz = -NATURE_RINGS.vegetation; dz <= NATURE_RINGS.vegetation; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      const plotSignature = plotSignatureForChunk(cx, cz, CHUNK)
      const isNearChunk = dx === 0 && dz === 0
      const chunkDetail = isNearChunk
        ? {
            short: detail.near,
            meadow: detail.near,
            tall: detail.tall,
            flowers: detail.flowers,
            forest: detail.forest,
          }
        : {
            short: detail.mid,
            meadow: detail.mid * 0.62,
            tall: detail.tall * 0.22,
            flowers: detail.flowers * 0.2,
            forest: detail.forest * 0.5,
          }

      chunks.push(
        <GroundCoverChunk
          key={`${cx},${cz},${detailKey},${isNearChunk},${segments},${plotRevision},${plotSignature}`}
          cx={cx}
          cz={cz}
          detail={chunkDetail}
          segments={segments}
          plots={plots}
          plotSignature={plotSignature}
        />,
      )
    }
  }

  return <group name="layered-grassland">{chunks}</group>
}
