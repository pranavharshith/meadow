/**
 * LEGACY SCENE REFERENCE — TERRAIN (archived 2026-07-15)
 * Superseded by the modular scene/terrain implementation. Keep for visual
 * comparison and migration history; this file is intentionally not imported.
 */
import * as THREE from 'three'
import { useMemo, useState, useLayoutEffect, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  terrainHeight,
  biomeSample,
  syncTerrainPlots,
  plotSignatureForChunk,
  getTerrainPlotRev,
} from '../noise'
import { CHUNK } from '../chunk'
import { P, groundChunks, terrainDeformations } from '../../player-state'
import { useStore } from '../../store'

const RINGS = 2 // 5×5 window
/** Expand each chunk slightly so neighboring skirts overlap (G2.10 hairline seams). */
const SKIRT = 0.12

// Uniform SEG for the whole window — never mix resolutions (white lines).
function segsForQuality(quality) {
  if (quality === 'off') return 20
  if (quality === 'half') return 32
  return 48 // G2.3: slightly denser full quality
}

const MEADOW_DRY = new THREE.Color('#788642')
const MEADOW_LUSH = new THREE.Color('#4f7a39')
const FOREST_FLOOR = new THREE.Color('#355a32')
const MOSS = new THREE.Color('#668f45')
const SOIL = new THREE.Color('#806b43')
const ROCK = new THREE.Color('#77796a')

