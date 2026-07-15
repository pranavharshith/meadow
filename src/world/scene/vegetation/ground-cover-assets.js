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

export const GRASS_BLADE_HEIGHT = 0.92

// One curved, tapered blade: several rows wide at the root, narrowing to a
// point, gently bending forward. Reads as a broad leaf rather than a stick.
function createGrassBladeGeometry(height, baseWidth, bend, rows = 5) {
  const positions = []
  const indices = []
  for (let i = 0; i <= rows; i++) {
    const t = i / rows
    const y = t * height
    const halfWidth = (baseWidth * 0.5) * Math.pow(1 - t, 0.68)
    const z = bend * t * t
    positions.push(-halfWidth, y, z, halfWidth, y, z)
  }
  for (let i = 0; i < rows; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = (i + 1) * 2
    const d = (i + 1) * 2 + 1
    indices.push(a, b, d, a, d, c)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// A tuft is a few overlapping blades fanned around the root so tufts read as
// soft clumps that merge into a continuous meadow at distance.
function createGrassTuftGeometry() {
  const count = 6
  const blades = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (i % 2) * 0.4
    const height = GRASS_BLADE_HEIGHT * (0.78 + (i % 3) * 0.15)
    const bend = 0.15 + (i % 2) * 0.08
    const blade = createGrassBladeGeometry(height, 0.15, bend, 5)
    blade.rotateY(angle)
    blade.translate(Math.cos(angle) * 0.045, -0.02, Math.sin(angle) * 0.045)
    blades.push(blade)
  }
  return mergeGeometries(blades)
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
    for (let normal = 0; normal < 5; normal++) normals.push(0, 1, 0)
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
const flowerPlane = new THREE.PlaneGeometry(0.22, 0.27)
flowerPlane.translate(0, 0.135, 0)

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
export const fallenLeafGeometry = new THREE.CircleGeometry(0.12, 3)
fallenLeafGeometry.rotateX(-Math.PI / 2)
export const twigGeometry = new THREE.CylinderGeometry(0.025, 0.04, 0.85, 5)
twigGeometry.rotateZ(Math.PI / 2)
export const pebbleGeometry = new THREE.IcosahedronGeometry(0.22, 0)
pebbleGeometry.scale(1, 0.58, 0.82)
export const stumpGeometry = new THREE.CylinderGeometry(0.28, 0.38, 0.72, 7)
export const stumpCapGeometry = new THREE.CylinderGeometry(0.285, 0.285, 0.035, 7)

export const grassMaterial = (() => {
  // White base so the per-instance colors render at full value instead of being
  // multiplied down into muddy olive. Lushness/gradient comes from instanceColor
  // and the shader tip gradient below.
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1, metalness: 0 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.uniforms.uWind = windStrength
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nvarying float vGrassH;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float grassHeight = clamp(position.y / ${GRASS_BLADE_HEIGHT.toFixed(3)}, 0.0, 1.0);
       vGrassH = grassHeight;
       vec3 grassOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float grassPhase = grassOrigin.x * 0.31 + grassOrigin.z * 0.27;
       float grassSway = sin(uTime * 1.1 + grassPhase) + 0.4 * sin(uTime * 2.3 + grassPhase * 1.7);
       float bendAmt = pow(grassHeight, 1.6);
       transformed.x += grassSway * 0.17 * bendAmt * uWind;
       transformed.z += cos(uTime * 0.9 + grassPhase) * 0.09 * bendAmt * uWind;`,
    )
    shader.fragmentShader = 'varying float vGrassH;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       diffuseColor.rgb *= mix(0.6, 1.12, vGrassH);
       diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.1, 0.82), vGrassH * 0.5);`,
    )
  }
  material.customProgramCacheKey = () => 'woodland-grass-ribbon-v1'
  return material
})()

export const fernMaterial = new THREE.MeshStandardMaterial({ color: '#426f3f', side: THREE.DoubleSide, roughness: 1, flatShading: true })
export const shrubMaterial = new THREE.MeshStandardMaterial({ color: '#3d6337', roughness: 1, flatShading: true })
export const berryMaterial = new THREE.MeshStandardMaterial({ color: '#ad3f5e', roughness: 0.82, flatShading: true })
export const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#f0ddc0', side: THREE.DoubleSide, roughness: 0.82 })
export const leafMaterial = new THREE.MeshStandardMaterial({ color: '#80683b', side: THREE.DoubleSide, roughness: 1 })
export const twigMaterial = new THREE.MeshStandardMaterial({ color: '#563c25', roughness: 1, flatShading: true })
export const pebbleMaterial = new THREE.MeshStandardMaterial({ color: '#7b796e', roughness: 1, flatShading: true })
export const stumpMaterial = new THREE.MeshStandardMaterial({ color: '#64482b', roughness: 1, flatShading: true })
export const stumpCapMaterial = new THREE.MeshStandardMaterial({ color: '#ad8758', roughness: 1, flatShading: true })
