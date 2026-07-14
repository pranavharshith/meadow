import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { LANDMARKS, DISCOVER_RANGE } from '../world/places'
import { P } from '../player-state'

const TARGET_ID = 'lonely-oak'
const TARGET = LANDMARKS.find((l) => l.id === TARGET_ID)

/**
 * Soft first-session goal: after welcome, nudge the player to walk
 * to The Lonely Oak. Completes on discovery, proximity, or dismiss.
 */
export default function FirstWalkQuest() {
  const active = useStore((s) => s.firstWalkQuest === 'active')
  const hasWelcome = useStore((s) => s.hasCompletedWelcome)
  const discovered = useStore((s) => s.discovered)
  const dismissFirstWalk = useStore((s) => s.dismissFirstWalk)
  const completeFirstWalk = useStore((s) => s.completeFirstWalk)
  const startFirstWalkNav = useStore((s) => s.startFirstWalkNav)
  const navTarget = useStore((s) => s.navTarget)
  const placementMode = useStore((s) => s.placementMode)
  const [dist, setDist] = useState(null)

  // Complete if already discovered (e.g. hydrated after welcome)
  useEffect(() => {
    if (!active) return
    if (discovered.includes(TARGET_ID)) completeFirstWalk()
  }, [active, discovered, completeFirstWalk])

  // Track distance + complete when close enough to "arrive" (works offline too)
  useEffect(() => {
    if (!active || !TARGET) return
    let raf
    let lastUi = 0
    const tick = () => {
      const d = Math.hypot(TARGET.x - P.pos.x, TARGET.z - P.pos.z)
      const now = performance.now()
      if (now - lastUi > 200) {
        lastUi = now
        setDist(d)
      }
      const range = TARGET.discoverRange ?? DISCOVER_RANGE
      if (d <= range + 4) {
        completeFirstWalk()
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, completeFirstWalk])

  // Hide while placing so the placement banner isn't buried (F5)
  if (!hasWelcome || !active || !TARGET || placementMode) return null

  const navigatingHere = navTarget && navTarget.id === TARGET_ID
  const distLabel =
    dist == null ? '' : dist < 20 ? 'almost there' : `${Math.round(dist)} m away`

  return (
    <div className="first-walk no-look" role="status" aria-live="polite">
      <div className="first-walk-main">
        <span className="first-walk-badge" aria-hidden="true">1</span>
        <div className="first-walk-copy">
          <div className="first-walk-title">First walk</div>
          <div className="first-walk-text">
            Head to <strong>{TARGET.name}</strong>
            {distLabel ? <span className="first-walk-dist"> · {distLabel}</span> : null}
          </div>
        </div>
      </div>
      <div className="first-walk-actions">
        <button
          type="button"
          className="btn small first-walk-go"
          onClick={startFirstWalkNav}
          aria-pressed={!!navigatingHere}
        >
          {navigatingHere ? 'Guiding…' : 'Guide me'}
        </button>
        <button
          type="button"
          className="btn small ghost first-walk-skip"
          onClick={dismissFirstWalk}
          aria-label="Dismiss first walk"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
