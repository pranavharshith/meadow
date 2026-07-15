import * as THREE from 'three'
import { useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { P, look } from '../player-state'
import { useStore } from '../store'
import { samplePlayerSurface } from './Player'
import { terrainSegmentsFor } from './scene/contracts/quality'

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

  // Smoothed camera position/target, seeded once in the layout effect below.
  const curPos = useMemo(() => new THREE.Vector3(), [])
  const curTarget = useMemo(() => new THREE.Vector3(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const head = useMemo(() => new THREE.Vector3(), [])

  // Track view switch timing for smooth transition
  const switchTimer = useRef(0)
  const prevView = useRef(view)

  useLayoutEffect(() => {
    // Seed and snap the camera *before* the first frame renders, otherwise R3F
    // renders frame 1 at the default (0, 0, 5) before useFrame takes over,
    // causing a one-frame visual glitch. Grounding the player here (a plain
    // effect, not a memo side effect) keeps the initial target aligned.
    const cp = Math.cos(look.pitch)
    const dist = THIRD_DIST * look.zoom
    const segments = terrainSegmentsFor(useStore.getState().grassDensity)
    const groundY = samplePlayerSurface(P.pos.x, P.pos.z, segments)
    P.pos.y = groundY + 0.03
    curPos.set(
      P.pos.x - Math.sin(look.yaw) * cp * dist,
      groundY + 1.3 + Math.sin(look.pitch) * dist,
      P.pos.z - Math.cos(look.yaw) * cp * dist,
    )
    curTarget.set(P.pos.x, P.pos.y + 1.3, P.pos.z)
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
    const segments = terrainSegmentsFor(useStore.getState().grassDensity)

    // Decay switch timer
    if (switchTimer.current > 0) switchTimer.current -= step

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

    // Occlusion: if terrain rises between the player and the camera (cresting
    // a hill or backing into a slope), glide the camera in front of it so the
    // view is never buried. Cheap boom march using the same height field the
    // collision clamps already trust.
    if (view !== 'first' && view !== 'top' && view !== 'drone') {
      const SAMPLES = 6
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        const sx = target.x + (pos.x - target.x) * t
        const sz = target.z + (pos.z - target.z) * t
        const sy = target.y + (pos.y - target.y) * t
        const groundY = samplePlayerSurface(sx, sz, segments) + 0.5
        if (sy < groundY) {
          pos.set(sx, Math.max(sy, groundY), sz)
          break
        }
      }
    }

    // Pre-lerp collision check to prevent steady-state jitter.
    // By ensuring the target destination is valid, the lerp smoothly resolves to it
    // without fighting the post-lerp safety clamp.
    const posFloorY = samplePlayerSurface(pos.x, pos.z, segments)
    if (pos.y < posFloorY + 0.6 && view !== 'top') {
      pos.y = posFloorY + 0.6
    }

    // Teleport Snap Check: if the camera target suddenly jumps a massive distance
    // (e.g. > 10 units in one frame), bypass the lerp and snap instantly.
    if (curPos.distanceToSquared(pos) > 100) {
      curPos.copy(pos)
      curTarget.copy(target)
    } else {
      curPos.lerp(pos, k)
      curTarget.lerp(target, k)
    }

    
    // Post-lerp collision check: prevent camera from dipping under terrain or plaza structures
    // (We do this on curPos to prevent clipping during fast movement or view transitions)
    const floorY = samplePlayerSurface(curPos.x, curPos.z, segments)
    if (curPos.y < floorY + 0.6 && view !== 'top') {
      curPos.y = floorY + 0.6
    }

    camera.position.copy(curPos)
    camera.lookAt(curTarget)
  })

  return null
}
