import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32, clusterField } from './noise'
import { CHUNK, seedFor } from './chunk'
import { windTime, windStrength } from '../wind'
import { P } from '../player-state'
import { useStore } from '../store'
import { PLAZA_OUTER_RADIUS } from './SpawnPlaza'

const BLADES_FULL = 3400
const BLADES_HALF = 1700
const FLOWERS_PER_CHUNK = 60
const FLOWER_PALETTE = ['#ffffff', '#fff2b0', '#ffd1e8', '#e6d4ff', '#fff7d6', '#ffb3c1']

function GrassChunk({ cx, cz, bladeGeo, bladeMat, flowerGeo, flowerMat, bladeCount }) {
  const grassRef = useRef()
  const flowerRef = useRef()
  const bladesData = useRef([])
  const flowersData = useRef([])

  useLayoutEffect(() => {
    const d = new THREE.Object3D()
    bladesData.current = []
    flowersData.current = []

    // Per-chunk bounding sphere so InstancedMesh frustum culling actually
    // works. The shared blade geometry has a tiny local bound; without this
    // override three.js would either cull everything or nothing.
    const centerX = cx * CHUNK + CHUNK / 2
    const centerZ = cz * CHUNK + CHUNK / 2
    // sqrt(2)*CHUNK/2 ≈ 71, plus blade height + terrain undulation headroom
    const bound = new THREE.Sphere(new THREE.Vector3(centerX, 0, centerZ), 80)
    grassRef.current.boundingSphere = bound
    flowerRef.current.boundingSphere = bound.clone()

    const rngG = mulberry32(seedFor(cx, cz) ^ 0xa1)
    for (let i = 0; i < bladeCount; i++) {
      const x    = cx * CHUNK + rngG() * CHUNK
      const z    = cz * CHUNK + rngG() * CHUNK
      // Pre-consume all RNG values before branching so the seeded sequence
      // stays stable — this ensures surrounding chunk patterns are unchanged.
      const lush = clusterField(x, z)
      const rotY = rngG() * Math.PI
      const rotZ = (rngG() - 0.5) * 0.25
      const scX  = 0.8 + rngG() * 0.4
      const scY  = 0.7 + rngG() * 0.9 + lush * 0.8

      // Suppress blades inside the Meadow Gate plaza stone floor (fix #9)
      if (Math.hypot(x, z) < PLAZA_OUTER_RADIUS) {
        d.position.set(0, -9999, 0)
        d.scale.setScalar(0.0001)
        d.updateMatrix()
        grassRef.current.setMatrixAt(i, d.matrix)
        continue
      }

      d.position.set(x, terrainHeight(x, z), z)
      d.rotation.set(0, rotY, rotZ)
      d.scale.set(scX, scY, 1)
      d.updateMatrix()
      grassRef.current.setMatrixAt(i, d.matrix)
      bladesData.current.push({ x: d.position.x, y: d.position.y, z: d.position.z, matrix: d.matrix.clone() })
    }
    grassRef.current.count = bladeCount
    grassRef.current.instanceMatrix.needsUpdate = true

    const rngF = mulberry32(seedFor(cx, cz) ^ 0xf1)
    for (let i = 0; i < FLOWERS_PER_CHUNK; i++) {
      const x = cx * CHUNK + rngF() * CHUNK
      const z = cz * CHUNK + rngF() * CHUNK
      if (clusterField(x, z) < 0.6) continue

      if (Math.hypot(x, z) < PLAZA_OUTER_RADIUS) {
        d.position.set(0, -9999, 0)
        d.scale.setScalar(0.0001)
        d.updateMatrix()
        flowerRef.current.setMatrixAt(i, d.matrix)
        continue
      }

      d.position.set(x, terrainHeight(x, z) + 0.1, z)
      d.rotation.set(0, rngF() * Math.PI, 0)
      const s = 0.5 + rngF() * 0.5
      d.scale.setScalar(s)
      d.updateMatrix()
      flowerRef.current.setMatrixAt(i, d.matrix)
      
      const c = new THREE.Color(FLOWER_PALETTE[(rngF() * FLOWER_PALETTE.length) | 0])
      flowerRef.current.setColorAt(i, c)
      flowersData.current.push({ x: d.position.x, y: d.position.y, z: d.position.z, matrix: d.matrix.clone(), color: c })
    }

    grassRef.current.instanceMatrix.needsUpdate = true
    flowerRef.current.instanceMatrix.needsUpdate = true
    if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true
  }, [cx, cz, bladeCount])

  // Dynamic Frustum Culling (Fix 5.5)
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const projScreenMatrix = useMemo(() => new THREE.Matrix4(), [])
  
  useFrame(({ camera }) => {
    if (!grassRef.current || !flowerRef.current) return
    
    camera.updateMatrixWorld()
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projScreenMatrix)

    let gCount = 0
    for (let i = 0; i < bladesData.current.length; i++) {
      const b = bladesData.current[i]
      if (frustum.containsPoint(b)) {
        grassRef.current.setMatrixAt(gCount++, b.matrix)
      }
    }
    grassRef.current.count = gCount
    grassRef.current.instanceMatrix.needsUpdate = true

    let fCount = 0
    for (let i = 0; i < flowersData.current.length; i++) {
      const f = flowersData.current[i]
      if (frustum.containsPoint(f)) {
        flowerRef.current.setMatrixAt(fCount, f.matrix)
        flowerRef.current.setColorAt(fCount, f.color)
        fCount++
      }
    }
    flowerRef.current.count = fCount
    flowerRef.current.instanceMatrix.needsUpdate = true
    if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={grassRef} args={[bladeGeo, bladeMat, BLADES_FULL]} />
      <instancedMesh ref={flowerRef} args={[flowerGeo, flowerMat, FLOWERS_PER_CHUNK]} />
    </group>
  )
}

