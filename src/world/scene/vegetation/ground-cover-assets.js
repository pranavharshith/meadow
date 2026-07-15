import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { windStrength, windTime } from '../../../wind'

function mergedTransformed(source, transforms) {
  const parts = transforms.map(({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] }) => {
    const geometry = source.clone()
    geometry.scale(...scale)
    geometry.rotateX(rotation[0])
    geometry.rotateY(rotation[1])
    geometry.rotateZ(rotation[2])
    geometry.translate(...position)
    return geometry
  })
  return mergeGeometries(parts)
}

function createGrassTuftGeometry() {
  const blade = new THREE.PlaneGeometry(0.08, 0.66, 1, 3)
  blade.translate(0, 0.33, 0)
  return mergedTransformed(blade, Array.from({ length: 5 }, (_, index) => ({
    rotation: [0, (index / 5) * Math.PI, (index - 2) * 0.035],
    scale: [0.78 + (index % 3) * 0.14, 0.78 + (index % 2) * 0.28, 1],
  })))
}

function createFernGeometry() {
  const positions = []
  const normals = []
  const indices = []
  let vertex = 0
  const fronds = 10

  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2
    const length = 0.58 + (i % 3) * 0.09
    const width = 0.12
    const directionX = Math.cos(angle)
    const directionZ = Math.sin(angle)
    const sideX = -directionZ * width
    const sideZ = directionX * width
    const startX = directionX * 0.05
    const startZ = directionZ * 0.05
    const endX = directionX * length
    const endZ = directionZ * length

    positions.push(
      startX - sideX * 0.25, 0.05, startZ - sideZ * 0.25,
      startX + sideX * 0.25, 0.05, startZ + sideZ * 0.25,
      endX + sideX * 0.12, 0.18, endZ + sideZ * 0.12,
      endX, 0.2, endZ,
      endX - sideX * 0.12, 0.18, endZ - sideZ * 0.12,
    )
    for (let n = 0; n < 5; n++) normals.push(0, 1, 0)
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3, vertex, vertex + 3, vertex + 4)
    vertex += 5
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

const bushSource = new THREE.IcosahedronGeometry(0.5, 0)
const berrySource = new THREE.IcosahedronGeometry(0.07, 0)
const flowerPlane = new THREE.PlaneGeometry(0.24, 0.3)
flowerPlane.translate(0, 0.15, 0)

export const grassTuftGeometry = createGrassTuftGeometry()
export const fernGeometry = createFernGeometry()
export const shrubGeometry = mergedTransformed(bushSource, [
  { position: [-0.28, 0.32, 0], scale: [0.9, 0.75, 0.9] },
  { position: [0.25, 0.38, 0.08], scale: [1, 0.9, 1] },
  { position: [0, 0.3, -0.25], scale: [0.82, 0.7, 0.82] },
])
export const berryGeometry = mergedTransformed(berrySource, [
  [-0.4, 0.55, 0.05], [0.35, 0.58, 0.12], [0.05, 0.67, -0.3],
  [-0.18, 0.72, -0.12], [0.46, 0.4, -0.15], [-0.42, 0.38, -0.2],
].map((position) => ({ position })))
export const flowerGeometry = mergedTransformed(flowerPlane, [
  { rotation: [0, 0, 0] },
  { rotation: [0, Math.PI / 2, 0] },
])
export const fallenLeafGeometry = new THREE.CircleGeometry(0.13, 3)
fallenLeafGeometry.rotateX(-Math.PI / 2)
export const twigGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.85, 5)
twigGeometry.rotateZ(Math.PI / 2)
export const pebbleGeometry = new THREE.IcosahedronGeometry(0.22, 0)
pebbleGeometry.scale(1, 0.58, 0.82)
export const stumpGeometry = new THREE.CylinderGeometry(0.28, 0.38, 0.72, 7)
export const stumpCapGeometry = new THREE.CylinderGeometry(0.285, 0.285, 0.035, 7)

export const grassMaterial = (() => {
  const material = new THREE.MeshStandardMaterial({
    color: '#6e8b32',
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.uniforms.uWind = windStrength
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float grassHeight = clamp(position.y / 0.7, 0.0, 1.0);
       vec3 grassOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float grassPhase = grassOrigin.x * 0.31 + grassOrigin.z * 0.27;
       float grassSway = sin(uTime * 1.2 + grassPhase) + 0.45 * sin(uTime * 2.4 + grassPhase * 1.7);
       transformed.x += grassSway * 0.11 * pow(grassHeight, 1.7) * uWind;
       transformed.z += cos(uTime + grassPhase) * 0.06 * grassHeight * uWind;`,
    )
  }
  material.customProgramCacheKey = () => 'woodland-grass-v1'
  return material
})()

export const fernMaterial = new THREE.MeshStandardMaterial({ color: '#31592f', side: THREE.DoubleSide, roughness: 1, flatShading: true })
export const shrubMaterial = new THREE.MeshStandardMaterial({ color: '#294b27', roughness: 1, flatShading: true })
export const berryMaterial = new THREE.MeshStandardMaterial({ color: '#a92955', roughness: 0.8, flatShading: true })
export const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#f3d5b5', side: THREE.DoubleSide, roughness: 0.8 })
export const leafMaterial = new THREE.MeshStandardMaterial({ color: '#79602c', side: THREE.DoubleSide, roughness: 1 })
export const twigMaterial = new THREE.MeshStandardMaterial({ color: '#4a321e', roughness: 1, flatShading: true })
export const pebbleMaterial = new THREE.MeshStandardMaterial({ color: '#706f64', roughness: 1, flatShading: true })
export const stumpMaterial = new THREE.MeshStandardMaterial({ color: '#594126', roughness: 1, flatShading: true })
export const stumpCapMaterial = new THREE.MeshStandardMaterial({ color: '#a07b4d', roughness: 1, flatShading: true })
