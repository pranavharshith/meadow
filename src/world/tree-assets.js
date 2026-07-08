import * as THREE from 'three'
import { windTime, windStrength } from '../wind'

// Shared geometries + materials for every tree. Multiple silhouettes keep the
// world visually rich while staying cheap (shared geos + instancing-friendly).

// --- Shape 0: Classic broadleaf (original, now bigger) ---
export const trunkGeo = new THREE.CylinderGeometry(0.15, 0.28, 2.8, 6)
export const leafGeo = new THREE.IcosahedronGeometry(1, 0)
export const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 })

// --- Shape 1: Pine / Conifer — tall cone canopy ---
export const pineTrunkGeo = new THREE.CylinderGeometry(0.1, 0.22, 3.2, 6)
export const pineLeafGeo = new THREE.ConeGeometry(0.9, 2.4, 6)
export const pineTrunkMat = new THREE.MeshStandardMaterial({ color: '#5a3d20', roughness: 0.95 })

// --- Shape 2: Round / Bushy — dense sphere canopy, shorter ---
export const bushyTrunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1.8, 6)
export const bushyLeafGeo = new THREE.SphereGeometry(1.1, 8, 6)

// --- Shape 3: Willow / Banyan — tall trunk, multiple drooping canopy clusters ---
export const willowTrunkGeo = new THREE.CylinderGeometry(0.18, 0.35, 3.8, 7)
export const willowTrunkMat = new THREE.MeshStandardMaterial({ color: '#7a6a50', roughness: 0.9 })
export const willowLeafGeo = new THREE.SphereGeometry(1.2, 9, 7)
// Stretch it vertically for a drooping hanging look
willowLeafGeo.scale(0.85, 1.5, 0.85)

// --- Shape 4: Cherry Blossom ---
export const cherryTrunkGeo = new THREE.CylinderGeometry(0.12, 0.24, 2.6, 6)
export const cherryLeafGeo = new THREE.IcosahedronGeometry(1.2, 0)
// Base color fallback if no dye is applied
export const cherryLeafMats = [
  makeLeafMat('#ffb7d5'),
  makeLeafMat('#ffa3cc'),
  makeLeafMat('#ffcce0'),
]

// --- Shape 5: Bioluminescent Mushroom ---
export const mushroomStemGeo = new THREE.CylinderGeometry(0.1, 0.25, 1.5, 7)
export const mushroomCapGeo = new THREE.SphereGeometry(1.2, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
export const mushroomStemMat = new THREE.MeshStandardMaterial({ color: '#cce6ff', roughness: 0.7 })
// Emissive material that glows in the dark
export const mushroomCapMat = new THREE.MeshStandardMaterial({
  color: '#4db8ff',
  emissive: '#0088ff',
  emissiveIntensity: 0.6,
  roughness: 0.4,
})

// --- Growth stage geos (shared across all shapes) ---
export const saplingTrunkGeo = new THREE.CylinderGeometry(0.04, 0.07, 1.2, 5)
export const saplingLeafGeo = new THREE.IcosahedronGeometry(0.45, 0)
export const sproutGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.5, 4)
export const sproutLeafGeo = new THREE.SphereGeometry(0.18, 8, 6)

// --- Wind-sway leaf material factory ---
export function makeLeafMat(color) {
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

// Broadleaf colours
export const leafMats = [makeLeafMat('#5c8a3a'), makeLeafMat('#6f9b45'), makeLeafMat('#4f7d33')]

// Pine: dark blue-green
export const pineLeafMats = [makeLeafMat('#2d5a3a'), makeLeafMat('#3a6b45'), makeLeafMat('#1f4a2e')]

// Bushy: warm orange-green
export const bushyLeafMats = [makeLeafMat('#7a9a3a'), makeLeafMat('#8aaa44'), makeLeafMat('#6b8830')]

// Willow: pale silver-green
export const willowLeafMats = [makeLeafMat('#6a9a70'), makeLeafMat('#7aaa7a'), makeLeafMat('#5a8a60')]

// Growth stage materials
export const saplingLeafMat = new THREE.MeshStandardMaterial({ color: '#8cc65e', flatShading: true, roughness: 0.9 })
export const sproutLeafMat = new THREE.MeshStandardMaterial({ color: '#a8e06c', flatShading: true, roughness: 0.85 })
