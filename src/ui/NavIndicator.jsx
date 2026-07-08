import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { P, look } from '../player-state'

const TELEPORT_COST = 15

export default function NavIndicator() {
  const navTarget = useStore((s) => s.navTarget)
  const discovered = useStore((s) => s.discovered)
  const gold = useStore((s) => s.gold)
  const clearNav = useStore((s) => s.clearNav)
  const teleportTo = useStore((s) => s.teleportTo)
  const arrowRef = useRef()

  useEffect(() => {
    if (!navTarget) return
    let raf
    const update = () => {
      if (arrowRef.current) {
        const dx = navTarget.x - P.pos.x
        const dz = navTarget.z - P.pos.z
        const targetAngle = Math.atan2(dx, dz)
        // look.yaw = 0 means looking +Z (South).
        // If looking South and target is East (+X, PI/2), East is on the left (-90deg).
        // So look.yaw - targetAngle gives the correct relative screen rotation!
        const deg = (look.yaw - targetAngle) * (180 / Math.PI)
        arrowRef.current.style.transform = `rotate(${deg}deg)`
      }
      raf = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(raf)
  }, [navTarget])

  if (!navTarget) return null

  const isLandmarkDiscovered = discovered.includes(navTarget.id)
  const canTeleport = isLandmarkDiscovered && gold >= TELEPORT_COST

  return (
    <div className="nav-indicator no-look">
      <button className="nav-name-btn" onClick={clearNav} title="cancel navigation">
        <span className="nav-arrow" ref={arrowRef} style={{ display: 'inline-block', transition: 'transform 0.1s linear' }}>↑</span>
        <span className="nav-name">{navTarget.name}</span>
        <span className="nav-cancel">x</span>
      </button>
      {isLandmarkDiscovered && (
        <button
          className={`nav-teleport${canTeleport ? '' : ' disabled'}`}
          onClick={() => canTeleport && teleportTo(navTarget.id)}
          title={canTeleport ? `teleport for ${TELEPORT_COST} gold` : `need ${TELEPORT_COST} gold`}
        >
          ✨ {TELEPORT_COST}g
        </button>
      )}
    </div>
  )
}
