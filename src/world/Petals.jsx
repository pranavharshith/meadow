import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { mulberry32, terrainHeight } from './noise'
import { P } from '../player-state'

const COUNT = 48
const RADIUS = 42
const WIND = new THREE.Vector2(0.9, 0.55)

/** Sparse triangular leaves drifting through the scene without screen clutter. */
export default function Petals() {
  const ref = useRef()
  const windDirection = useMemo(() => WIND.clone().normalize(), [])
  const upwindAngle = useMemo(
    () => Math.atan2(-windDirection.y, -windDirection.x),
    [windDirection],
  )

  const petals = useMemo(() => {
    const random = mulberry32(555)
    return Array.from({ length: COUNT }, () => {
      const angle = random() * Math.PI * 2
      const radius = Math.sqrt(random()) * RADIUS
      return {
        x: Math.cos(angle) * radius,
        z: 6 + Math.sin(angle) * radius,
        height: 0.3 + random() * 1.5,
        phase: random() * Math.PI * 2,
        spin: (random() - 0.5) * 1.5,
        flutter: 0.55 + random() * 0.75,
        speed: 0.55 + random() * 0.55,
        sway: 0.25 + random() * 0.4,
        scale: 0.55 + random() * 0.45,
      }
    })
  }, [])

  const geometry = useMemo(() => new THREE.CircleGeometry(0.07, 3), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e5c99a',
    roughness: 0.95,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  }), [])

  useLayoutEffect(() => {
    const palette = ['#e8d7b2', '#d8b77f', '#cb9873', '#b6a45f']
    const random = mulberry32(556)
    const color = new THREE.Color()
    for (let i = 0; i < COUNT; i++) {
      ref.current.setColorAt(i, color.set(palette[(random() * palette.length) | 0]))
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [])

  const dummy = useMemo(() => new THREE.Object3D(), [])
  const recycleRandom = useRef(mulberry32(777))

  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 0.05)
    const time = clock.elapsedTime
    const playerX = P.pos.x
    const playerZ = P.pos.z
    const radiusSquared = RADIUS * RADIUS

    for (let i = 0; i < COUNT; i++) {
      const petal = petals[i]
      const wobble = Math.sin(time * petal.flutter + petal.phase) * petal.sway
      petal.x += (windDirection.x * petal.speed - windDirection.y * wobble) * step
      petal.z += (windDirection.y * petal.speed + windDirection.x * wobble) * step

      const dx = petal.x - playerX
      const dz = petal.z - playerZ
      if (dx * dx + dz * dz > radiusSquared) {
        const random = recycleRandom.current
        const angle = upwindAngle + (random() - 0.5) * Math.PI
        const radius = RADIUS * (0.78 + random() * 0.22)
        petal.x = playerX + Math.cos(angle) * radius
        petal.z = playerZ + Math.sin(angle) * radius
        petal.height = 0.3 + random() * 1.5
        petal.phase = random() * Math.PI * 2
      }

      const flutterHeight = Math.sin(time * petal.flutter + petal.phase) * 0.16
      dummy.position.set(petal.x, terrainHeight(petal.x, petal.z) + petal.height + flutterHeight, petal.z)
      dummy.rotation.set(
        time * petal.spin * 0.45 + petal.phase,
        time * petal.spin + petal.phase,
        Math.sin(time * petal.flutter + petal.phase) * 0.65,
      )
      dummy.scale.setScalar(petal.scale)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geometry, material, COUNT]} frustumCulled={false} />
}
