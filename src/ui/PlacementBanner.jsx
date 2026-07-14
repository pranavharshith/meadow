import { useEffect, useState, useRef } from 'react'
import { placement } from '../player-state'
import { useStore } from '../store'

/**
 * Placement mode coach (F5): stays prominent, pulses when invalid,
 * and echoes reason via toast if the player spams Place/E on a bad spot.
 */
export default function PlacementBanner() {
  const mode = useStore((s) => s.placementMode)
  const subject = useStore((s) => s.placementSubject)
  const confirm = useStore((s) => s.confirmPlacement)
  const cancel = useStore((s) => s.cancelPlacement)
  const flash = useStore((s) => s.flash)
  const [status, setStatus] = useState({ valid: true, reason: '' })
  const [shake, setShake] = useState(false)
  const lastToastAt = useRef(0)

  useEffect(() => {
    if (!mode) return
    const id = window.setInterval(() => {
      setStatus({ valid: placement.valid, reason: placement.reason })
    }, 80)
    return () => window.clearInterval(id)
  }, [mode])

  if (!mode || !subject || mode === 'plot') return null

  const fallbackIcon = mode === 'rock' ? '🪨' : mode === 'crafted' ? '🔨' : '🌳'
  const label = subject.emoji || subject.icon || fallbackIcon
  const kindLabel =
    mode === 'rock' ? 'rock' : mode === 'crafted' ? 'craft item' : 'tree'

  const tryConfirm = () => {
    if (status.valid) {
      confirm()
      return
    }
    // Invalid: feedback that can't hide behind quests (F5)
    setShake(true)
    window.setTimeout(() => setShake(false), 420)
    const reason = status.reason || 'cannot place here'
    const now = Date.now()
    if (now - lastToastAt.current > 900) {
      lastToastAt.current = now
      flash(reason)
    }
  }

  return (
    <div
      className={`place-banner no-look ${status.valid ? 'ok' : 'bad'}${shake ? ' shake' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="place-banner-info">
        <div className="place-banner-title">
          <span className="place-banner-emoji" aria-hidden="true">
            {label}
          </span>
          Placing {subject.name || kindLabel}
        </div>
        <div className="place-banner-status">
          {status.valid ? (
            <>Good spot — press <kbd>E</kbd> to place</>
          ) : (
            <>
              <span className="place-banner-bad-icon" aria-hidden="true">
                !
              </span>
              {status.reason || 'blocked — move to a clearer spot'}
            </>
          )}
        </div>
      </div>
      <div className="place-banner-actions">
        <button type="button" className="place-banner-cancel" onClick={cancel}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button
          type="button"
          className={`place-banner-confirm${status.valid ? '' : ' disabled'}`}
          onClick={tryConfirm}
          title={status.valid ? 'Confirm placement' : status.reason || 'Cannot place here'}
        >
          Place <kbd>E</kbd>
        </button>
      </div>
    </div>
  )
}
