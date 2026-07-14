import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { P, look, keys, treeRegistry, rockRegistry, addRipple } from '../player-state'
import { useStore } from '../store'
import AvatarMesh from './AvatarMesh'
import { deformTerrain } from './deform'
import { isOverWater } from './water-path'

const UP = new THREE.Vector3(0, 1, 0)
const WALK = 4.2
const RUN = 9

function dampAngle(current, target, lambda, dt) {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * (1 - Math.exp(-lambda * dt))
}

// Resolve soft collision against nearby tree trunks, rocks, and the spawn obelisk.
function pushOut(x, z) {
  // Spawn Plaza center obelisk (at 0,0, base radius ~0.72 -> padding to 1.1)
  const d2_obelisk = x * x + z * z
  if (d2_obelisk < 1.21 && d2_obelisk > 1e-6) {
    const d = Math.sqrt(d2_obelisk)
    const push = 1.1 - d
    x += (x / d) * push
    z += (z / d) * push
  }

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
  const headColor = useStore((s) => s.headColor)
  const bodyColor = useStore((s) => s.bodyColor)
  const legColor = useStore((s) => s.legColor)
  const hatId = useStore((s) => s.hatId)
  const view = useStore((s) => s.viewMode)

  const fwd = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const move = useMemo(() => new THREE.Vector3(), [])
  const velocity = useMemo(() => new THREE.Vector3(), [])
  const lastDeformDist = useRef(0)

  useFrame(({ clock }, dt) => {
    const step = Math.min(dt, 0.05)

    // expire one-shot wave emote
    if (P.emote === 'wave' && performance.now() > P.emoteUntil) P.emote = null
    const sitting = P.emote === 'sit'
    const waving = P.emote === 'wave'

    const st = useStore.getState()
    const blockMove = st.createOpen || st.mapOpen

    let ix = 0
    let iy = 0
    if (!sitting && !blockMove) {
      if (keys[st.keybinds.forward] || keys['ArrowUp']    || keys['JoyUp'])    iy += 1
      if (keys[st.keybinds.backward] || keys['ArrowDown']  || keys['JoyDown'])  iy -= 1
      if (keys[st.keybinds.right] || keys['ArrowRight'] || keys['JoyRight']) ix += 1
      if (keys[st.keybinds.left] || keys['ArrowLeft']  || keys['JoyLeft'])  ix -= 1
    }
    const run = !blockMove && (keys['ShiftLeft'] || keys['ShiftRight'])

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
    P.running = run || (useStore.getState().joystickEnabled && Math.hypot(move.x, move.z) > 0.8)

    if (P.moving) {
      let nx = P.pos.x + velocity.x * step
      let nz = P.pos.z + velocity.z * step

      const inPlaza = plazaFloorHeight(nx, nz) !== null
      if (!inPlaza) {
        const e = 0.5
        const hx = terrainHeight(nx + e, nz) - terrainHeight(nx - e, nz)
        const hz = terrainHeight(nx, nz + e) - terrainHeight(nx, nz - e)
        const gradX = hx / (2 * e)
        const gradZ = hz / (2 * e)
        const slope = Math.hypot(gradX, gradZ)
        const MAX_SLOPE = 1.5
        if (slope > MAX_SLOPE) {
          const slide = (slope - MAX_SLOPE) * 20.0
          nx -= (gradX / slope) * slide * step
          nz -= (gradZ / slope) * slide * step
        }
      }

      ;[nx, nz] = pushOut(nx, nz)
      
      const dx = nx - P.pos.x
      const dz = nz - P.pos.z
      const distMoved = Math.hypot(dx, dz)
      
      P.pos.x = nx
      P.pos.z = nz
      P.avatarYaw = Math.atan2(velocity.x, velocity.z)
      
      lastDeformDist.current += distMoved
      if (lastDeformDist.current > 0.8) {
        lastDeformDist.current = 0
        if (isOverWater(nx, nz)) {
          // Send a ripple event to the shader
          // We pass clock.elapsedTime and an intensity factor based on speed
          const intensity = Math.min(1.0, velocity.length() / WALK)
          addRipple(nx, nz, clock.elapsedTime, intensity)
        } else if (!inPlaza) {
          deformTerrain(nx, nz)
        }
      }
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
      <AvatarMesh color={color} headColor={headColor} bodyColor={bodyColor} legColor={legColor} hatId={hatId} state={P} />
    </group>
  )
}
