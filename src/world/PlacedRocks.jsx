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
  const [hoveredId, setHoveredId] = useState(null)

  // Sync placed rocks into registry for collision
  useEffect(() => {
    // Keep decorative rocks already in rockRegistry and add placed ones
    // Placed rocks are appended — we tag them with placed:true so we can remove them cleanly
    const filtered = rockRegistry.filter((r) => !r.placed)
    rockRegistry.length = 0
    for (const r of filtered) rockRegistry.push(r)
    for (const r of placedRocks) {
      rockRegistry.push({ x: r.x, z: r.z, r: 0.9, placed: true })
    }
  }, [placedRocks])

  return (
    <group>
      {placedRocks.map((r) => {
        const isSelected = selection && selection.kind === 'rock' && selection.id === r.id
        const isHovered = hoveredId === r.id && !isSelected
        const baseY = terrainHeight(r.x, r.z)
        const hoverBump = isHovered ? 1.05 : 1
        return (
          <group key={r.id} position={[r.x, baseY, r.z]} scale={hoverBump}>
            <Select enabled={isSelected}>
              <mesh
                geometry={PLACED_GEOS[r.rockShape ?? 2]}
                material={PLACED_MATS[r.matIdx ?? 0]}
                position={[0, -0.15, 0]}
                rotation={[0, r.rot, 0]}
                scale={[r.sx, r.sy, r.sz]}
                castShadow
                receiveShadow
                onPointerOver={(e) => { e.stopPropagation(); setHoveredId(r.id); document.body.style.cursor = 'pointer' }}
                onPointerOut={(e) => { e.stopPropagation(); setHoveredId((id) => (id === r.id ? null : id)); document.body.style.cursor = '' }}
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
