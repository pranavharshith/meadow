import * as THREE from 'three'
import { useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, syncTerrainPlots, plotSignatureForChunk } from './noise'
import { CHUNK } from './chunk'
import { P, groundChunks, terrainDeformations } from '../player-state'
import { useStore } from '../store'

const RINGS = 2 // 5×5 window

// LOD segment counts by Chebyshev ring distance (C4)
const SEG_NEAR = 40
const SEG_MID = 26
const SEG_FAR = 16

const LOW = new THREE.Color('#38571d')
const HIGH = new THREE.Color('#8bb352')
const DRY = new THREE.Color('#a98f52')

function segsForRing(dx, dz, quality) {
  const r = Math.max(Math.abs(dx), Math.abs(dz))
  // Mirror grass density as a cheap quality knob
  if (quality === 'off') {
    if (r === 0) return 20
    if (r === 1) return 14
    return 10
  }
  if (quality === 'half') {
    if (r === 0) return 28
    if (r === 1) return 18
    return 12
  }
  if (r === 0) return SEG_NEAR
  if (r === 1) return SEG_MID
  return SEG_FAR
}

function buildGroundGeo(cx, cz, segs) {
  const g = new THREE.PlaneGeometry(CHUNK, CHUNK, segs, segs)
  g.rotateX(-Math.PI / 2)
  const originX = cx * CHUNK + CHUNK / 2
  const originZ = cz * CHUNK + CHUNK / 2
  const pos = g.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const normals = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  const e = 1.5
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + originX
    const z = pos.getZ(i) + originZ
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
    c.lerp(DRY, slope * 0.3)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  // Legacy dent buffers ignored (C2) — clear so old saves don't re-apply junk
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
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  )
}

export default function Terrain() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  const plots = useStore((s) => s.plots)
  const grassDensity = useStore((s) => s.grassDensity)

  // Keep noise plot cache in sync without per-sample store reads (C1)
  useEffect(() => {
    syncTerrainPlots(plots)
  }, [plots])

  useFrame(() => {
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })
  })

  const chunks = []
  for (let dx = -RINGS; dx <= RINGS; dx++) {
    for (let dz = -RINGS; dz <= RINGS; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      const segs = segsForRing(dx, dz, grassDensity)
      // Only plots that touch this chunk force a remesh (C1/C5)
      const plotSig = plotSignatureForChunk(cx, cz, CHUNK)
      chunks.push(
        <GroundChunk
          key={`${cx},${cz},${segs}`}
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
