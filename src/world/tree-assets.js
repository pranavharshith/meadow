import * as THREE from 'three'
import { windTime, windStrength } from '../wind'

// Shared geometries + materials for every tree (decorative and planted) so
// hundreds of trees stay cheap. Leaves sway via a shared wind shader; no
// per-frame JS needed.

// Trunk: taller and slightly thicker so trees tower over the player
export const trunkGeo = new THREE.CylinderGeometry(0.15, 0.28, 2.8, 6)
export const leafGeo = new THREE.IcosahedronGeometry(1, 0)
export const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 })

// Sapling-specific: thin stick trunk
export const saplingTrunkGeo = new THREE.CylinderGeometry(0.04, 0.07, 1.2, 5)
export const saplingLeafGeo = new THREE.IcosahedronGeometry(0.45, 0)

// Sprout: tiny seedling
export const sproutGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.5, 4)
export const sproutLeafGeo = new THREE.SphereGeometry(0.18, 8, 6)

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

// Lighter spring-green for saplings
export const saplingLeafMat = new THREE.MeshStandardMaterial({ color: '#8cc65e', flatShading: true, roughness: 0.9 })
// Bright fresh green for sprouts
export const sproutLeafMat = new THREE.MeshStandardMaterial({ color: '#a8e06c', flatShading: true, roughness: 0.85 })
