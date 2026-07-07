import * as THREE from 'three'
import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, mulberry32 } from './noise'
import { P } from '../player-state'

// A handful of flower petals drifting across the meadow on the breeze. They
// live in WORLD space and simply float along the wind; when one drifts too far
// from the player it is recycled on the upwind side, so they always flow past
// you in a natural, patterned stream rather than being glued to the camera.
const COUNT = 150
const RADIUS = 46 // how far a petal may wander before it recycles
const WIND = new THREE.Vector2(0.9, 0.55) // gentle drift direction (world)

export default function Petals() {
  const ref = useRef()

  // normalized wind + the upwind angle (where recycled petals enter from)
  const windDir = useMemo(() => WIND.clone().normalize(), [])
  const upwind = useMemo(
    () => Math.atan2(-windDir.y, -windDir.x),
    [windDir]
  )

  const petals = useMemo(() => {
    const rng = mulberry32(555)
    const arr = []
    const px = 0
    const pz = 6 // matches the player's starting spot
    for (let i = 0; i < COUNT; i++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * RADIUS
      arr.push({
        x: px + Math.cos(a) * r,
        z: pz + Math.sin(a) * r,
        h: 0.4 + rng() * 2.4, // height above the ground
        phase: rng() * Math.PI * 2,
        spin: (rng() - 0.5) * 2,
        flutter: 0.6 + rng() * 0.8,
        speed: 0.7 + rng() * 0.6, // per-petal wind speed for a looser pattern
        sway: 0.4 + rng() * 0.6, // sideways wobble strength
        sc: 0.6 + rng() * 0.6,
      })
    }
    return arr
  }, [])

  const geo = useMemo(() => new THREE.PlaneGeometry(0.16, 0.1), [])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffd9e6',
        emissive: '#ffbcd2',
        emissiveIntensity: 0.15,
        roughness: 0.8,
        side: THREE.DoubleSide,
      }),
    []
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    const col = new THREE.Color()
    const palette = ['#ffffff', '#fff2b0', '#ffd1e8', '#ffb3c1', '#fff7d6']
    const rng = mulberry32(556)
    for (let i = 0; i < COUNT; i++) {
      col.set(palette[(rng() * palette.length) | 0])
      mesh.setColorAt(i, col)
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const d = useMemo(() => new THREE.Object3D(), [])
  const rnd = useRef(mulberry32(777))

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05)
    const t = clock.elapsedTime
    const mesh = ref.current
    const px = P.pos.x
    const pz = P.pos.z
    const r2 = RADIUS * RADIUS

    for (let i = 0; i < COUNT; i++) {
      const p = petals[i]
      // drift along the wind, with a gentle perpendicular wobble so the stream
      // meanders instead of moving in a dead-straight line
      const wob = Math.sin(t * p.flutter + p.phase) * p.sway
      p.x += (windDir.x * p.speed - windDir.y * wob) * step
      p.z += (windDir.y * p.speed + windDir.x * wob) * step

      // recycle upwind when it has floated too far from the player
      const dx = p.x - px
      const dz = p.z - pz
      if (dx * dx + dz * dz > r2) {
        const rng = rnd.current
        const ang = upwind + (rng() - 0.5) * Math.PI // enter from upwind arc
        const rr = RADIUS * (0.75 + rng() * 0.25)
        p.x = px + Math.cos(ang) * rr
        p.z = pz + Math.sin(ang) * rr
        p.h = 0.4 + rng() * 2.4
        p.phase = rng() * Math.PI * 2
      }

      const flutterY = Math.sin(t * p.flutter + p.phase) * 0.25
      const gy = terrainHeight(p.x, p.z) + p.h + flutterY

      d.position.set(p.x, gy, p.z)
      d.rotation.set(
        t * p.spin * 0.6 + p.phase,
        t * p.spin + p.phase,
        Math.sin(t * p.flutter + p.phase) * 0.8
      )
      d.scale.setScalar(p.sc)
      d.updateMatrix()
      mesh.setMatrixAt(i, d.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geo, mat, COUNT]} frustumCulled={false} />
  )
}
