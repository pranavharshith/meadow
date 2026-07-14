import { useStore } from '../store'

/**
 * Bottom action dock for touch / narrow screens.
 * Plant · Water · Cut · Create · Chat (via event) · Map
 */
export default function MobileActionBar({ onOpenChat, plantLabel }) {
  const plantTree = useStore((s) => s.plantTree)
  const waterNearest = useStore((s) => s.waterNearest)
  const cutSelection = useStore((s) => s.cutSelection)
  const selection = useStore((s) => s.selection)
  const createOpen = useStore((s) => s.createOpen)
  const setCreateOpen = useStore((s) => s.setCreateOpen)
  const mapOpen = useStore((s) => s.mapOpen)
  const setMapOpen = useStore((s) => s.setMapOpen)
  const cycleView = useStore((s) => s.cycleView)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const settingsOpen = useStore((s) => s.settingsOpen)

  const hasCut = !!selection

  return (
    <nav className="mobile-bar no-look" aria-label="Quick actions">
      <button
        type="button"
        className="mobile-bar-btn plant"
        onClick={() => plantTree()}
        title={plantLabel || 'Plant / place'}
      >
        <span className="mobile-bar-icon" aria-hidden="true">🌱</span>
        <span className="mobile-bar-label">Place</span>
      </button>
      <button
        type="button"
        className="mobile-bar-btn"
        onClick={() => waterNearest()}
        title="Water nearest sapling"
      >
        <span className="mobile-bar-icon" aria-hidden="true">💧</span>
        <span className="mobile-bar-label">Water</span>
      </button>
      <button
        type="button"
        className={`mobile-bar-btn${hasCut ? ' armed' : ''}`}
        onClick={() => cutSelection()}
        title="Cut selected"
        disabled={!hasCut}
      >
        <span className="mobile-bar-icon" aria-hidden="true">🪓</span>
        <span className="mobile-bar-label">Cut</span>
      </button>
      <button
        type="button"
        className={`mobile-bar-btn create${createOpen ? ' active' : ''}`}
        onClick={() => setCreateOpen(!createOpen, createOpen ? undefined : 'trees')}
        title="Create hub"
        aria-expanded={createOpen}
      >
        <span className="mobile-bar-icon" aria-hidden="true">✨</span>
        <span className="mobile-bar-label">Create</span>
      </button>
      <button
        type="button"
        className="mobile-bar-btn"
        onClick={() => onOpenChat?.()}
        title="Chat"
      >
        <span className="mobile-bar-icon" aria-hidden="true">💬</span>
        <span className="mobile-bar-label">Chat</span>
      </button>
      <button
        type="button"
        className={`mobile-bar-btn${mapOpen ? ' active' : ''}`}
        onClick={() => setMapOpen(!mapOpen)}
        title="Map"
        aria-expanded={mapOpen}
      >
        <span className="mobile-bar-icon" aria-hidden="true">🗺️</span>
        <span className="mobile-bar-label">Map</span>
      </button>
      <button
        type="button"
        className="mobile-bar-btn"
        onClick={() => cycleView()}
        title="Camera"
      >
        <span className="mobile-bar-icon" aria-hidden="true">📷</span>
        <span className="mobile-bar-label">View</span>
      </button>
      <button
        type="button"
        className={`mobile-bar-btn${settingsOpen ? ' active' : ''}`}
        onClick={() => setSettingsOpen(!settingsOpen)}
        title="Settings"
        aria-expanded={settingsOpen}
      >
        <span className="mobile-bar-icon" aria-hidden="true">⚙️</span>
        <span className="mobile-bar-label">More</span>
      </button>
    </nav>
  )
}
