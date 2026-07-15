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

function softenNormals(geometry, amount = 0.7) {
  const normals = geometry.getAttribute('normal')
  const normal = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)

  for (let index = 0; index < normals.count; index++) {
    normal.fromBufferAttribute(normals, index).lerp(up, amount).normalize()
    normals.setXYZ(index, normal.x, normal.y, normal.z)
  }
  normals.needsUpdate = true
}

// Opaque modeled blades keep the meadow soft without the fill-rate cost of
// alpha cards. Clumps are deliberately irregular to avoid radial repetition.
function createGrassBladeGeometry(height, baseWidth, bend, rows = 4) {
  const positions = []
  const indices = []
  for (let row = 0; row <= rows; row++) {
    const t = row / rows
    const halfWidth = baseWidth * 0.5 * Math.pow(1 - t, 0.72)
    positions.push(
      -halfWidth, t * height, bend * t * t,
      halfWidth, t * height, bend * t * t,
    )
  }
  for (let row = 0; row < rows; row++) {
    const start = row * 2
    indices.push(start, start + 1, start + 3, start, start + 3, start + 2)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createGrassClumpGeometry({ bladeCount, maxHeight, baseWidth, bend, spread, normalSoftness }) {
  const blades = []
  for (let index = 0; index < bladeCount; index++) {
    const angle = index * 2.399963 + Math.sin(index * 1.71) * 0.31
    const heightVariation = 0.64 + (((index * 37) % 13) / 12) * 0.34
    const widthVariation = 0.78 + (((index * 19) % 9) / 8) * 0.28
    const blade = createGrassBladeGeometry(
      maxHeight * heightVariation,
      baseWidth * widthVariation,
      bend * (0.72 + (index % 4) * 0.12),
    )
    const radius = spread * (0.22 + ((index * 11) % 7) / 8)
    blade.rotateY(angle)
    blade.translate(Math.cos(angle) * radius, -0.018, Math.sin(angle) * radius)
    blades.push(blade)
  }

  const geometry = mergeGeometries(blades)
  softenNormals(geometry, normalSoftness)
  geometry.computeBoundingSphere()
  return geometry
}

function createGrassMaterial({ bladeHeight, windScale, cacheKey }) {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    side: THREE.DoubleSide,
    roughness: 0.94,
    metalness: 0,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime
    shader.uniforms.uWind = windStrength
    shader.vertexShader = `
      uniform float uTime;
      uniform float uWind;
      varying float vGrassHeight;
      varying vec3 vGrassWorldPosition;
    ` + shader.vertexShader

    // The terrain-facing local up vector becomes the terrain normal because
    // instances are aligned to the sampled terrain facet before rendering.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.62));`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float grassHeight = clamp(position.y / ${bladeHeight.toFixed(3)}, 0.0, 1.0);
       vGrassHeight = grassHeight;
       vec3 grassOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float travelingGust = sin(dot(grassOrigin.xz, vec2(0.035, 0.022)) - uTime * 0.62);
       float crossGust = sin(dot(grassOrigin.xz, vec2(-0.071, 0.047)) + uTime * 0.31);
       float localFlutter = sin(uTime * 1.9 + grassOrigin.x * 0.17 + grassOrigin.z * 0.11);
       float bendAmount = pow(grassHeight, 1.65);
       float gust = travelingGust * 0.72 + crossGust * 0.24 + localFlutter * 0.08;
       transformed.x += gust * ${windScale.toFixed(3)} * bendAmount * uWind;
       transformed.z += (travelingGust * 0.42 + crossGust * 0.18) * ${windScale.toFixed(3)} * bendAmount * uWind;
       vGrassWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
    )

    shader.fragmentShader = `
      varying float vGrassHeight;
      varying vec3 vGrassWorldPosition;

      float grasslandHash(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float grasslandNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(grasslandHash(cell), grasslandHash(cell + vec2(1.0, 0.0)), local.x),
          mix(grasslandHash(cell + vec2(0.0, 1.0)), grasslandHash(cell + vec2(1.0, 1.0)), local.x),
          local.y
        );
      }

      float grasslandFbm(vec2 point) {
        return grasslandNoise(point) * 0.62
          + grasslandNoise(point * 2.03 + 17.2) * 0.25
          + grasslandNoise(point * 4.11 - 9.7) * 0.13;
      }

      vec3 grasslandGroundColor(vec2 worldPosition) {
        float macro = grasslandFbm(worldPosition * 0.011);
        float patch = grasslandFbm(worldPosition * 0.043 + 31.0);
        float fine = grasslandFbm(worldPosition * 0.19 - 14.0);
        vec3 shade = vec3(0.16, 0.34, 0.08);
        vec3 healthy = vec3(0.31, 0.56, 0.13);
        vec3 sunlit = vec3(0.50, 0.72, 0.20);
        vec3 meadow = mix(shade, healthy, smoothstep(0.24, 0.78, macro));
        meadow = mix(meadow, sunlit, smoothstep(0.58, 0.88, patch) * 0.42);
        return meadow * (0.92 + fine * 0.14);
      }
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float rootBlend = smoothstep(0.05, 0.46, vGrassHeight);
       float tipLight = smoothstep(0.32, 1.0, vGrassHeight);
       vec3 rootColor = grasslandGroundColor(vGrassWorldPosition.xz) * 0.82;
       vec3 bladeColor = diffuseColor.rgb * mix(0.78, 1.10, vGrassHeight);
       bladeColor = mix(bladeColor, bladeColor * vec3(1.05, 1.10, 0.82), tipLight * 0.34);
       diffuseColor.rgb = mix(rootColor, bladeColor, rootBlend);`,
    )
  }
  material.customProgramCacheKey = () => cacheKey
  return material
}

