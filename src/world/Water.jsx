import * as THREE from 'three'
import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, PONDS } from './noise'
import {
  STREAM_SAMPLE_POINTS,
  STREAM_WIDTH,
  STREAM_POINTS,
} from './water-path'
import { waterRipples } from '../player-state'

// Re-export for any leftover imports
export { STREAM_POINTS, STREAM_WIDTH } from './water-path'

function createWaterMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: '#4a90b8',
    transparent: true,
    opacity: 0.55,
    roughness: 0.12,
    metalness: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uRipples = { value: new Array(12).fill(new THREE.Vector4(0, 0, 0, 0)) }
    shader.vertexShader = `
      uniform float uTime;
      uniform vec4 uRipples[12];
      ${shader.vertexShader}
    `
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
       float baseRipples = sin(wp.x * 0.5 + uTime * 1.2) * 0.04 + cos(wp.z * 0.4 + uTime * 0.9) * 0.03;
       float dy = baseRipples;
       for(int i=0; i<12; i++) {
         vec4 r = uRipples[i];
         if (r.w > 0.0) {
           float dx = wp.x - r.x;
           float dz = wp.z - r.y;
           float dist = sqrt(dx*dx + dz*dz);
           float age = uTime - r.z;
           float spread = age * 3.0;
           float distFromRing = abs(dist - spread);
           if (distFromRing < 1.5 && age > 0.0 && age < 4.0) {
             float fade = (1.0 - (age / 4.0)) * smoothstep(1.5, 0.0, distFromRing);
             float wave = sin((dist - age * 3.0) * 8.0) * 0.12;
             dy += wave * fade * r.w;
           }
         }
       }
       transformed.y += dy;
      `,
    )
    mat.userData.shader = shader
  }
  return mat
}

/** Stream ribbon sitting slightly above carved bed (same samples as corridor). */
function buildStreamGeo() {
  const verts = []
  const indices = []
  const uvs = []
  const curvePoints = STREAM_SAMPLE_POINTS
  const hw = STREAM_WIDTH * 0.5

  for (let i = 0; i < curvePoints.length; i++) {
    const p = curvePoints[i]
    let dx
    let dz
    if (i < curvePoints.length - 1) {
      dx = curvePoints[i + 1].x - p.x
      dz = curvePoints[i + 1].z - p.z
    } else {
      dx = p.x - curvePoints[i - 1].x
      dz = p.z - curvePoints[i - 1].z
    }
    const len = Math.hypot(dx, dz) || 1
    const nx = -dz / len
    const nz = dx / len
    const x1 = p.x + nx * hw
    const z1 = p.z + nz * hw
    const x2 = p.x - nx * hw
    const z2 = p.z - nz * hw
    // Bed is already carved; float water slightly above terrainHeight
    const y1 = terrainHeight(x1, z1) + 0.06
    const y2 = terrainHeight(x2, z2) + 0.06
    verts.push(x1, y1, z1, x2, y2, z2)
    const u = i / (curvePoints.length - 1)
    uvs.push(0, u, 1, u)
    if (i < curvePoints.length - 1) {
      const base = i * 2
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

const RIPPLE_VECS = new Array(12).fill(0).map(() => new THREE.Vector4())

export default function Water() {
  const mat = useMemo(() => createWaterMaterial(), [])
  // Rebuild if terrain carve changes globally (static after load)
  const streamGeo = useMemo(() => buildStreamGeo(), [])

  useFrame(({ clock }) => {
    if (mat.userData.shader) {
      mat.userData.shader.uniforms.uTime.value = clock.elapsedTime
      for (let i = 0; i < 12; i++) {
        const r = waterRipples[i]
        if (r) RIPPLE_VECS[i].set(r.x, r.z, r.time, r.intensity)
        else RIPPLE_VECS[i].set(0, 0, 0, 0)
      }
      mat.userData.shader.uniforms.uRipples.value = RIPPLE_VECS
    }
  })

  return (
    <group>
      {PONDS.map((p, i) => {
        // Basin bed is POND_HEIGHT - 0.45; water sits mid-basin for soft shores
        const bedY = terrainHeight(p.x, p.z)
        return (
          <mesh
            key={i}
            position={[p.x, bedY + 0.12, p.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={mat}
            receiveShadow
          >
            <circleGeometry args={[p.r * 0.98, 32]} />
          </mesh>
        )
      })}
      <mesh geometry={streamGeo} material={mat} receiveShadow />
    </group>
  )
}
