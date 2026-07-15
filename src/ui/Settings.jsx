import { useStore, DAILY_BONUS_GOLD } from '../store'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useFocusTrap, useEscapeKey } from './a11y'

function KeybindRow({ action, label }) {
  const code = useStore((s) => s.keybinds[action])
  const setKeybind = useStore((s) => s.setKeybind)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    if (!listening) return
    const onKeyDown = (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (e.code === 'Escape') {
        setListening(false)
        return
      }
      setKeybind(action, e.code)
      setListening(false)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [listening, action, setKeybind])

  const formatKey = (c) => {
    if (!c) return ''
    if (c.startsWith('Key')) return c.slice(3)
    if (c.startsWith('Arrow')) return c.slice(5)
    return c
  }

  return (
    <div className="settings-row">
      <span id={`keybind-${action}-label`}>{label}</span>
      <button
        type="button"
        className={`settings-toggle${listening ? ' active' : ''}`}
        onClick={() => setListening(true)}
        aria-labelledby={`keybind-${action}-label`}
        aria-pressed={listening}
      >
        {listening ? 'press key...' : formatKey(code)}
      </button>
    </div>
  )
}

function ToggleRow({ label, on, onToggle, title }) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <button
        type="button"
        className={`settings-toggle${on ? ' on' : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        title={title}
      >
        <span className="sr-only">{label}: </span>
        {on ? 'on' : 'off'}
      </button>
    </div>
  )
}

// Settings panel — gear icon always visible in the button row.
export default function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const muted = useStore((s) => s.muted)
  const fireflies = useStore((s) => s.fireflies)
  const particles = useStore((s) => s.particles)
  const grassDensity = useStore((s) => s.grassDensity)
  const joystickEnabled = useStore((s) => s.joystickEnabled)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleFireflies = useStore((s) => s.toggleFireflies)
  const toggleParticles = useStore((s) => s.toggleParticles)
  const setGrassDensity = useStore((s) => s.setGrassDensity)
  const setJoystickEnabled = useStore((s) => s.setJoystickEnabled)
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
  const close = useCallback(() => setOpen(false), [setOpen])
  useFocusTrap(panelRef, open)
  useEscapeKey(open, close)

  const today = new Date().toISOString().slice(0, 10)
  const dailyClaimedToday = lastBonus === today

  return (
    <div className="settings-wrap no-look">
      <button
        type="button"
        className="settings-gear"
        onClick={() => setOpen(!open)}
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="settings-panel"
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id="settings-panel"
          className="settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
        >
          <div className="settings-head">
            <span className="settings-title" id="settings-title">Settings</span>
            <button type="button" className="settings-close" onClick={close} aria-label="Close settings">×</button>
          </div>

          <div className="settings-group">
            <div className="settings-hint settings-hint-block">Progress</div>
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

            <div className="settings-divider" />
            <ToggleRow label="Sound" on={!muted} onToggle={toggleMute} />
            <ToggleRow label="Fireflies" on={fireflies} onToggle={toggleFireflies} />
            <ToggleRow label="Wildlife" on={particles} onToggle={toggleParticles} />

            <div className="settings-row">
              <span id="grass-density-label">Grass</span>
              <div className="settings-seg" role="group" aria-labelledby="grass-density-label">
                {['full', 'half', 'off'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`settings-seg-btn${grassDensity === v ? ' active' : ''}`}
                    onClick={() => setGrassDensity(v)}
                    aria-pressed={grassDensity === v}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-divider" />
            <div className="settings-hint settings-hint-block" id="movement-keys-hint">Movement Keys</div>
            <KeybindRow action="forward" label="Forward" />
            <KeybindRow action="left" label="Left" />
            <KeybindRow action="backward" label="Backward" />
            <KeybindRow action="right" label="Right" />

            <div className="settings-divider" />

            <ToggleRow
              label="🕹️ Touch Controls"
              on={joystickEnabled}
              onToggle={() => setJoystickEnabled(!joystickEnabled)}
              title="Show on-screen joystick for mobile/touch play"
            />
            {joystickEnabled && (
              <div className="settings-hint">
                Left half = move · Right half = look
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