export default function GrassField() {
  const [center, setCenter] = useState({ cx: 0, cz: 0 })
  // Auto-scale tier: 0 = full, 1 = half, 2 = quarter. Only ever tightens
  // relative to the user's chosen density; never overrides "off".
  const [autoTier, setAutoTier] = useState(0)
  const grassDensity = useStore((s) => s.grassDensity)

  // Running frametime EMA for auto-scaling. Kept in refs so the frame loop
  // doesn't cause re-renders.
  const emaMs = useRef(16.6)
  const badFor = useRef(0)  // seconds spent below the FPS floor
  const goodFor = useRef(0) // seconds spent above the recovery ceiling

  useFrame((_, dt) => {
    if (grassDensity === 'off') return

    // Chunk streaming
    const cx = Math.floor(P.pos.x / CHUNK)
    const cz = Math.floor(P.pos.z / CHUNK)
    if (cx !== center.cx || cz !== center.cz) setCenter({ cx, cz })

    // Frametime EMA (dt is in seconds, we track ms). Skip absurd spikes
    // (tab switch, alert) so a single 500ms hitch doesn't trigger downshift.
    const ms = Math.min(dt * 1000, 100)
    emaMs.current = emaMs.current * 0.92 + ms * 0.08

    // < ~45 FPS sustained → step down. > ~70 FPS sustained → step back up.
    // Hysteresis via separate accumulators prevents oscillation on the edge.
    if (emaMs.current > 22) {
      badFor.current += dt
      goodFor.current = 0
      if (badFor.current > 2.5 && autoTier < 2) {
        badFor.current = 0
        setAutoTier(autoTier + 1)
      }
    } else if (emaMs.current < 14) {
      goodFor.current += dt
      badFor.current = 0
      if (goodFor.current > 6 && autoTier > 0) {
        goodFor.current = 0
        setAutoTier(autoTier - 1)
      }
    } else {
      badFor.current = Math.max(0, badFor.current - dt * 0.5)
      goodFor.current = Math.max(0, goodFor.current - dt * 0.5)
    }
  })

  // Final blade count = user setting × auto tier scale.
  const userBase = grassDensity === 'half' ? BLADES_HALF : BLADES_FULL
  const autoScale = autoTier === 0 ? 1 : autoTier === 1 ? 0.5 : 0.25
  const bladeCount = Math.max(200, Math.floor(userBase * autoScale))

  const bladeGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.09, 0.7, 1, 4)
    g.translate(0, 0.35, 0)
    return g
  }, [])

  const bladeMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 1, metalness: 0 })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windTime
      shader.uniforms.uWind = windStrength
      shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nvarying float vH;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float bh = clamp(position.y / 0.7, 0.0, 1.0);
         vH = bh;
         float infl = pow(bh, 1.6) * uWind;
         vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         float ph = iPos.x * 0.35 + iPos.z * 0.35;
         float sway = sin(uTime * 1.3 + ph) + 0.5 * sin(uTime * 2.7 + ph * 1.6);
         transformed.x += sway * 0.16 * infl;
         transformed.z += cos(uTime * 1.05 + ph) * 0.09 * infl;`
      )
      shader.fragmentShader = 'varying float vH;\n' + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         vec3 baseC = vec3(0.10, 0.24, 0.07);
         vec3 tipC  = vec3(0.56, 0.78, 0.33);
         diffuseColor.rgb = mix(baseC, tipC, vH);`
      )
    }
    return m
  }, [])

  // Flower = two crossed vertical quads so it reads from any angle at eye
  // level (a flat circle vanished when viewed edge-on).
  const flowerGeo = useMemo(() => {
    const a = new THREE.PlaneGeometry(0.22, 0.28)
    a.translate(0, 0.14, 0)
    const b = a.clone()
    b.rotateY(Math.PI / 2)
    return mergeGeometries([a, b])
  }, [])

  const flowerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, metalness: 0 }),
    []
  )

  if (grassDensity === 'off') return null

  const chunks = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const cx = center.cx + dx
      const cz = center.cz + dz
      chunks.push(
        <GrassChunk
          key={`${cx},${cz},${grassDensity}`}
          cx={cx}
          cz={cz}
          bladeGeo={bladeGeo}
          bladeMat={bladeMat}
          flowerGeo={flowerGeo}
          flowerMat={flowerMat}
          bladeCount={bladeCount}
        />
      )
    }
  }

  return <group>{chunks}</group>
}
