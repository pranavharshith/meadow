import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { P, look, keys, treeRegistry, rockRegistry } from '../player-state'
import { useStore } from '../store'

const UP = new THREE.Vector3(0, 1, 0)
const WALK = 4.2
const RUN = 9

function dampAngle(current, target, lambda, dt) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

// Resolve soft collision against nearby tree trunks and rocks.
function pushOut(x, z) {
  for (let i = 0; i < treeRegistry.length; i++) {
    const t = treeRegistry[i]
    const dx = x - t.x
    const dz = z - t.z
    const rr = t.r + 0.45
    const d2 = dx * dx + dz * dz
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2)
      const push = rr - d
      x += (dx / d) * push
      z += (dz / d) * push
    }
  }
  for (let i = 0; i < rockRegistry.length; i++) {
    const r = rockRegistry[i]
    const dx = x - r.x
    const dz = z - r.z
    const rr = r.r + 0.4
    const d2 = dx * dx + dz * dz
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2)
      const push = rr - d
      x += (dx / d) * push
      z += (dz / d) * push
    }
  }
  return [x, z]
}

export default function Player() {
  const groupRef = useRef()
  const bobRef = useRef()
  const armLRef = useRef()
  const armRRef = useRef()
  const color = useStore((s) => s.color)
  const view = useStore((s) => s.viewMode)

  const fwd = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const move = useMemo(() => new THREE.Vector3(), [])

  const legLRef = useRef()
  const legRRef = useRef()

  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }), [color])
  const headMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(new THREE.Color('#fff'), 0.18), roughness: 0.6 }),
    [color]
  )

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05)

    // expire one-shot wave emote
    if (P.emote === 'wave' && performance.now() > P.emoteUntil) P.emote = null
    const sitting = P.emote === 'sit'
    const waving = P.emote === 'wave'

    let ix = 0
    let iy = 0
    if (!sitting) {
      if (keys['KeyW'] || keys['ArrowUp']) iy += 1
      if (keys['KeyS'] || keys['ArrowDown']) iy -= 1
      if (keys['KeyD'] || keys['ArrowRight']) ix += 1
      if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1
    }
    const run = keys['ShiftLeft'] || keys['ShiftRight']

    if (view === 'top') {
      fwd.set(0, 0, -1)
      right.set(1, 0, 0)
    } else {
      fwd.set(Math.sin(look.yaw), 0, Math.cos(look.yaw))
      right.crossVectors(fwd, UP).normalize()
    }

    move.set(0, 0, 0).addScaledVector(fwd, iy).addScaledVector(right, ix)
    P.moving = move.lengthSq() > 0.0004

    if (P.moving) {
      move.normalize()
      const speed = (run ? RUN : WALK) * step
      let nx = P.pos.x + move.x * speed
      let nz = P.pos.z + move.z * speed
      ;[nx, nz] = pushOut(nx, nz)
      P.pos.x = nx
      P.pos.z = nz
      P.avatarYaw = Math.atan2(move.x, move.z)
    }
    // When waving, face the camera direction (toward other players you're looking at)
    if (waving) {
      P.avatarYaw = look.yaw
    }
    P.pos.y = terrainHeight(P.pos.x, P.pos.z)

    const g = groupRef.current
    g.position.set(P.pos.x, P.pos.y, P.pos.z)
    g.rotation.y = dampAngle(g.rotation.y, P.avatarYaw, 10, step)
    g.visible = view !== 'first'

    const t = clock.elapsedTime
    const bg = bobRef.current
    if (sitting) {
      // settle down: sink and lean back a touch
      bg.position.y = THREE.MathUtils.lerp(bg.position.y, -0.34, 1 - Math.exp(-8 * step))
      bg.rotation.z = THREE.MathUtils.lerp(bg.rotation.z, 0, 1 - Math.exp(-8 * step))
      bg.rotation.x = THREE.MathUtils.lerp(bg.rotation.x, -0.12, 1 - Math.exp(-8 * step))
    } else {
      // gentle walk bob
      bg.position.y = P.moving ? Math.abs(Math.sin(t * 9)) * 0.06 : THREE.MathUtils.lerp(bg.position.y, 0, 1 - Math.exp(-8 * step))
      bg.rotation.z = P.moving ? Math.sin(t * 9) * 0.03 : 0
      bg.rotation.x = THREE.MathUtils.lerp(bg.rotation.x, 0, 1 - Math.exp(-8 * step))
    }

    // arms: wave toward camera direction with both arms, otherwise rest / swing
    if (armRRef.current && armLRef.current) {
      if (waving) {
        // Right arm: big enthusiastic wave; left arm: slight supportive raise
        armRRef.current.rotation.z = -2.4 + Math.sin(t * 14) * 0.4
        armLRef.current.rotation.z = 0.6 + Math.sin(t * 14 + 1.5) * 0.15
      } else if (P.moving) {
        armRRef.current.rotation.z = Math.sin(t * 9) * 0.35
        armLRef.current.rotation.z = -Math.sin(t * 9) * 0.35
      } else {
        armRRef.current.rotation.z = THREE.MathUtils.lerp(armRRef.current.rotation.z, 0.12, 1 - Math.exp(-8 * step))
        armLRef.current.rotation.z = THREE.MathUtils.lerp(armLRef.current.rotation.z, -0.12, 1 - Math.exp(-8 * step))
      }
    }

    // legs: swing forward/back opposite to each other while walking
    if (legLRef.current && legRRef.current) {
      if (sitting) {
        // legs bend forward when sitting
        legLRef.current.rotation.x = THREE.MathUtils.lerp(legLRef.current.rotation.x, -1.2, 1 - Math.exp(-8 * step))
        legRRef.current.rotation.x = THREE.MathUtils.lerp(legRRef.current.rotation.x, -1.2, 1 - Math.exp(-8 * step))
      } else if (P.moving) {
        const legSpeed = run ? 12 : 9
        legLRef.current.rotation.x = Math.sin(t * legSpeed) * 0.45
        legRRef.current.rotation.x = -Math.sin(t * legSpeed) * 0.45
      } else {
        legLRef.current.rotation.x = THREE.MathUtils.lerp(legLRef.current.rotation.x, 0, 1 - Math.exp(-8 * step))
        legRRef.current.rotation.x = THREE.MathUtils.lerp(legRRef.current.rotation.x, 0, 1 - Math.exp(-8 * step))
      }
    }
  })

  return (
    <group ref={groupRef}>
      <group ref={bobRef}>
        <mesh position={[0, 0.62, 0]} material={bodyMat} castShadow>
          <capsuleGeometry args={[0.26, 0.5, 4, 12]} />
        </mesh>
        <mesh position={[0, 1.18, 0]} material={headMat} castShadow>
          <sphereGeometry args={[0.22, 16, 16]} />
        </mesh>
        {/* arms hinge at the shoulder */}
        <group ref={armRRef} position={[0.28, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} material={bodyMat} castShadow>
            <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
          </mesh>
        </group>
        <group ref={armLRef} position={[-0.28, 0.92, 0]}>
          <mesh position={[0, -0.2, 0]} material={bodyMat} castShadow>
            <capsuleGeometry args={[0.075, 0.34, 4, 8]} />
          </mesh>
        </group>
        {/* legs hinge at the hip */}
        <group ref={legLRef} position={[0.12, 0.22, 0]}>
          <mesh position={[0, -0.22, 0]} material={bodyMat} castShadow>
            <capsuleGeometry args={[0.09, 0.32, 4, 8]} />
          </mesh>
        </group>
        <group ref={legRRef} position={[-0.12, 0.22, 0]}>
          <mesh position={[0, -0.22, 0]} material={bodyMat} castShadow>
            <capsuleGeometry args={[0.09, 0.32, 4, 8]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
