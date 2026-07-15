import * as THREE from 'three'
import { useMemo, useState, useLayoutEffect, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  terrainHeight,
  syncTerrainPlots,
  plotSignatureForChunk,
  getTerrainPlotRev,
} from './noise'
import { CHUNK } from './chunk'
import { P, groundChunks, terrainDeformations } from '../player-state'
import { useStore } from '../store'

const RINGS = 2 // 5×5 window
/** Expand each chunk slightly so neighboring skirts overlap (G2.10 hairline seams). */
const SKIRT = 0.12

// Uniform SEG for the whole window — never mix resolutions (white lines).
function segsForQuality(quality) {
  if (quality === 'off') return 20
  if (quality === 'half') return 32
  return 48 // G2.3: slightly denser full quality
}

const LOW = new THREE.Color('#38571d')
const HIGH = new THREE.Color('#8bb352')
const DRY = new THREE.Color('#a98f52')

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

    const t = THREE.MathUtils.clamp((h + 7.5) / 15, 0, 1)
    const jitter = (Math.sin(x * 12.9 + z * 78.2) * 0.5 + 0.5) * 0.1
    c.copy(LOW).lerp(HIGH, THREE.MathUtils.clamp(t * 0.7 + jitter, 0, 1))
    const slope = Math.min(Math.hypot(hx, hz) / (2 * e), 1)
    c.lerp(DRY, slope * 0.28)
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
        roughness={1}
        metalness={0}
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
