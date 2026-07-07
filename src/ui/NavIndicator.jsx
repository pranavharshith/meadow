import { useStore } from '../store'

const TELEPORT_COST = 15

export default function NavIndicator() {
  const navTarget = useStore((s) => s.navTarget)
  const discovered = useStore((s) => s.discovered)
  const gold = useStore((s) => s.gold)
  const clearNav = useStore((s) => s.clearNav)
  const teleportTo = useStore((s) => s.teleportTo)

  if (!navTarget) return null

  const isLandmarkDiscovered = discovered.includes(navTarget.id)
  const canTeleport = isLandmarkDiscovered && gold >= TELEPORT_COST

  return (
    <div className="nav-indicator no-look">
      <button className="nav-name-btn" onClick={clearNav} title="cancel navigation">
        <span className="nav-arrow">&gt;</span>
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
