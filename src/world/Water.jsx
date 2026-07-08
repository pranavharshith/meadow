import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
// We import the same PONDS array used by noise.js for flattening
import { PONDS } from './noise'

// Water bodies — ponds and a stream that break up the uniform grass world.
// Semi-transparent with gentle vertex animation for soft ripples.

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

  // Create a smooth curve from the stream points
  const points = STREAM_POINTS.map(p => new THREE.Vector3(p.x, 0, p.z))
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
  
  // Sample the curve at high resolution so the stream perfectly hugs the terrain
  const SEGMENTS = 150
  const curvePoints = curve.getSpacedPoints(SEGMENTS)

  for (let i = 0; i < curvePoints.length; i++) {
    const p = curvePoints[i]
    
    // Calculate 2D normal for stream width
    let dx, dz
    if (i < curvePoints.length - 1) {
      dx = curvePoints[i + 1].x - p.x
      dz = curvePoints[i + 1].z - p.z
    } else {
      dx = p.x - curvePoints[i - 1].x
      dz = p.z - curvePoints[i - 1].z
    }
    const len = Math.hypot(dx, dz)
    const nx = -dz / len
    const nz = dx / len
    const hw = STREAM_WIDTH * 0.5

    const x1 = p.x + nx * hw
    const z1 = p.z + nz * hw
    const x2 = p.x - nx * hw
    const z2 = p.z - nz * hw

    // Sample terrain EXACTLY at the left/right vertices to prevent clipping
    // Float it slightly above the grass so it's clearly visible
    const y1 = terrainHeight(x1, z1) + 0.04
    const y2 = terrainHeight(x2, z2) + 0.04

    verts.push(x1, y1, z1)
    verts.push(x2, y2, z2)

    const u = i / (curvePoints.length - 1)
    uvs.push(0, u)
    uvs.push(1, u)

    if (i < curvePoints.length - 1) {
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
          // The terrain crater is deeply lowered, so this sits perfectly inside
          position={[p.x, terrainHeight(p.x, p.z) + 0.35, p.z]}
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
