import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { remotePlayers } from '../net/state'
import AvatarMesh from './AvatarMesh'

// Renders everyone else in your region: capsule avatars that smoothly
// interpolate toward their last broadcast position, with a floating name and a
// chat bubble when they speak. The id list refreshes on a slow interval (people
// don't join/leave every frame) while transforms update every frame.
function RemoteAvatar({ id }) {
  const groupRef = useRef()
  const [, force] = useState(0)
  const bubbleRef = useRef({ text: '', shown: false })

  useFrame((_, dt) => {
    const rp = remotePlayers.get(id)
    const g = groupRef.current
    if (!rp || !g) return

    const k = 1 - Math.exp(-10 * Math.min(dt, 0.05))
    
    // Calculate if they are moving (before applying interpolation)
    rp.moving = Math.hypot(rp.tx - rp.x, rp.tz - rp.z) > 0.05
    rp.running = rp.moving // use run animation if moving for remote players for simplicity

    rp.x += (rp.tx - rp.x) * k
    rp.z += (rp.tz - rp.z) * k
    let dy = rp.tyaw - rp.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    rp.yaw += dy * k

    const plazaY = plazaFloorHeight(rp.x, rp.z)
    const y = plazaY !== null ? plazaY : terrainHeight(rp.x, rp.z)
    g.position.set(rp.x, y, rp.z)
    g.rotation.y = rp.yaw

    // toggle bubble visibility (drives a cheap re-render only on change)
    const show = rp.msgUntil > performance.now()
    if (show !== bubbleRef.current.shown || rp.msg !== bubbleRef.current.text) {
      bubbleRef.current = { text: rp.msg, shown: show }
      force((n) => n + 1)
    }
  })

  const rp = remotePlayers.get(id)
  const name = rp ? rp.name : ''
  const bubble = bubbleRef.current

  return (
    <group ref={groupRef}>
      {rp && (
        <AvatarMesh color={rp.color} state={rp} />
      )}
      <Html position={[0, 1.7, 0]} center distanceFactor={12} zIndexRange={[5, 0]} occlude={false}>
        <div className="nameplate">{name}</div>
        {bubble.shown && bubble.text ? <div className="bubble">{bubble.text}</div> : null}
      </Html>
    </group>
  )
}

export default function RemotePlayers() {
  const [ids, setIds] = useState([])

  useEffect(() => {
    const tick = () => {
      const cur = Array.from(remotePlayers.keys())
      setIds((prev) => {
        if (prev.length === cur.length && prev.every((v, i) => v === cur[i])) return prev
        return cur
      })
    }
    const iv = setInterval(tick, 600)
    return () => clearInterval(iv)
  }, [])

  return (
    <group>
      {ids.map((id) => (
        <RemoteAvatar key={id} id={id} />
      ))}
    </group>
  )
}
