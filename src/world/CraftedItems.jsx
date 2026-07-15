import * as THREE from 'three'
import { useStore } from '../store'
import { P, craftedRegistry, pointer } from '../player-state'
import { useEffect, useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { Select } from '@react-three/postprocessing'
import { Text } from '@react-three/drei'

// Crafted Items meshes.
// We'll create basic shapes for the crafted items for now.

const woodMat = new THREE.MeshStandardMaterial({ color: '#5C4033', roughness: 0.9 })
const stoneMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8 })
const lightMat = new THREE.MeshStandardMaterial({ color: '#fffb96', emissive: '#fffb96', emissiveIntensity: 1 })

function WoodenFence() {
  return (
    <group>
      <mesh material={woodMat} position={[-0.4, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.8, 0.1]} />
      </mesh>
      <mesh material={woodMat} position={[0.4, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.8, 0.1]} />
      </mesh>
      <mesh material={woodMat} position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.08, 0.05]} />
      </mesh>
      <mesh material={woodMat} position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.08, 0.05]} />
      </mesh>
    </group>
  )
}

function WoodenBench() {
  return (
    <group>
      <mesh material={woodMat} position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.1, 0.4]} />
      </mesh>
      <mesh material={woodMat} position={[-0.5, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.3, 0.3]} />
      </mesh>
      <mesh material={woodMat} position={[0.5, 0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.3, 0.3]} />
      </mesh>
    </group>
  )
}

function StoneLantern() {
  return (
    <group>
      <mesh material={stoneMat} position={[0, 0.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.8]} />
      </mesh>
      <mesh material={lightMat} position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[0.25, 0.25, 0.25]} />
      </mesh>
      <mesh material={stoneMat} position={[0, 1.1, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.3, 0.3, 4]} />
      </mesh>
      <pointLight color="#fffb96" intensity={1} distance={8} position={[0, 0.9, 0]} />
    </group>
  )
}

function StonePath() {
  return (
    <mesh material={stoneMat} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[1.0, 1.0]} />
    </mesh>
  )
}

function WoodenSign() {
  return (
    <group>
      <mesh material={woodMat} position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 1]} />
      </mesh>
      <mesh material={woodMat} position={[0, 0.8, 0.1]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.3, 0.05]} />
      </mesh>
      <Text position={[0, 0.8, 0.13]} fontSize={0.15} color="black" anchorX="center" anchorY="middle">
        Hello
      </Text>
    </group>
  )
}

export function CraftedItemParts({ itemId, material }) {
  if (material) {
    // If material is provided (for ghosts), use simplified proxy geometry
    if (itemId === 'fence_wood') return <mesh position={[0, 0.4, 0]} material={material}><boxGeometry args={[1.0, 0.8, 0.1]} /></mesh>
    if (itemId === 'bench_wood') return <mesh position={[0, 0.3, 0]} material={material}><boxGeometry args={[1.2, 0.5, 0.4]} /></mesh>
    if (itemId === 'lantern_stone') return <mesh position={[0, 0.6, 0]} material={material}><cylinderGeometry args={[0.2, 0.2, 1.2]} /></mesh>
    if (itemId === 'path_stone') return <mesh position={[0, 0.02, 0]} material={material}><boxGeometry args={[1.0, 0.05, 1.0]} /></mesh>
    if (itemId === 'sign_wood') return <mesh position={[0, 0.5, 0]} material={material}><boxGeometry args={[0.8, 1.0, 0.1]} /></mesh>
  }
  
  switch (itemId) {
    case 'fence_wood': return <WoodenFence />
    case 'bench_wood': return <WoodenBench />
    case 'lantern_stone': return <StoneLantern />
    case 'path_stone': return <StonePath />
    case 'sign_wood': return <WoodenSign />
    default: return null
  }
}

export default function CraftedItems() {
  const items = useStore((s) => s.craftedItems)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)
  const flash = useStore((s) => s.flash)

  // Sync to a local registry for placement collision checks
  useEffect(() => {
    craftedRegistry.length = 0
    for (const item of items) {
      let r = 0.5
      if (item.itemId === 'bench_wood') r = 0.8
      if (item.itemId === 'fence_wood') r = 0.6
      if (item.itemId === 'path_stone') r = 0.6
      
      craftedRegistry.push({
        x: item.x,
        z: item.z,
        r: r,
        placementR: r
      })
    }
  }, [items])

  return (
    <group>
      {items.map((item) => {
        const owned = !!item.owner
        const isSelected = owned && selection && selection.kind === 'crafted' && selection.id === item.id
        
        const py = plazaFloorHeight(item.x, item.z) !== null 
          ? plazaFloorHeight(item.x, item.z) 
          : terrainHeight(item.x, item.z)
          
        return (
          <group 
            key={item.id} 
            position={[item.x, py, item.z]}
            rotation={[0, item.rot || 0, 0]}
            onClick={(e) => {
              e.stopPropagation()
              if (pointer.moved) return
              if (!owned) {
                flash('this was placed by someone else')
                setSelection(null)
                return
              }
              if (isSelected) setSelection(null)
              else setSelection({ kind: 'crafted', id: item.id })
            }}
            onPointerOver={owned ? () => { document.body.style.cursor = 'pointer' } : undefined}
            onPointerOut={owned ? () => { document.body.style.cursor = '' } : undefined}
          >
            <Select enabled={isSelected}>
              <CraftedItemParts itemId={item.itemId} />
            </Select>
          </group>
        )
      })}
    </group>
  )
}
