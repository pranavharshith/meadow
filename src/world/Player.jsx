import * as THREE from 'three'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { terrainHeight, walkSurfaceHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import {
  P, look, keys, treeRegistry, rockRegistry, landmarkColliders, addRipple,
} from '../player-state'
import { useStore } from '../store'
import AvatarMesh from './AvatarMesh'
import { deformTerrain } from './deform'
import { isOverWater } from './water-path'
import { terrainSegmentsFor } from './scene/contracts/quality'
import { sampleTerrainMeshHeight } from './scene/terrain/terrain-surface'

const UP = new THREE.Vector3(0, 1, 0)
const WALK = 4.2
const RUN = 9
const SUBSTEP = 0.3
const MAX_CLIMB_RATIO = 2.2

// One authoritative walk height: plaza slab first, otherwise the exact rendered
// terrain facet, preserving any water-wade lift so the player wades rather than
// sinking to the bed. Keeps player, grass, and camera on the same surface.
export function samplePlayerSurface(x, z, segments) {
  const plazaY = plazaFloorHeight(x, z)
  if (plazaY !== null) return plazaY
  const meshY = sampleTerrainMeshHeight(x, z, segments)
  const wadeLift = walkSurfaceHeight(x, z) - terrainHeight(x, z)
  return meshY + (wadeLift > 0 ? wadeLift : 0)
}

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
  // Landmark volumes (windmill, lighthouse, ruins…) — G3.4
  for (let i = 0; i < landmarkColliders.length; i++) {
    const c = landmarkColliders[i]
    const dx = x - c.x
    const dz = z - c.z
    const rr = c.r + 0.35
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

    if (view === 'top' || view === 'drone') {
      // Overhead views have no on-screen "forward" from yaw, so map movement to
      // world axes: pushing up always walks away on screen.
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

    const segments = terrainSegmentsFor(st.grassDensity)

    if (P.moving) {
      // Integrate in short substeps so fast/downhill movement follows the
      // terrain triangles instead of tunnelling across them.
      const totalX = velocity.x * step
      const totalZ = velocity.z * step
      const subCount = Math.max(1, Math.ceil(Math.hypot(totalX, totalZ) / SUBSTEP))
      const invSub = 1 / subCount

      let curX = P.pos.x
      let curZ = P.pos.z
      let curSurface = samplePlayerSurface(curX, curZ, segments)

      for (let s = 0; s < subCount; s++) {
        let nx = curX + totalX * invSub
        let nz = curZ + totalZ * invSub

        const inPlaza = plazaFloorHeight(nx, nz) !== null
        if (!inPlaza) {
          const e = 0.5
          const hx = samplePlayerSurface(nx + e, nz, segments) - samplePlayerSurface(nx - e, nz, segments)
          const hz = samplePlayerSurface(nx, nz + e, segments) - samplePlayerSurface(nx, nz - e, segments)
          const gradX = hx / (2 * e)
          const gradZ = hz / (2 * e)
          const slope = Math.hypot(gradX, gradZ)
          const MAX_SLOPE = 1.5
          if (slope > MAX_SLOPE) {
            const slide = (slope - MAX_SLOPE) * 20.0
            nx -= (gradX / slope) * slide * step * invSub
            nz -= (gradZ / slope) * slide * step * invSub
          }
        }

        ;[nx, nz] = pushOut(nx, nz)

        // Reject a substep that would scale a near-vertical wall.
        const nextSurface = samplePlayerSurface(nx, nz, segments)
        const stepDist = Math.hypot(nx - curX, nz - curZ)
        if (stepDist > 1e-5 && Math.abs(nextSurface - curSurface) / stepDist > MAX_CLIMB_RATIO) break

        curX = nx
        curZ = nz
        curSurface = nextSurface
      }

      const distMoved = Math.hypot(curX - P.pos.x, curZ - P.pos.z)
      P.pos.x = curX
      P.pos.z = curZ
      P.avatarYaw = Math.atan2(velocity.x, velocity.z)

      lastDeformDist.current += distMoved
      if (lastDeformDist.current > 0.8) {
        lastDeformDist.current = 0
        if (isOverWater(curX, curZ)) {
          const intensity = Math.min(1.0, velocity.length() / WALK)
          addRipple(curX, curZ, clock.elapsedTime, intensity)
        } else if (plazaFloorHeight(curX, curZ) === null) {
          deformTerrain(curX, curZ)
        }
      }
    }
    // Ground to the exact rendered surface. Tiny foot lift avoids toe clip.
    const FOOT_LIFT = 0.03
    P.pos.y = samplePlayerSurface(P.pos.x, P.pos.z, segments) + FOOT_LIFT

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
