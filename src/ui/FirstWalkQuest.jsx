import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { LANDMARKS, DISCOVER_RANGE } from '../world/places'
import { P } from '../player-state'

const TARGET_ID = 'lonely-oak'
const TARGET = LANDMARKS.find((l) => l.id === TARGET_ID)

const SOFT_STEPS = {
  plant: {
    n: 2,
    title: 'Plant a tree',
    text: 'Open Create (G) → Trees and place a free Broadleaf Oak.',
    cta: 'Open Create',
    run: () => {
      const st = useStore.getState()
      st.setCreateTab('trees')
      st.setCreateOpen(true)
    },
  },
  water: {
    n: 3,
    title: 'Water a sapling',
    text: 'Stand near a young tree and press R to water (+1 gold).',
    cta: null,
  },
  craft: {
    n: 4,
    title: 'Craft something',
    text: 'Cut a tree (click + X) for wood, then Create → Craft (Q) and Place.',
    cta: 'Open Craft',
    run: () => {
      const st = useStore.getState()
      st.setCreateTab('craft')
      st.setCreateOpen(true)
    },
  },
  plot: {
    n: 5,
    title: 'Claim land',
    text: 'Create → Land. Size sets the gold price (from ~60g).',
    cta: 'Open Land',
    run: () => {
      const st = useStore.getState()
      st.setCreateTab('plots')
      st.setCreateOpen(true)
    },
  },
}

/**
 * Soft onboarding coach: first walk, then plant → water → craft → plot.
 * Hidden while placing so the placement banner stays readable.
 */
export default function FirstWalkQuest() {
  const firstWalk = useStore((s) => s.firstWalkQuest)
  const softQuest = useStore((s) => s.softQuest)
  const hasWelcome = useStore((s) => s.hasCompletedWelcome)
  const discovered = useStore((s) => s.discovered)
  const dismissFirstWalk = useStore((s) => s.dismissFirstWalk)
  const completeFirstWalk = useStore((s) => s.completeFirstWalk)
  const startFirstWalkNav = useStore((s) => s.startFirstWalkNav)
  const dismissSoftQuest = useStore((s) => s.dismissSoftQuest)
  const navTarget = useStore((s) => s.navTarget)
  const placementMode = useStore((s) => s.placementMode)
  const [dist, setDist] = useState(null)

  const walkActive = firstWalk === 'active'
  const softStep = !walkActive && softQuest && SOFT_STEPS[softQuest] ? softQuest : null

  // Complete walk if already discovered
  useEffect(() => {
    if (!walkActive) return
    if (discovered.includes(TARGET_ID)) completeFirstWalk()
  }, [walkActive, discovered, completeFirstWalk])

  // Distance + proximity complete for first walk
  useEffect(() => {
    if (!walkActive || !TARGET) return
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
  }, [walkActive, completeFirstWalk])

  if (!hasWelcome || placementMode) return null
  if (!walkActive && !softStep) return null

  if (walkActive && TARGET) {
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

  const step = SOFT_STEPS[softStep]
  if (!step) return null

  return (
    <div className="first-walk no-look" role="status" aria-live="polite">
      <div className="first-walk-main">
        <span className="first-walk-badge" aria-hidden="true">{step.n}</span>
        <div className="first-walk-copy">
          <div className="first-walk-title">{step.title}</div>
          <div className="first-walk-text">{step.text}</div>
        </div>
      </div>
      <div className="first-walk-actions">
        {step.cta && step.run ? (
          <button type="button" className="btn small first-walk-go" onClick={step.run}>
            {step.cta}
          </button>
        ) : null}
        <button
          type="button"
          className="btn small ghost first-walk-skip"
          onClick={dismissSoftQuest}
          aria-label="Dismiss tip"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
