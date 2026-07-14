import { useEffect, useRef, useCallback, useState } from 'react'
import { useStore, TELEPORT_GOLD_COST } from '../store'
import { LANDMARKS } from '../world/places'
import { P, look, treeRegistry } from '../player-state'
import { useFocusTrap, useEscapeKey } from './a11y'

// Full-screen map: explore, guide, and teleport (B4).
// Undiscovered places stay fogged (???) until walked near.
const MAP_SIZE = 520
const WORLD_RANGE = 400
const SCALE = MAP_SIZE / WORLD_RANGE

function distToPlayer(l) {
  return Math.hypot(l.x - P.pos.x, l.z - P.pos.z)
}

export default function WorldMap() {
  const mapOpen = useStore((s) => s.mapOpen)
  const setMapOpen = useStore((s) => s.setMapOpen)
  const setNavTarget = useStore((s) => s.setNavTarget)
  const navTarget = useStore((s) => s.navTarget)
  const discovered = useStore((s) => s.discovered)
  const color = useStore((s) => s.color)
  const gold = useStore((s) => s.gold)
  const teleportTo = useStore((s) => s.teleportTo)
  const isProcessingTeleport = useStore((s) => s.isProcessingTeleport)
  const canvasRef = useRef()
  const containerRef = useRef(null)
  const [tick, setTick] = useState(0)
  const closeMap = useCallback(() => setMapOpen(false), [setMapOpen])
  useFocusTrap(containerRef, mapOpen)
  useEscapeKey(mapOpen, closeMap)

  // Soft distance refresh while open (aesthetic list distances)
  useEffect(() => {
    if (!mapOpen) return
    const id = setInterval(() => setTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [mapOpen])

  useEffect(() => {
    if (!mapOpen) return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    let raf

    const draw = () => {
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)

      ctx.fillStyle = 'rgba(22, 30, 20, 0.92)'
      ctx.beginPath()
      ctx.roundRect(0, 0, MAP_SIZE, MAP_SIZE, 16)
      ctx.fill()

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(1, 1, MAP_SIZE - 2, MAP_SIZE - 2, 15)
      ctx.clip()

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      for (let i = 0; i <= 8; i++) {
        const p = (MAP_SIZE / 8) * i
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, MAP_SIZE); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(MAP_SIZE, p); ctx.stroke()
      }

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

      for (const l of LANDMARKS) {
        const sx = MAP_SIZE / 2 + (l.x - P.pos.x) * SCALE
        const sy = MAP_SIZE / 2 + (l.z - P.pos.z) * SCALE
        if (sx < 10 || sx > MAP_SIZE - 10 || sy < 10 || sy > MAP_SIZE - 10) continue

        const isDiscovered = discovered.includes(l.id)
        const isTarget = navTarget && navTarget.id === l.id

        ctx.fillStyle = isTarget
          ? '#5bb8ff'
          : isDiscovered
            ? 'rgba(242, 193, 78, 0.95)'
            : 'rgba(255, 255, 255, 0.28)'
        ctx.save()
        ctx.translate(sx, sy)
        ctx.rotate(Math.PI / 4)
        ctx.fillRect(-5, -5, 10, 10)
        ctx.restore()

        // Fog names until discovered (B4 / exploration)
        const label = isDiscovered ? l.name : '???'
        ctx.fillStyle = isTarget
          ? '#5bb8ff'
          : isDiscovered
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(255,255,255,0.35)'
        ctx.font = `${isTarget ? 'bold ' : ''}${isDiscovered ? 11 : 10}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(label, sx, sy + 16)
      }

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

  const guideTo = (l) => {
    if (navTarget && navTarget.id === l.id) {
      setNavTarget(null)
    } else {
      setNavTarget({ id: l.id, x: l.x, z: l.z, name: l.name })
    }
  }

  const teleportLandmark = async (l) => {
    if (!discovered.includes(l.id)) return
    if (gold < TELEPORT_GOLD_COST || isProcessingTeleport) return
    await teleportTo(l.id)
    setMapOpen(false)
  }

  if (!mapOpen) return null

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY

    for (const l of LANDMARKS) {
      const sx = MAP_SIZE / 2 + (l.x - P.pos.x) * SCALE
      const sy = MAP_SIZE / 2 + (l.z - P.pos.z) * SCALE
      const dist = Math.hypot(cx - sx, cy - sy)
      if (dist < 18) {
        guideTo(l)
        return
      }
    }
    if (e.altKey) {
      const worldX = P.pos.x + (cx - MAP_SIZE / 2) / SCALE
      const worldZ = P.pos.z + (cy - MAP_SIZE / 2) / SCALE
      setNavTarget({ x: worldX, z: worldZ })
    }
  }

  const foundCount = discovered.filter((id) => LANDMARKS.some((l) => l.id === id)).length
  // tick drives distance labels while map is open
  void tick

  return (
    <div
      className="worldmap-overlay no-look"
      onClick={closeMap}
      role="presentation"
    >
      <div
        ref={containerRef}
        className="worldmap-container worldmap-container--rich"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worldmap-title"
      >
        <header className="worldmap-header">
          <div>
            <h2 id="worldmap-title" className="worldmap-title">Meadow map</h2>
            <p className="worldmap-sub">
              {foundCount}/{LANDMARKS.length} places found
              <span className="worldmap-sub-sep">·</span>
              <span className="worldmap-gold" title="Your gold">
                <span className="shop-coin" aria-hidden="true" /> {gold}
              </span>
            </p>
          </div>
          <button type="button" className="worldmap-close" onClick={closeMap} aria-label="Close map">
            ×
          </button>
        </header>

        <div className="worldmap-body">
          <canvas
            ref={canvasRef}
            width={MAP_SIZE}
            height={MAP_SIZE}
            className="worldmap-canvas"
            onClick={handleCanvasClick}
            role="img"
            aria-label="Map of the meadow. Undiscovered places show as question marks. Use the list to guide or teleport."
          />

          <div className="map-landmark-list" role="list" aria-label="Landmarks">
            {LANDMARKS.map((l) => {
              const isDiscovered = discovered.includes(l.id)
              const isTarget = navTarget && navTarget.id === l.id
              const d = Math.round(distToPlayer(l))
              const canTp = isDiscovered && gold >= TELEPORT_GOLD_COST && !isProcessingTeleport
              return (
                <div
                  key={l.id}
                  role="listitem"
                  className={`map-lm-row${!isDiscovered ? ' undiscovered' : ''}${isTarget ? ' active' : ''}`}
                >
                  <div className="map-lm-main">
                    <span className="map-lm-name">
                      {isDiscovered ? l.name : 'Unexplored place'}
                    </span>
                    <span className="map-lm-meta">
                      {isDiscovered ? (
                        <>
                          {d} m
                          {isTarget ? ' · guiding' : ''}
                        </>
                      ) : (
                        <>walk near to discover · ~{d} m</>
                      )}
                    </span>
                  </div>
                  <div className="map-lm-actions">
                    <button
                      type="button"
                      className={`map-lm-btn guide${isTarget ? ' on' : ''}`}
                      onClick={() => guideTo(l)}
                      aria-pressed={!!isTarget}
                      title={isTarget ? 'Stop guiding' : 'Guide me there'}
                    >
                      {isTarget ? 'Guiding' : 'Guide'}
                    </button>
                    <button
                      type="button"
                      className={`map-lm-btn teleport${canTp ? '' : ' disabled'}`}
                      onClick={() => teleportLandmark(l)}
                      disabled={!canTp}
                      title={
                        !isDiscovered
                          ? 'Discover this place first'
                          : gold < TELEPORT_GOLD_COST
                            ? `Need ${TELEPORT_GOLD_COST} gold`
                            : `Teleport for ${TELEPORT_GOLD_COST} gold`
                      }
                    >
                      ✨ {TELEPORT_GOLD_COST}g
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="worldmap-hint">
          Guide walks you there · Teleport costs {TELEPORT_GOLD_COST}g after discover · Esc closes · M toggles
        </p>
      </div>
    </div>
  )
}
