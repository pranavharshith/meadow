import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { P, look, keys, treeRegistry, rockRegistry } from '../player-state'
import { useStore } from '../store'
import AvatarMesh from './AvatarMesh'

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
  const color = useStore((s) => s.color)
  const view = useStore((s) => s.viewMode)

  const fwd = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const move = useMemo(() => new THREE.Vector3(), [])
  const velocity = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05)

    // expire one-shot wave emote
    if (P.emote === 'wave' && performance.now() > P.emoteUntil) P.emote = null
    const sitting = P.emote === 'sit'
    const waving = P.emote === 'wave'

    let ix = 0
    let iy = 0
    if (!sitting) {
      if (keys['KeyW'] || keys['ArrowUp']    || keys['JoyUp'])    iy += 1
      if (keys['KeyS'] || keys['ArrowDown']  || keys['JoyDown'])  iy -= 1
      if (keys['KeyD'] || keys['ArrowRight'] || keys['JoyRight']) ix += 1
      if (keys['KeyA'] || keys['ArrowLeft']  || keys['JoyLeft'])  ix -= 1
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
    
    const targetSpeed = run ? RUN : WALK
    const damping = run ? 8 : 10
    const accel = targetSpeed * damping

    // Apply acceleration
    if (move.lengthSq() > 0.01) {
      move.normalize()
      velocity.addScaledVector(move, accel * step)
    }

    // Apply exact friction (damping)
    velocity.multiplyScalar(Math.exp(-damping * step))

    P.moving = velocity.lengthSq() > 0.01

    if (P.moving) {
      let nx = P.pos.x + velocity.x * step
      let nz = P.pos.z + velocity.z * step
      ;[nx, nz] = pushOut(nx, nz)
      P.pos.x = nx
      P.pos.z = nz
      P.avatarYaw = Math.atan2(velocity.x, velocity.z)
    }
    // When waving, face the camera direction (toward other players you're looking at)
    if (waving) {
      P.avatarYaw = look.yaw
    }
    // Ground the player on whichever surface is highest at their XZ:
    // inside the Meadow Gate plaza the raised step geometry sits above raw
    // terrain, so we must use the plaza floor height there instead of the
    // terrain noise (which would put the player underground).
    const plazaY = plazaFloorHeight(P.pos.x, P.pos.z)
    P.pos.y = plazaY !== null ? plazaY : terrainHeight(P.pos.x, P.pos.z)

    const g = groupRef.current
    g.position.set(P.pos.x, P.pos.y, P.pos.z)
    g.rotation.y = dampAngle(g.rotation.y, P.avatarYaw, 10, step)
    g.visible = view !== 'first'
  })

  return (
    <group ref={groupRef}>
      <AvatarMesh 
        color={color} 
        moving={P.moving} 
        sitting={P.emote === 'sit'} 
        waving={P.emote === 'wave'} 
        run={useStore.getState().joystickEnabled ? Math.hypot(move.x, move.z) > 0.8 : false} 
      />
    </group>
  )
}
