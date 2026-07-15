import { useState, useRef, useCallback } from 'react'
import { useStore, DAILY_BONUS_GOLD } from '../store'
import { useFocusTrap, useEscapeKey } from './a11y'

/**
 * Progress (daily, world tree) lives outside Settings so the gear panel
 * stays compact. Toggle sits on the far right of the screen.
 */
export default function ProgressPanel() {
  const [open, setOpen] = useState(false)
  const lastBonus = useStore((s) => s.lastBonus)
  const claimDailyBonus = useStore((s) => s.claimDailyBonus)
  const discovered = useStore((s) => s.discovered) || []
  const gold = useStore((s) => s.gold)
  const wood = useStore((s) => s.wood)
  const online = useStore((s) => s.online)
  const worldTreeWood = useStore((s) => s.worldTreeWood)
  const donateToWorldTree = useStore((s) => s.donateToWorldTree)
  const [claiming, setClaiming] = useState(false)
  const [donateAmt, setDonateAmt] = useState('50')
  const [donating, setDonating] = useState(false)

  const panelRef = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  useFocusTrap(panelRef, open)
  useEscapeKey(open, close)

  const today = new Date().toISOString().slice(0, 10)
  const dailyClaimedToday = lastBonus === today

  return (
    <div className="progress-dock no-look">
      <button
        type="button"
        className={`progress-toggle${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="progress-panel"
        title="Progress — daily bonus & World Tree"
      >
        <span className="progress-toggle-icon" aria-hidden="true">★</span>
        <span className="progress-toggle-label">Progress</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="progress-panel"
          className="progress-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="progress-title"
        >
          <div className="progress-panel-head">
            <span className="progress-panel-title" id="progress-title">Progress</span>
            <button
              type="button"
              className="settings-close"
              onClick={close}
              aria-label="Close progress"
            >
              ×
            </button>
          </div>

          <div className="settings-progress-card">
            <div className="settings-progress-row">
              <span>Places found</span>
              <strong>{discovered.length}</strong>
            </div>
            <div className="settings-progress-row">
              <span>Gold</span>
              <strong className="settings-progress-gold">
                <span className="shop-coin" aria-hidden="true" /> {gold}
              </strong>
            </div>
            <button
              type="button"
              className={`settings-daily-btn${dailyClaimedToday ? ' claimed' : ''}`}
              disabled={claiming}
              onClick={async () => {
                setClaiming(true)
                try {
                  await claimDailyBonus({ forceToast: true })
                } finally {
                  setClaiming(false)
                }
              }}
            >
              {claiming
                ? 'Claiming…'
                : dailyClaimedToday
                  ? 'Daily bonus claimed today'
                  : `Claim daily bonus · +${DAILY_BONUS_GOLD}g`}
            </button>
            <p className="settings-hint">
              {dailyClaimedToday
                ? 'Come back tomorrow for another +10 gold.'
                : 'One free claim per day. New online accounts wait 12 hours.'}
            </p>

            <div className="settings-divider" />
            <div className="settings-hint settings-hint-block">World Tree</div>
            <div className="settings-progress-row">
              <span>Shared wood</span>
              <strong>🪵 {worldTreeWood ?? 0}</strong>
            </div>
            <div className="settings-progress-row">
              <span>Your wood</span>
              <strong>🪵 {wood}</strong>
            </div>
            {online ? (
              <>
                <div className="settings-donate-row">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="settings-donate-input"
                    value={donateAmt}
                    onChange={(e) => setDonateAmt(e.target.value)}
                    aria-label="Wood amount to donate"
                    onFocus={() => useStore.getState().setInputContext('CHAT')}
                    onBlur={() => useStore.getState().setInputContext('GAME')}
                  />
                  <button
                    type="button"
                    className="settings-daily-btn"
                    disabled={donating}
                    onClick={async () => {
                      setDonating(true)
                      try {
                        await donateToWorldTree(donateAmt)
                      } finally {
                        setDonating(false)
                      }
                    }}
                  >
                    {donating ? 'Donating…' : 'Donate wood'}
                  </button>
                </div>
                <div className="settings-donate-presets" role="group" aria-label="Quick donate amounts">
                  {[10, 50, 100, 500].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="settings-seg-btn"
                      onClick={() => setDonateAmt(String(n))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="settings-hint">
                  Donate 500+ total wood (lifetime) for a chat donor badge. Online only.
                </p>
              </>
            ) : (
              <p className="settings-hint">
                Join online to donate wood to the shared World Tree and earn a chat badge.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
