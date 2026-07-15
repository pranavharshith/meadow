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

function softenNormals(geometry, amount) {
  const normals = geometry.getAttribute('normal')
  const normal = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (let index = 0; index < normals.count; index++) {
    normal.fromBufferAttribute(normals, index).lerp(up, amount).normalize()
    normals.setXYZ(index, normal.x, normal.y, normal.z)
  }
  normals.needsUpdate = true
}

// All grass is modeled opaque geometry. The short layer intentionally uses
// only five low-poly blades so it can be instanced densely as a real carpet.
function createGrassBladeGeometry(height, baseWidth, bend, rows) {
  const positions = []
  const indices = []
  for (let row = 0; row <= rows; row++) {
    const t = row / rows
    const halfWidth = baseWidth * 0.5 * Math.pow(1 - t, 0.72)
    positions.push(-halfWidth, t * height, bend * t * t, halfWidth, t * height, bend * t * t)
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

function createGrassClumpGeometry({ bladeCount, maxHeight, baseWidth, bend, spread, rows, normalSoftness }) {
  const blades = []
  for (let index = 0; index < bladeCount; index++) {
    const angle = index * 2.399963 + Math.sin(index * 1.71) * 0.34
    const heightVariation = 0.66 + (((index * 37) % 13) / 12) * 0.32
    const widthVariation = 0.82 + (((index * 19) % 9) / 8) * 0.24
    const blade = createGrassBladeGeometry(
      maxHeight * heightVariation,
      baseWidth * widthVariation,
      bend * (0.76 + (index % 3) * 0.14),
      rows,
    )
    const radius = spread * (0.18 + ((index * 11) % 7) / 8)
    blade.rotateY(angle)
    blade.translate(Math.cos(angle) * radius, -0.014, Math.sin(angle) * radius)
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
    roughness: 0.9,
    metalness: 0,
    emissive: '#173b06',
    emissiveIntensity: 0.14,
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
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
       objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.66));`,
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
        vec3 shade = vec3(0.22, 0.45, 0.10);
        vec3 healthy = vec3(0.42, 0.70, 0.17);
        vec3 sunlit = vec3(0.68, 0.86, 0.30);
        vec3 meadow = mix(shade, healthy, smoothstep(0.20, 0.74, macro));
        meadow = mix(meadow, sunlit, smoothstep(0.54, 0.86, patch) * 0.45);
        return meadow * (0.98 + fine * 0.12);
      }
    ` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float rootBlend = smoothstep(0.03, 0.38, vGrassHeight);
       float tipLight = smoothstep(0.28, 1.0, vGrassHeight);
       vec3 rootColor = grasslandGroundColor(vGrassWorldPosition.xz) * 0.93;
       vec3 bladeColor = diffuseColor.rgb * mix(0.94, 1.18, vGrassHeight);
       bladeColor = mix(bladeColor, bladeColor * vec3(1.04, 1.10, 0.78), tipLight * 0.30);
       diffuseColor.rgb = mix(rootColor, bladeColor, rootBlend);`,
    )
  }
  material.customProgramCacheKey = () => cacheKey
  return material
}

export const shortGrassGeometry = createGrassClumpGeometry({
  bladeCount: 5,
  maxHeight: 0.64,
  baseWidth: 0.16,
  bend: 0.12,
  spread: 0.30,
  rows: 2,
  normalSoftness: 0.82,
})
export const meadowGrassGeometry = createGrassClumpGeometry({
  bladeCount: 6,
  maxHeight: 1.04,
  baseWidth: 0.15,
  bend: 0.20,
  spread: 0.23,
  rows: 3,
  normalSoftness: 0.72,
})
export const tallGrassGeometry = createGrassClumpGeometry({
  bladeCount: 5,
  maxHeight: 1.42,
  baseWidth: 0.13,
  bend: 0.28,
  spread: 0.25,
  rows: 4,
  normalSoftness: 0.64,
})

export const shortGrassMaterial = createGrassMaterial({ bladeHeight: 0.64, windScale: 0.038, cacheKey: 'lush-short-grass-v2' })
export const meadowGrassMaterial = createGrassMaterial({ bladeHeight: 1.04, windScale: 0.09, cacheKey: 'lush-meadow-grass-v2' })
export const tallGrassMaterial = createGrassMaterial({ bladeHeight: 1.42, windScale: 0.14, cacheKey: 'lush-tall-grass-v2' })

const bushSource = new THREE.IcosahedronGeometry(0.5, 0)
const berrySource = new THREE.IcosahedronGeometry(0.07, 0)
const flowerPlane = new THREE.PlaneGeometry(0.22, 0.27)
flowerPlane.translate(0, 0.135, 0)

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

export const shrubMaterial = new THREE.MeshStandardMaterial({ color: '#3d6337', roughness: 1, flatShading: true })
export const berryMaterial = new THREE.MeshStandardMaterial({ color: '#ad3f5e', roughness: 0.82, flatShading: true })
export const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#f6e7c9', side: THREE.DoubleSide, roughness: 0.82, emissive: '#392610', emissiveIntensity: 0.08 })
export const leafMaterial = new THREE.MeshStandardMaterial({ color: '#80683b', side: THREE.DoubleSide, roughness: 1 })
export const twigMaterial = new THREE.MeshStandardMaterial({ color: '#563c25', roughness: 1, flatShading: true })
export const pebbleMaterial = new THREE.MeshStandardMaterial({ color: '#7b796e', roughness: 1, flatShading: true })
export const stumpMaterial = new THREE.MeshStandardMaterial({ color: '#64482b', roughness: 1, flatShading: true })
export const stumpCapMaterial = new THREE.MeshStandardMaterial({ color: '#ad8758', roughness: 1, flatShading: true })
