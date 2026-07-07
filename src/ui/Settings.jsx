import { useStore } from '../store'

// Settings panel — slides out from a gear icon in the bottom-right.
// Contains quality toggles previously scattered as on-screen pills.
export default function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const setOpen = useStore((s) => s.setSettingsOpen)
  const muted = useStore((s) => s.muted)
  const fireflies = useStore((s) => s.fireflies)
  const shadows = useStore((s) => s.shadows)
  const grassDensity = useStore((s) => s.grassDensity)
  const effects = useStore((s) => s.effects)
  const particles = useStore((s) => s.particles)
  const toggleMute = useStore((s) => s.toggleMute)
  const toggleFireflies = useStore((s) => s.toggleFireflies)
  const toggleShadows = useStore((s) => s.toggleShadows)
  const setGrassDensity = useStore((s) => s.setGrassDensity)
  const toggleEffects = useStore((s) => s.toggleEffects)
  const toggleParticles = useStore((s) => s.toggleParticles)

  if (!open) {
    return (
      <button
        className="settings-gear no-look"
        onClick={() => setOpen(true)}
        aria-label="settings"
        title="settings"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="3" />
          <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4" />
        </svg>
      </button>
    )
  }

  return (
    <div className="settings-panel no-look">
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
          <span>Shadows</span>
          <button className={`settings-toggle${shadows ? ' on' : ''}`} onClick={toggleShadows}>
            {shadows ? 'on' : 'off'}
          </button>
        </label>

        <label className="settings-row">
          <span>Effects</span>
          <button className={`settings-toggle${effects ? ' on' : ''}`} onClick={toggleEffects}>
            {effects ? 'on' : 'off'}
          </button>
        </label>

        <label className="settings-row">
          <span>Particles</span>
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
  )
}