function enhanceTerrainShader(shader) {
  shader.vertexShader = `
    varying vec3 vNatureWorldPos;
    varying vec3 vNatureWorldNormal;
  ` + shader.vertexShader
  shader.vertexShader = shader.vertexShader.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
     vNatureWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
     vNatureWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
  )

  shader.fragmentShader = `
    varying vec3 vNatureWorldPos;
    varying vec3 vNatureWorldNormal;

    float natureHash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float natureNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(natureHash(i), natureHash(i + vec2(1.0, 0.0)), f.x),
                 mix(natureHash(i + vec2(0.0, 1.0)), natureHash(i + vec2(1.0)), f.x), f.y);
    }
    float natureFbm(vec2 p) {
      float value = 0.0;
      value += natureNoise(p) * 0.55;
      value += natureNoise(p * 2.07 + 13.7) * 0.28;
      value += natureNoise(p * 4.13 - 8.2) * 0.17;
      return value;
    }
  ` + shader.fragmentShader

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     vec2 natureUv = vNatureWorldPos.xz;
     float natureMacro = natureFbm(natureUv * 0.018);
     float natureFine = natureFbm(natureUv * 0.34);
     float natureGrain = natureNoise(natureUv * 1.65);
     float natureSlope = 1.0 - clamp(abs(normalize(vNatureWorldNormal).y), 0.0, 1.0);
     float natureRock = smoothstep(0.24, 0.66, natureSlope);
     float natureDamp = smoothstep(0.52, 0.82, natureMacro) * (1.0 - natureRock);
     float natureDry = smoothstep(0.18, 0.48, 1.0 - natureMacro) * (1.0 - natureDamp);

     vec3 natureLush = mix(vec3(0.22, 0.39, 0.16), vec3(0.38, 0.55, 0.23), natureFine);
     vec3 natureMoss = vec3(0.27, 0.43, 0.20);
     vec3 natureSoil = mix(vec3(0.36, 0.29, 0.17), vec3(0.50, 0.41, 0.24), natureFine);
     vec3 natureStone = mix(vec3(0.39, 0.40, 0.35), vec3(0.53, 0.52, 0.43), natureFine);
     vec3 natureColor = natureLush;
     natureColor = mix(natureColor, natureMoss, natureDamp * 0.62);
     natureColor = mix(natureColor, natureSoil, natureDry * 0.42);
     natureColor = mix(natureColor, natureStone, natureRock * (0.72 + natureFine * 0.20));
     natureColor *= 0.91 + natureGrain * 0.18;
     diffuseColor.rgb = mix(diffuseColor.rgb, natureColor, 0.58);`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
     float natureB0 = natureFbm(vNatureWorldPos.xz * 0.72);
     float natureBx = natureFbm((vNatureWorldPos.xz + vec2(0.055, 0.0)) * 0.72);
     float natureBz = natureFbm((vNatureWorldPos.xz + vec2(0.0, 0.055)) * 0.72);
     vec3 natureWorldBump = normalize(vec3((natureB0 - natureBx) * 3.2, 1.0, (natureB0 - natureBz) * 3.2));
     vec3 natureViewBump = normalize(mat3(viewMatrix) * natureWorldBump);
     normal = normalize(mix(normal, natureViewBump, 0.13 + natureRock * 0.08));`,
  )

  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
     roughnessFactor = mix(0.98, 0.82, natureRock);`,
  )
}

function buildGroundGeo(cx, cz, segs) {
  const size = CHUNK + SKIRT * 2
  const g = new THREE.PlaneGeometry(size, size, segs, segs)
  g.rotateX(-Math.PI / 2)
  const originX = cx * CHUNK + CHUNK / 2
  const originZ = cz * CHUNK + CHUNK / 2
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const normals = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  // Larger finite-diff for softer lighting at flatten edges (G2.4)
  const e = 2.25
  for (let i = 0; i < pos.count; i++) {
    // Map local plane coords onto world XZ centered on chunk
    const lx = pos.getX(i)
    const lz = pos.getZ(i)
    const x = lx + originX
    const z = lz + originZ
    const h = terrainHeight(x, z)
    pos.setX(i, x)
    pos.setZ(i, z)
    pos.setY(i, h)

    const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
    const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
    const nx = -hx / (2 * e)
    const nz = -hz / (2 * e)
    const inv = 1 / Math.hypot(nx, 1, nz)
    normals[i * 3] = nx * inv
    normals[i * 3 + 1] = inv
    normals[i * 3 + 2] = nz * inv

    const slope = Math.min(Math.hypot(hx, hz) / (2 * e), 1)
    const biome = biomeSample(x, z, slope, h)
    const altitude = THREE.MathUtils.clamp((h + 7) / 17, 0, 1)
    const micro = Math.sin(x * 1.91 + z * 2.47) * 0.035
    c.copy(MEADOW_DRY).lerp(MEADOW_LUSH, biome.moisture * 0.82)
    c.lerp(MOSS, biome.moisture * biome.forest * 0.28)
    c.lerp(FOREST_FLOOR, biome.forest * 0.38)
    c.lerp(SOIL, biome.dryness * 0.26)
    c.lerp(ROCK, biome.rock * 0.82)
    c.offsetHSL(0, 0, (altitude - 0.5) * 0.045 + micro)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  const key = `${cx},${cz}`
  if (terrainDeformations.has(key)) terrainDeformations.delete(key)

  return g
}

function GroundChunk({ cx, cz, segs, plotSig }) {
  const geo = useMemo(() => buildGroundGeo(cx, cz, segs), [cx, cz, segs, plotSig])

  useEffect(() => {
    const key = `${cx},${cz}`
    groundChunks.set(key, geo)
    return () => {
      groundChunks.delete(key)
      geo.dispose?.()
    }
  }, [cx, cz, geo])

  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        vertexColors
        roughness={0.94}
        metalness={0}
        onBeforeCompile={enhanceTerrainShader}
        customProgramCacheKey={() => 'nature-terrain-v2'}
        // polygonOffset reduces z-fighting where skirts overlap (G2.10/G2.11)
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  )
}

export default function Terrain() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const plots = useStore((s) => s.plots)
  const grassDensity = useStore((s) => s.grassDensity)

  useLayoutEffect(() => {
    syncTerrainPlots(plots)
  }, [plots])

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const segs = segsForQuality(grassDensity)
  const plotRev = getTerrainPlotRev()

  const chunks = []
  for (let dx = -RINGS; dx <= RINGS; dx++) {
    for (let dz = -RINGS; dz <= RINGS; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      const plotSig = plotSignatureForChunk(cx, cz, CHUNK)
      chunks.push(
        <GroundChunk
          key={`${cx},${cz},${segs},${plotRev}`}
          cx={cx}
          cz={cz}
          segs={segs}
          plotSig={plotSig}
        />,
      )
    }
  }
  return <group>{chunks}</group>
}
