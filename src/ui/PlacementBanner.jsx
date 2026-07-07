import { useEffect, useState } from 'react'
import { placement } from '../player-state'
import { useStore } from '../store'

export default function PlacementBanner() {
  const mode = useStore((s) => s.placementMode)
  const subject = useStore((s) => s.placementSubject)
  const confirm = useStore((s) => s.confirmPlacement)
  const cancel = useStore((s) => s.cancelPlacement)
  const [status, setStatus] = useState({ valid: true, reason: '' })

  useEffect(() => {
    if (!mode) return
    const id = window.setInterval(() => {
      setStatus({ valid: placement.valid, reason: placement.reason })
    }, 120)
    return () => window.clearInterval(id)
  }, [mode])

  if (!mode || !subject) return null

  const fallbackIcon = mode === 'rock' ? 'rock' : 'tree'
  const label = subject.emoji || fallbackIcon

  return (
    <div className={`place-banner no-look ${status.valid ? 'ok' : 'bad'}`}>
      <div className="place-banner-info">
        <div className="place-banner-title">
          {label} placing {subject.name || (mode === 'rock' ? 'a rock' : 'a tree')}
        </div>
        <div className="place-banner-status">
          {status.valid ? 'good spot' : status.reason || 'blocked'}
        </div>
      </div>
      <div className="place-banner-actions">
        <button className="place-banner-cancel" onClick={cancel}>
          Cancel <kbd>Esc</kbd>
        </button>
        <button
          className={`place-banner-confirm${status.valid ? '' : ' disabled'}`}
          onClick={() => status.valid && confirm()}
          disabled={!status.valid}
          title={status.valid ? 'Confirm placement' : status.reason}
        >
          Place <kbd>E</kbd>
        </button>
      </div>
    </div>
  )
}
