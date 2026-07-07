import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { terrainHeight } from './noise'
import { remotePlayers } from '../net/state'

// Renders everyone else in your region: capsule avatars that smoothly
// interpolate toward their last broadcast position, with a floating name and a
// chat bubble when they speak. The id list refreshes on a slow interval (people
// don't join/leave every frame) while transforms update every frame.
function RemoteAvatar({ id }) {
  const groupRef = useRef()
  const bobRef = useRef()
  const [, force] = useState(0)
  const bubbleRef = useRef({ text: '', shown: false })

  const bodyMat = useRef(new THREE.MeshStandardMaterial({ color: '#a9d98a', roughness: 0.7 }))
  const headMat = useRef(new THREE.MeshStandardMaterial({ color: '#c8e6a8', roughness: 0.6 }))
  const lastColor = useRef('')

  useFrame((_, dt) => {
    const rp = remotePlayers.get(id)
    const g = groupRef.current
    if (!rp || !g) return

    if (rp.color !== lastColor.current) {
      lastColor.current = rp.color
      bodyMat.current.color.set(rp.color)
      headMat.current.color.set(new THREE.Color(rp.color).lerp(new THREE.Color('#fff'), 0.18))
    }

    const k = 1 - Math.exp(-10 * Math.min(dt, 0.05))
    rp.x += (rp.tx - rp.x) * k
    rp.z += (rp.tz - rp.z) * k
    let dy = rp.tyaw - rp.yaw
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    rp.yaw += dy * k

    const y = terrainHeight(rp.x, rp.z)
    g.position.set(rp.x, y, rp.z)
    g.rotation.y = rp.yaw

    const sitting = rp.emote === 'sit'
    if (bobRef.current) {
      bobRef.current.position.y = sitting ? -0.34 : 0
    }

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
      <group ref={bobRef}>
        <mesh position={[0, 0.62, 0]} material={bodyMat.current} castShadow>
          <capsuleGeometry args={[0.26, 0.5, 4, 12]} />
        </mesh>
        <mesh position={[0, 1.18, 0]} material={headMat.current} castShadow>
          <sphereGeometry args={[0.22, 16, 16]} />
        </mesh>
      </group>
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
