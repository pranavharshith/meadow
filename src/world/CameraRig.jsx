import * as THREE from 'three'
import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { P, look } from '../player-state'
import { useStore } from '../store'

const THIRD_DIST = 7
const TOP_HEIGHT = 80
const NORMAL_LAMBDA = 6 // steady-state damping speed
const SWITCH_LAMBDA = 2.2 // slower damping during view transition
const SWITCH_DURATION = 0.5 // seconds of slow ease after switching

// Positions the camera each frame based on the active view, with smooth
// damping so switching views and cresting hills feels gentle. On view switch
// the damping temporarily slows for a cinematic ease-in.
export default function CameraRig() {
  const { camera } = useThree()
  const view = useStore((s) => s.viewMode)

  const curPos = useMemo(() => {
    const cp = Math.cos(look.pitch)
    const dist = THIRD_DIST * look.zoom
    const plazaY = plazaFloorHeight(P.pos.x, P.pos.z)
    const groundY = plazaY !== null ? plazaY : terrainHeight(P.pos.x, P.pos.z)
    // Actually set P.pos.y correctly here too, so the target aligns perfectly
    P.pos.y = groundY
    return new THREE.Vector3(
      P.pos.x - Math.sin(look.yaw) * cp * dist,
      groundY + 1.3 + Math.sin(look.pitch) * dist,
      P.pos.z - Math.cos(look.yaw) * cp * dist
    )
  }, [])
  const curTarget = useMemo(() => new THREE.Vector3(P.pos.x, P.pos.y + 1.3, P.pos.z), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const head = useMemo(() => new THREE.Vector3(), [])

  // Track view switch timing for smooth transition
  const switchTimer = useRef(0)
  const prevView = useRef(view)

  useLayoutEffect(() => {
    // Snap camera to the initial position *before* the first frame renders,
    // otherwise React Three Fiber renders frame 1 at the default (0, 0, 5)
    // before useFrame takes over, causing a one-frame visual glitch.
    camera.position.copy(curPos)
    camera.lookAt(curTarget)
  }, [camera, curPos, curTarget])

  useEffect(() => {
    if (view !== prevView.current) {
      switchTimer.current = SWITCH_DURATION
      prevView.current = view
    }
  }, [view])

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)

    // Decay switch timer
    if (switchTimer.current > 0) switchTimer.current -= step

    // Auto-follow camera: gently rotate camera to look at the player's back when moving
    if (P.moving && view !== 'top' && view !== 'first' && performance.now() - look.lastLookTime > 1500) {
      let diff = P.avatarYaw - look.yaw
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      
      if (Math.abs(diff) > 0.01) {
        look.yaw += diff * (1 - Math.exp(-2.0 * step))
      }
    }

    // Blend between slow (switch) and normal damping
    const blend = Math.max(switchTimer.current / SWITCH_DURATION, 0)
    const lambda = THREE.MathUtils.lerp(NORMAL_LAMBDA, SWITCH_LAMBDA, blend)
    const k = 1 - Math.exp(-lambda * step)

    const targetHeadY = P.pos.y + (P.emote === 'sit' ? 0.7 : 1.3)
    head.set(P.pos.x, targetHeadY, P.pos.z)

    if (view === 'first') {
      pos.copy(head)
      target.set(
        head.x + Math.sin(look.yaw) * Math.cos(look.pitch),
        head.y - Math.sin(look.pitch), // Fixed inverted pitch!
        head.z + Math.cos(look.yaw) * Math.cos(look.pitch)
      )
    } else if (view === 'top') {
      pos.set(P.pos.x, P.pos.y + TOP_HEIGHT * look.zoom, P.pos.z + 0.01)
      target.set(P.pos.x, P.pos.y, P.pos.z)
    } else if (view === 'drone') {
      pos.set(P.pos.x, P.pos.y + (TOP_HEIGHT * 0.45) * look.zoom, P.pos.z + 0.01)
      target.set(P.pos.x, P.pos.y, P.pos.z)
    } else {
      const cp = Math.cos(look.pitch)
      const dist = THIRD_DIST * look.zoom
      pos.set(
        P.pos.x - Math.sin(look.yaw) * cp * dist,
        targetHeadY + Math.sin(look.pitch) * dist,
        P.pos.z - Math.cos(look.yaw) * cp * dist
      )
      target.copy(head)
    }

    curPos.lerp(pos, k)
    curTarget.lerp(target, k)
    
    // Post-lerp collision check: prevent camera from dipping under terrain or plaza structures
    // (We do this on curPos to prevent clipping during fast movement or view transitions)
    const plazaY = plazaFloorHeight(curPos.x, curPos.z)
    const floorY = plazaY !== null ? plazaY : terrainHeight(curPos.x, curPos.z)
    if (curPos.y < floorY + 0.6 && view !== 'top') {
      curPos.y = floorY + 0.6
    }

    camera.position.copy(curPos)
    camera.lookAt(curTarget)
  })

  return null
}
