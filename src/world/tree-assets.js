import * as THREE from 'three'
import { windTime, windStrength } from '../wind'

// Shared geometries + materials for every tree (decorative and planted) so
// hundreds of trees stay cheap. Leaves sway via a shared wind shader; no
// per-frame JS needed.
export const trunkGeo = new THREE.CylinderGeometry(0.12, 0.2, 1.5, 6)
export const leafGeo = new THREE.IcosahedronGeometry(1, 0)
export const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 })

function makeLeafMat(color) {
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.uniforms.uWind = windStrength
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
       float ph = wp.x * 0.25 + wp.z * 0.25;
       float amp = 0.06 * clamp(position.y + 1.2, 0.0, 2.0) * uWind;
       transformed.x += sin(uTime * 0.9 + ph) * amp;
       transformed.z += cos(uTime * 0.75 + ph) * amp * 0.8;`
    )
  }
  return m
}

export const leafMats = [makeLeafMat('#5c8a3a'), makeLeafMat('#6f9b45'), makeLeafMat('#4f7d33')]
