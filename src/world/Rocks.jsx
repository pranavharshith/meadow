import * as THREE from 'three'
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField } from './noise'
import { CHUNK, seedFor } from './chunk'
import { P, rockRegistry } from '../player-state'

// Three distinct rock shapes for visual variety:
// 0 = flat boulder (compressed sphere), 1 = tall standing stone, 2 = clustered pebble group

// Shape 0: flat boulder
const boulderGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(1, 0.5, 1)
  return g
})()

// Shape 1: tall standing stone (stretched)
const standingGeo = (() => {
  const g = new THREE.DodecahedronGeometry(1, 0)
  g.scale(0.6, 1.4, 0.6)
  return g
})()

// Shape 2: original round rock
const roundGeo = new THREE.DodecahedronGeometry(1, 0)

const ROCK_GEOS = [boulderGeo, standingGeo, roundGeo]

// Materials with moss: vertex-coloured — upward-facing verts get green tint
function makeMossyMaterial(baseColor, mossColor) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: false,
    color: baseColor,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  })
  // We'll use onBeforeCompile to tint top faces green
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       // Moss on upward-facing surfaces
       vec3 worldNorm = normalize(vNormal);
       float topFactor = smoothstep(0.4, 0.85, worldNorm.y);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${mossColor}), topFactor * 0.55);`
    )
  }
  return mat
}

// Three material variants for colour diversity
const rockMats = [
  makeMossyMaterial('#8d8b83', '0.38, 0.52, 0.28'), // grey + green moss
  makeMossyMaterial('#7a7870', '0.32, 0.48, 0.24'), // darker grey
  makeMossyMaterial('#9a9488', '0.42, 0.55, 0.30'), // warm grey
]

export default function Rocks() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const allRocks = useMemo(() => {
    const arr = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cx = center.cx + dx
        const cz = center.cz + dz
        const rng = mulberry32(seedFor(cx, cz) ^ 0x5c)
        const n = 2 + ((rng() * 4) | 0)
        for (let i = 0; i < n; i++) {
          const x = cx * CHUNK + rng() * CHUNK
          const z = cz * CHUNK + rng() * CHUNK
          if (clusterField(x, z) > 0.5) { rng(); rng(); rng(); rng(); rng(); continue }
          const rot = rng() * Math.PI * 2
          const sx = 0.6 + rng() * 1.6
          const sy = 0.4 + rng() * 0.8
          const sz = 0.6 + rng() * 1.6
          const sink = 0.15 + rng() * 0.25
          const shape = (rng() * 3) | 0
          const matIdx = (rng() * 3) | 0
          arr.push({ x, z, y: terrainHeight(x, z), rot, sx, sy, sz, sink, shape, matIdx })
        }
      }
    }
    return arr
  }, [center.cx, center.cz])

  // Sync rock registry for collision — only large rocks block
  useEffect(() => {
    rockRegistry.length = 0
    for (const r of allRocks) {
      if (r.sy >= 0.55) {
        rockRegistry.push({ x: r.x, z: r.z, r: Math.max(r.sx, r.sz) * 0.5 + 0.3 })
      }
    }
  }, [allRocks])

  return (
    <group>
      {allRocks.map((r, i) => (
        <mesh
          key={i}
          geometry={ROCK_GEOS[r.shape]}
          material={rockMats[r.matIdx]}
          position={[r.x, r.y - r.sink, r.z]}
          rotation={[0, r.rot, 0]}
          scale={[r.sx, r.sy, r.sz]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
