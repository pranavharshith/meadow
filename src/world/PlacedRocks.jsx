import * as THREE from 'three'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { P, rockRegistry } from '../player-state'
import { useStore } from '../store'
import { Select } from '@react-three/postprocessing'
import { ROCK_GEOS, ROCK_MATS } from './rock-assets'

// Reuse the same geometry definitions as in Rocks.jsx
// (Geometry and materials now imported from rock-assets.js)

function PlacedRock({ r, owned, isSelected, baseY, isOvergrown, onClick, onOver, onOut }) {
  const breakingId = useStore((s) => s.breakingId)
  const meshRef = useRef()
  const breakStart = useRef(0)

  useFrame(() => {
    if (!meshRef.current) return
    if (breakingId === r.id) {
      if (!breakStart.current) breakStart.current = performance.now()
      const elapsed = (performance.now() - breakStart.current) / 1000
      const p = Math.min(elapsed / 0.5, 1) // 500ms duration matching store.js
      const fade = 1 - p

      // Shake vigorously and shrink to dust
      meshRef.current.scale.set(r.sx * fade, r.sy * fade, r.sz * fade)
      meshRef.current.position.x = (Math.random() - 0.5) * 0.3 * fade
      meshRef.current.position.z = (Math.random() - 0.5) * 0.3 * fade
    } else {
      if (breakStart.current) {
        breakStart.current = 0
        meshRef.current.scale.set(r.sx, r.sy, r.sz)
        meshRef.current.position.set(0, r.sy - 0.05, 0)
      }
    }
  })

  return (
    <group position={[r.x, baseY, r.z]}>
      <Select enabled={isSelected}>
        <mesh
          ref={meshRef}
          geometry={ROCK_GEOS[r.rockShape ?? 2]}
          material={ROCK_MATS[r.matIdx ?? 0]}
          position={[0, r.sy - 0.05, 0]}
          rotation={[0, r.rot, 0]}
          scale={[r.sx, r.sy, r.sz]}
          castShadow
          receiveShadow
          onPointerOver={onOver}
          onPointerOut={onOut}
          onClick={onClick}
        />
      </Select>
      {isOvergrown && (
        <mesh position={[0, r.sy, 0]}>
          <sphereGeometry args={[Math.max(r.sx, r.sz) * 1.5, 16, 16]} />
          <meshBasicMaterial color="#a3ff80" transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

export default function PlacedRocks() {
  const placedRocks = useStore((s) => s.placedRocks)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)
  const flash = useStore((s) => s.flash)
  const breakingId = useStore((s) => s.breakingId)

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
        const ageDays = (Date.now() - (r.placedAt || Date.now())) / (1000 * 60 * 60 * 24)
        const isOvergrown = ageDays >= 2
        const owned = !!r.owner
        const canSelect = owned || isOvergrown
        const isSelected = canSelect && selection && selection.kind === 'rock' && selection.id === r.id
        // Use plaza floor height inside the Meadow Gate so placed rocks
        // sit on the raised stone surface, not the raw terrain below (fix #5)
        const baseY = plazaFloorHeight(r.x, r.z) ?? terrainHeight(r.x, r.z)
        const onOver = canSelect
          ? () => { document.body.style.cursor = 'pointer' }
          : undefined
        const onOut = canSelect
          ? () => { document.body.style.cursor = '' }
          : undefined
        const onClick = (e) => {
          e.stopPropagation()
          if (breakingId === r.id) return
          if (!canSelect) {
            flash('this rock was placed by someone else')
            return
          }
          if (isSelected) setSelection(null)
          else setSelection({ kind: 'rock', id: r.id })
        }
        return (
          <PlacedRock
            key={r.id}
            r={r}
            owned={owned}
            isSelected={isSelected}
            baseY={baseY}
            isOvergrown={isOvergrown}
            onClick={onClick}
            onOver={onOver}
            onOut={onOut}
          />
        )
      })}
    </group>
  )
}
