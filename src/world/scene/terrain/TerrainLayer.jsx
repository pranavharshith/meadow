import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  getTerrainPlotRev,
  plotSignatureForChunk,
  syncTerrainPlots,
} from '../../noise'
import { CHUNK } from '../../chunk'
import { P, groundChunks } from '../../../player-state'
import { useStore } from '../../../store'
import { NATURE_RINGS, terrainSegmentsFor } from '../contracts/quality'
import { buildTerrainGeometry } from './terrain-geometry'
import { createTerrainMaterial } from './terrain-material'

function TerrainChunk({ cx, cz, segments, plotSignature, material }) {
  const geometry = useMemo(
    () => buildTerrainGeometry(cx, cz, segments),
    [cx, cz, segments, plotSignature],
  )

  useEffect(() => {
    const key = `${cx},${cz}`
    groundChunks.set(key, geometry)
    return () => {
      groundChunks.delete(key)
      geometry.dispose()
    }
  }, [cx, cz, geometry])

  return <mesh geometry={geometry} material={material} receiveShadow />
}

/** Streams the visible terrain window while sharing one material instance. */
export default function TerrainLayer() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const plots = useStore((state) => state.plots)
  const grassDensity = useStore((state) => state.grassDensity)
  const material = useMemo(() => createTerrainMaterial(), [])

  useEffect(() => () => material.dispose(), [material])
  useLayoutEffect(() => syncTerrainPlots(plots), [plots])

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const segments = terrainSegmentsFor(grassDensity)
  const plotRevision = getTerrainPlotRev()
  const chunks = []

  for (let dx = -NATURE_RINGS.terrain; dx <= NATURE_RINGS.terrain; dx++) {
    for (let dz = -NATURE_RINGS.terrain; dz <= NATURE_RINGS.terrain; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      const plotSignature = plotSignatureForChunk(cx, cz, CHUNK)
      chunks.push(
        <TerrainChunk
          key={`${cx},${cz},${segments},${plotRevision}`}
          cx={cx}
          cz={cz}
          segments={segments}
          plotSignature={plotSignature}
          material={material}
        />,
      )
    }
  }

  return <group name="woodland-terrain">{chunks}</group>
}
