import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'

// Water bodies — ponds and a stream that break up the uniform grass world.
// Semi-transparent with gentle vertex animation for soft ripples.

export const PONDS = [
  { x: -74, z: 40, r: 12 },     // Crystal Pond
  { x: -300, z: 280, r: 8 },    // Silver Brook area
  { x: 180, z: -140, r: 6 },    // Broken Bridge
  { x: -60, z: 240, r: 10 },    // Willow Bend
  { x: 90, z: -220, r: 5 },     // Flower Terrace
  { x: -160, z: 210, r: 7 },    // Starfall Clearing
]

// Stream points forming a winding path from Silver Brook to Crystal Pond
export const STREAM_POINTS = [
  { x: -300, z: 280 },
  { x: -260, z: 250 },
  { x: -220, z: 230 },
  { x: -180, z: 240 },
  { x: -140, z: 220 },
  { x: -100, z: 190 },
  { x: -74, z: 140 },
  { x: -60, z: 100 },
  { x: -50, z: 60 },
  { x: -74, z: 40 },
]

export const STREAM_WIDTH = 3.5

function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: '#4a90b8',
    transparent: true,
    opacity: 0.55,
    roughness: 0.1,
    metalness: 0.3,
    side: THREE.DoubleSide,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
       transformed.y += sin(wp.x * 0.5 + uTime * 1.2) * 0.05;
       transformed.y += cos(wp.z * 0.4 + uTime * 0.9) * 0.04;`
    )
    mat.userData.shader = shader
  }
  return mat
}

function buildStreamGeo() {
  const verts = []
  const indices = []
  const uvs = []

  for (let i = 0; i < STREAM_POINTS.length; i++) {
    const p = STREAM_POINTS[i]
    const y = terrainHeight(p.x, p.z) - 0.08

    let dx, dz
    if (i < STREAM_POINTS.length - 1) {
      dx = STREAM_POINTS[i + 1].x - p.x
      dz = STREAM_POINTS[i + 1].z - p.z
    } else {
      dx = p.x - STREAM_POINTS[i - 1].x
      dz = p.z - STREAM_POINTS[i - 1].z
    }
    const len = Math.hypot(dx, dz)
    const nx = -dz / len
    const nz = dx / len
    const hw = STREAM_WIDTH * 0.5

    verts.push(p.x + nx * hw, y, p.z + nz * hw)
    verts.push(p.x - nx * hw, y, p.z - nz * hw)

    const u = i / (STREAM_POINTS.length - 1)
    uvs.push(0, u)
    uvs.push(1, u)

    if (i < STREAM_POINTS.length - 1) {
      const base = i * 2
      indices.push(base, base + 1, base + 2)
      indices.push(base + 1, base + 3, base + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

export default function Water() {
  const mat = useMemo(() => createWaterMaterial(), [])
  const streamGeo = useMemo(() => buildStreamGeo(), [])

  useFrame(({ clock }) => {
    if (mat.userData.shader) {
      mat.userData.shader.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <group>
      {PONDS.map((p, i) => (
        <mesh
          key={i}
          position={[p.x, terrainHeight(p.x, p.z) - 0.12, p.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={mat}
          receiveShadow
        >
          <circleGeometry args={[p.r, 24]} />
        </mesh>
      ))}
      <mesh geometry={streamGeo} material={mat} receiveShadow />
    </group>
  )
}
