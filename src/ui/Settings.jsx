import { useStore } from '../store'

// Settings panel — gear icon always visible in the button row.
// Panel springs up above the gear when open, without displacing other icons.
export default function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const muted = useStore((s) => s.muted)
  const fireflies = useStore((s) => s.fireflies)
  const particles = useStore((s) => s.particles)
  const grassDensity = useStore((s) => s.grassDensity)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleFireflies = useStore((s) => s.toggleFireflies)
  const toggleParticles = useStore((s) => s.toggleParticles)
  const setGrassDensity = useStore((s) => s.setGrassDensity)

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
          </div>
        </div>
      )}
    </div>
  )
}
