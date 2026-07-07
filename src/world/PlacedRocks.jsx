import * as THREE from 'three'
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { P, rockRegistry } from '../player-state'
import { useStore } from '../store'
import { makeMossyMaterial } from './mossy-material'
import { Select } from '@react-three/postprocessing'

// Reuse the same geometry definitions as in Rocks.jsx
const boulderGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(1, 0.5, 1)
  return g
})()

const standingGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(0.6, 1.4, 0.6)
  return g
})()

const roundGeo = new THREE.DodecahedronGeometry(1, 0)

const PLACED_GEOS = [boulderGeo, standingGeo, roundGeo]

const PLACED_MATS = [
  makeMossyMaterial({ base: '#8d8b83' }),
  makeMossyMaterial({ base: '#7a7870' }),
  makeMossyMaterial({ base: '#9a9488' }),
]

export default function PlacedRocks() {
  const placedRocks = useStore((s) => s.placedRocks)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)

  // Sync placed rocks into rockRegistry for collision.
  // Uses _source: 'placed' tag so Rocks.jsx's effect doesn't clobber
  // these entries regardless of execution order.
  useEffect(() => {
    for (let i = rockRegistry.length - 1; i >= 0; i--) {
      if (rockRegistry[i]._source === 'placed') rockRegistry.splice(i, 1)
    }
    for (const r of placedRocks) {
      // r          — physics radius (fixed so player can still walk around)
      // placementR — actual visual extent so the ghost can't overlap it
      rockRegistry.push({
        x: r.x, z: r.z,
        r: 0.9,
        placementR: Math.max(r.sx, r.sz),
        _source: 'placed',
      })
    }
  }, [placedRocks])

  return (
    <group>
      {placedRocks.map((r) => {
        const isSelected = selection && selection.kind === 'rock' && selection.id === r.id
        const baseY = terrainHeight(r.x, r.z)
        return (
          <group key={r.id} position={[r.x, baseY, r.z]}>
            <Select enabled={isSelected}>
              <mesh
                geometry={PLACED_GEOS[r.rockShape ?? 2]}
                material={PLACED_MATS[r.matIdx ?? 0]}
                // Rock geometry is a unit dodecahedron (radius 1). After
                // scaling by [sx, sy, sz] it spans ±sy vertically around its
                // center, so `sy - 0.05` sits the rock ON the ground with a
                // tiny embed. No hover bump — feedback is cursor + outline.
                position={[0, r.sy - 0.05, 0]}
                rotation={[0, r.rot, 0]}
                scale={[r.sx, r.sy, r.sz]}
                castShadow
                receiveShadow
                onPointerOver={() => { document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = '' }}
                onClick={(e) => {
                  e.stopPropagation()
                  // Toggle: clicking the selected rock again deselects it.
                  if (isSelected) setSelection(null)
                  else setSelection({ kind: 'rock', id: r.id })
                }}
              />
            </Select>
          </group>
        )
      })}
    </group>
  )
}