// Each layer is opaque modeled geometry. The dense short layer creates the
// continuous carpet; the other two add silhouette and depth above it.
export const shortGrassGeometry = createGrassClumpGeometry({
  bladeCount: 11,
  maxHeight: 0.58,
  baseWidth: 0.11,
  bend: 0.10,
  spread: 0.14,
  normalSoftness: 0.78,
})
export const meadowGrassGeometry = createGrassClumpGeometry({
  bladeCount: 9,
  maxHeight: 0.96,
  baseWidth: 0.135,
  bend: 0.18,
  spread: 0.18,
  normalSoftness: 0.70,
})
export const tallGrassGeometry = createGrassClumpGeometry({
  bladeCount: 7,
  maxHeight: 1.36,
  baseWidth: 0.12,
  bend: 0.26,
  spread: 0.21,
  normalSoftness: 0.62,
})

export const shortGrassMaterial = createGrassMaterial({
  bladeHeight: 0.58,
  windScale: 0.045,
  cacheKey: 'lush-short-grass-v1',
})
export const meadowGrassMaterial = createGrassMaterial({
  bladeHeight: 0.96,
  windScale: 0.095,
  cacheKey: 'lush-meadow-grass-v1',
})
export const tallGrassMaterial = createGrassMaterial({
  bladeHeight: 1.36,
  windScale: 0.145,
  cacheKey: 'lush-tall-grass-v1',
})

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

export const fernMaterial = new THREE.MeshStandardMaterial({ color: '#426f3f', side: THREE.DoubleSide, roughness: 1, flatShading: true })
export const shrubMaterial = new THREE.MeshStandardMaterial({ color: '#3d6337', roughness: 1, flatShading: true })
export const berryMaterial = new THREE.MeshStandardMaterial({ color: '#ad3f5e', roughness: 0.82, flatShading: true })
export const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#f0ddc0', side: THREE.DoubleSide, roughness: 0.82 })
export const leafMaterial = new THREE.MeshStandardMaterial({ color: '#80683b', side: THREE.DoubleSide, roughness: 1 })
export const twigMaterial = new THREE.MeshStandardMaterial({ color: '#563c25', roughness: 1, flatShading: true })
export const pebbleMaterial = new THREE.MeshStandardMaterial({ color: '#7b796e', roughness: 1, flatShading: true })
export const stumpMaterial = new THREE.MeshStandardMaterial({ color: '#64482b', roughness: 1, flatShading: true })
export const stumpCapMaterial = new THREE.MeshStandardMaterial({ color: '#ad8758', roughness: 1, flatShading: true })
