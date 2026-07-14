import { useEffect, useRef } from 'react'
import { P, look, treeRegistry } from '../player-state'
import { LANDMARKS } from '../world/places'
import { useStore } from '../store'

const SIZE = 150
const RANGE = 100 // world units shown across the map
const SCALE = SIZE / RANGE

// Top-down 100x100 overview that follows the player: nearby trees as dots,
// you as a coloured arrow, north fixed up.
export default function Minimap() {
  const ref = useRef()

  useEffect(() => {
    const cv = ref.current
    const ctx = cv.getContext('2d')
    let raf

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE)

      ctx.fillStyle = 'rgba(28, 38, 24, 0.55)'
      ctx.beginPath()
      ctx.roundRect(0, 0, SIZE, SIZE, 12)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(1, 1, SIZE - 2, SIZE - 2, 11)
      ctx.clip()

      // trees
      ctx.fillStyle = 'rgba(150, 214, 120, 0.95)'
      for (let i = 0; i < treeRegistry.length; i++) {
        const t = treeRegistry[i]
        const sx = SIZE / 2 + (t.x - P.pos.x) * SCALE
        const sy = SIZE / 2 + (t.z - P.pos.z) * SCALE
        if (sx < 0 || sx > SIZE || sy < 0 || sy > SIZE) continue
        ctx.beginPath()
        ctx.arc(sx, sy, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // landmarks (diamonds), gold when discovered
      const discovered = useStore.getState().discovered
      for (let i = 0; i < LANDMARKS.length; i++) {
        const l = LANDMARKS[i]
        const sx = SIZE / 2 + (l.x - P.pos.x) * SCALE
        const sy = SIZE / 2 + (l.z - P.pos.z) * SCALE
        if (sx < 4 || sx > SIZE - 4 || sy < 4 || sy > SIZE - 4) continue
        ctx.fillStyle = discovered.includes(l.id)
          ? 'rgba(242, 193, 78, 0.95)'
          : 'rgba(255, 255, 255, 0.5)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-3, -3, 6, 6)
        ctx.restore()
      }

      // player arrow (facing = P.avatarYaw)
      const fx = Math.sin(P.avatarYaw)
      const fz = Math.cos(P.avatarYaw)
      const rx = -fz
      const rz = fx
      const cxp = SIZE / 2
      const cyp = SIZE / 2
      ctx.fillStyle = useStore.getState().color
      ctx.beginPath()
      ctx.moveTo(cxp + fx * 8, cyp + fz * 8)
      ctx.lineTo(cxp - fx * 5 + rx * 4, cyp - fz * 5 + rz * 4)
      ctx.lineTo(cxp - fx * 5 - rx * 4, cyp - fz * 5 - rz * 4)
      ctx.closePath()
      ctx.fill()

      ctx.restore()

      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', SIZE / 2, 13)

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [])

  const setMapOpen = useStore((s) => s.setMapOpen)
  const mapOpen = useStore((s) => s.mapOpen)

  const openMap = () => setMapOpen(true)

  return (
    <button
      type="button"
      className="minimap-btn no-look"
      onClick={openMap}
      onDoubleClick={openMap}
      aria-label="Open world map"
      aria-expanded={mapOpen}
      title="Open world map (M)"
    >
      <canvas
        ref={ref}
        width={SIZE}
        height={SIZE}
        className="minimap"
        aria-hidden="true"
      />
    </button>
  )
}
