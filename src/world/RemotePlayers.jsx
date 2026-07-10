import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { terrainHeight } from './noise'
import { plazaFloorHeight } from './SpawnPlaza'
import { remotePlayers } from '../net/state'
import { CHUNK } from './chunk'
import { P } from '../player-state'
import { useStore } from '../store'
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
        <AvatarMesh color={rp.color} headColor={rp.headColor} bodyColor={rp.bodyColor} legColor={rp.legColor} hatId={rp.hatId} state={rp} />
      )}
      <Html position={[0, 1.7, 0]} center distanceFactor={12} zIndexRange={[5, 0]} occlude={false}>
        <div className="nameplate" onDoubleClick={() => useStore.getState().setProfileModal(id)} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>{name}</div>
        {bubble.shown && bubble.text ? <div className="bubble">{bubble.text}</div> : null}
      </Html>
    </group>
  )
}

export default function RemotePlayers() {
  const [ids, setIds] = useState([])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const pCx = Math.floor(P.pos.x / CHUNK)
      const pCz = Math.floor(P.pos.z / CHUNK)
      
      const candidates = []
      for (const [id, rp] of remotePlayers.entries()) {
        // 1. TTL Cleanup (10 seconds)
        if (rp.lastSeen && now - rp.lastSeen > 10000) {
          remotePlayers.delete(id)
          continue
        }

        // 2. Spatial Hashing (only care about 3x3 chunk grid)
        const cx = Math.floor(rp.x / CHUNK)
        const cz = Math.floor(rp.z / CHUNK)
        if (Math.abs(cx - pCx) <= 1 && Math.abs(cz - pCz) <= 1) {
          candidates.push(rp)
        }
      }

      candidates.sort((a, b) => {
        const da = (a.x - P.pos.x) ** 2 + (a.z - P.pos.z) ** 2
        const db = (b.x - P.pos.x) ** 2 + (b.z - P.pos.z) ** 2
        return da - db
      })
      const cur = candidates.slice(0, 20).map(p => p.id)
      
      const st = useStore.getState()
      if (st.setRenderedCount) st.setRenderedCount(cur.length)

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
