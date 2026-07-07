import * as THREE from 'three'
import { useMemo } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { terrainHeight } from './noise'
import { P, look } from '../player-state'
import { useStore } from '../store'

const THIRD_DIST = 7
const TOP_HEIGHT = 80

// Positions the camera each frame based on the active view, with smooth
// damping so switching views and cresting hills feels gentle.
export default function CameraRig() {
  const { camera } = useThree()
  const view = useStore((s) => s.viewMode)

  const curPos = useMemo(() => new THREE.Vector3(0, 4, 10), [])
  const curTarget = useMemo(() => new THREE.Vector3(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const head = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.05))
    head.set(P.pos.x, P.pos.y + 1.3, P.pos.z)

    if (view === 'first') {
      pos.copy(head)
      target.set(
        head.x + Math.sin(look.yaw) * Math.cos(look.pitch),
        head.y + Math.sin(look.pitch),
        head.z + Math.cos(look.yaw) * Math.cos(look.pitch)
      )
    } else if (view === 'top') {
      pos.set(P.pos.x, P.pos.y + TOP_HEIGHT * look.zoom, P.pos.z + 0.01)
      target.set(P.pos.x, P.pos.y, P.pos.z)
    } else {
      const cp = Math.cos(look.pitch)
      const dist = THIRD_DIST * look.zoom
      pos.set(
        P.pos.x - Math.sin(look.yaw) * cp * dist,
        P.pos.y + 1.3 + Math.sin(look.pitch) * dist,
        P.pos.z - Math.cos(look.yaw) * cp * dist
      )
      target.copy(head)
      // keep camera from dipping under the ground
      const g = terrainHeight(pos.x, pos.z) + 0.6
      if (pos.y < g) pos.y = g
    }

    curPos.lerp(pos, view === 'top' ? k * 0.8 : k)
    curTarget.lerp(target, k)
    camera.position.copy(curPos)
    camera.lookAt(curTarget)
  })

  return null
}
