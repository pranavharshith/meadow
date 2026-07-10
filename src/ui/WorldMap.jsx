import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { LANDMARKS } from '../world/places'
import { P, look, treeRegistry } from '../player-state'

// Full-screen map overlay. Shows all landmarks + player position.
// Click a landmark to set navigation target; click backdrop or × to close.
const MAP_SIZE = 520
const WORLD_RANGE = 400 // world units shown across full map
const SCALE = MAP_SIZE / WORLD_RANGE

export default function WorldMap() {
  const mapOpen = useStore((s) => s.mapOpen)
  const setMapOpen = useStore((s) => s.setMapOpen)
  const setNavTarget = useStore((s) => s.setNavTarget)
  const navTarget = useStore((s) => s.navTarget)
  const discovered = useStore((s) => s.discovered)
  const color = useStore((s) => s.color)
  const canvasRef = useRef()

  useEffect(() => {
    if (!mapOpen) return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    let raf

    const draw = () => {
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)

      // background
      ctx.fillStyle = 'rgba(22, 30, 20, 0.92)'
      ctx.beginPath()
      ctx.roundRect(0, 0, MAP_SIZE, MAP_SIZE, 16)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(1, 1, MAP_SIZE - 2, MAP_SIZE - 2, 15)
      ctx.clip()

      // grid lines (subtle)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let i = 0; i <= 8; i++) {
        const p = (MAP_SIZE / 8) * i
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, MAP_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(MAP_SIZE, p); ctx.stroke()
      }

      // trees as small dots
      ctx.fillStyle = 'rgba(140, 200, 110, 0.5)'
      for (let i = 0; i < treeRegistry.length; i++) {
        const t = treeRegistry[i]
        const sx = MAP_SIZE / 2 + (t.x - P.pos.x) * SCALE
        const sy = MAP_SIZE / 2 + (t.z - P.pos.z) * SCALE
        if (sx < 0 || sx > MAP_SIZE || sy < 0 || sy > MAP_SIZE) continue
        ctx.beginPath()
        ctx.arc(sx, sy, 2, 0, Math.PI * 2)
        ctx.fill()
      }

      // landmarks
      for (const l of LANDMARKS) {
        const sx = MAP_SIZE / 2 + (l.x - P.pos.x) * SCALE
        const sy = MAP_SIZE / 2 + (l.z - P.pos.z) * SCALE
        if (sx < 10 || sx > MAP_SIZE - 10 || sy < 10 || sy > MAP_SIZE - 10) continue

        const isDiscovered = discovered.includes(l.id)
        const isTarget = navTarget && navTarget.id === l.id

        // marker
        ctx.fillStyle = isTarget
          ? '#5bb8ff'
          : isDiscovered
            ? 'rgba(242, 193, 78, 0.95)'
            : 'rgba(255, 255, 255, 0.4)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-5, -5, 10, 10)
        ctx.restore()

        // label
        ctx.fillStyle = isTarget ? '#5bb8ff' : isDiscovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)'
        ctx.font = `${isTarget ? 'bold ' : ''}11px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(l.name, sx, sy + 16)
      }

      // nav path line (if target set)
      if (navTarget) {
        const tx = MAP_SIZE / 2 + (navTarget.x - P.pos.x) * SCALE
        const ty = MAP_SIZE / 2 + (navTarget.z - P.pos.z) * SCALE
        ctx.strokeStyle = 'rgba(91, 184, 255, 0.5)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(MAP_SIZE / 2, MAP_SIZE / 2)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // player arrow
      const fx = Math.sin(P.avatarYaw)
      const fz = Math.cos(P.avatarYaw)
      const rx = -fz
      const rz = fx
      const cx = MAP_SIZE / 2
      const cy = MAP_SIZE / 2
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(cx + fx * 10, cy + fz * 10)
      ctx.lineTo(cx - fx * 6 + rx * 5, cy - fz * 6 + rz * 5)
      ctx.lineTo(cx - fx * 6 - rx * 5, cy - fz * 6 - rz * 5)
      ctx.closePath()
      ctx.fill()

      // north label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
      ctx.font = '12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', MAP_SIZE / 2, 18)

      ctx.restore()

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [mapOpen, navTarget, discovered, color])

  if (!mapOpen) return null

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    // Calculate CSS scaling ratio (logical size / physical size)
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY

    // check if click is near a landmark
    for (const l of LANDMARKS) {
      const sx = MAP_SIZE / 2 + (l.x - P.pos.x) * SCALE
      const sy = MAP_SIZE / 2 + (l.z - P.pos.z) * SCALE
      const dist = Math.hypot(cx - sx, cy - sy)
      if (dist < 18) {
        // toggle: clicking same target deselects
        if (navTarget && navTarget.id === l.id) {
          setNavTarget(null)
        } else {
          setNavTarget({ id: l.id, x: l.x, z: l.z, name: l.name })
        }
        setMapOpen(false)
        return
      }
    }
    // Alt-click on empty space: drop a waypoint at that world coordinate
    if (e.altKey) {
      const worldX = P.pos.x + (cx - MAP_SIZE / 2) / SCALE
      const worldZ = P.pos.z + (cy - MAP_SIZE / 2) / SCALE
      setNavTarget({ x: worldX, z: worldZ })
      setMapOpen(false)
    }
  }

  return (
    <div className="worldmap-overlay no-look" onClick={() => setMapOpen(false)}>
      <div className="worldmap-container" onClick={(e) => e.stopPropagation()}>
        <canvas
          ref={canvasRef}
          width={MAP_SIZE}
          height={MAP_SIZE}
          className="worldmap-canvas"
          onClick={handleCanvasClick}
        />
        <button className="worldmap-close" onClick={() => setMapOpen(false)} aria-label="close map">
          ×
        </button>
      </div>
    </div>
  )
}
