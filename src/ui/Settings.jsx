import { useStore } from '../store'
import { useState, useEffect } from 'react'

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
    <label className="settings-row">
      <span>{label}</span>
      <button
        className={`settings-toggle${listening ? ' active' : ''}`}
        onClick={() => setListening(true)}
      >
        {listening ? 'press key...' : formatKey(code)}
      </button>
    </label>
  )
}

// Settings panel — gear icon always visible in the button row.
// Panel springs up above the gear when open, without displacing other icons.
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

  return (
    <div className="settings-wrap no-look">
      <button
        className="settings-gear"
        onClick={() => setOpen(!open)}
        aria-label="settings"
        title="settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="settings-panel">
          <div className="settings-head">
            <span className="settings-title">Settings</span>
            <button className="settings-close" onClick={() => setOpen(false)} aria-label="close settings">×</button>
          </div>

          <div className="settings-group">
            <label className="settings-row">
              <span>Sound</span>
              <button className={`settings-toggle${!muted ? ' on' : ''}`} onClick={toggleMute}>
                {muted ? 'off' : 'on'}
              </button>
            </label>

            <label className="settings-row">
              <span>Fireflies</span>
              <button className={`settings-toggle${fireflies ? ' on' : ''}`} onClick={toggleFireflies}>
                {fireflies ? 'on' : 'off'}
              </button>
            </label>

            <label className="settings-row">
              <span>Wildlife</span>
              <button className={`settings-toggle${particles ? ' on' : ''}`} onClick={toggleParticles}>
                {particles ? 'on' : 'off'}
              </button>
            </label>

            <label className="settings-row">
              <span>Grass</span>
              <div className="settings-seg">
                {['full', 'half', 'off'].map((v) => (
                  <button
                    key={v}
                    className={`settings-seg-btn${grassDensity === v ? ' active' : ''}`}
                    onClick={() => setGrassDensity(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </label>

            {/* Keybinds */}
            <div className="settings-divider" />
            <div className="settings-hint" style={{ marginBottom: '8px' }}>Movement Keys</div>
            <KeybindRow action="forward" label="Forward" />
            <KeybindRow action="left" label="Left" />
            <KeybindRow action="backward" label="Backward" />
            <KeybindRow action="right" label="Right" />

            {/* Touch Controls divider */}
            <div className="settings-divider" />

            <label className="settings-row">
              <span className="settings-row-icon">🕹️ Touch Controls</span>
              <button
                className={`settings-toggle${joystickEnabled ? ' on' : ''}`}
                onClick={() => setJoystickEnabled(!joystickEnabled)}
                title="Show on-screen joystick for mobile/touch play"
              >
                {joystickEnabled ? 'on' : 'off'}
              </button>
            </label>
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
