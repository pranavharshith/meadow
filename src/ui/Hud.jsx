import { useEffect, useRef, useState } from 'react'
import { useStore, PALETTE } from '../store'
import { place, placement } from '../player-state'
import { supabase, ONLINE } from '../net/supabase'
import Minimap from './Minimap'
import Chat from './Chat'
import WorldMap from './WorldMap'
import Settings from './Settings'
import Screenshot from './Screenshot'
import Compass from './Compass'
import Shop from './Shop'
import { TREE_ITEMS, ROCK_ITEMS } from './Shop'

const VIEW_LABEL = { third: 'Follow', first: 'First person', top: 'Map' }

// Shows the name of the place you're standing in, when near a landmark.
function PlaceLabel() {
  const [name, setName] = useState('')
  useEffect(() => {
    let raf
    const tick = () => {
      setName((n) => (n !== place.name ? place.name : n))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className={`place${name ? ' show' : ''}`}>{name}</div>
}

function Status() {
  const online = useStore((s) => s.online)
  const count = useStore((s) => s.playerCount)
  const connectionStatus = useStore((s) => s.connectionStatus)
  return (
    <div className={`status${online ? ' on' : ''}${connectionStatus === 'reconnecting' ? ' reconnecting' : ''}`}>
      <span className="live" />
      {connectionStatus === 'reconnecting' ? 'reconnecting…' : online ? `${count} here` : 'offline'}
    </div>
  )
}

function Identity({ open, onClose }) {
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const online = useStore((s) => s.online)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const [email, setEmail] = useState('')
  const [emailNote, setEmailNote] = useState('')

  const saveEmail = async () => {
    if (!ONLINE || !supabase || !email) return
    const { error } = await supabase.auth.updateUser({ email })
    setEmailNote(error ? 'could not send link' : 'check your email to confirm')
  }

  return (
    <div className={`identity no-look${open ? ' open' : ''}`}>
      <label>Your name</label>
      <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} placeholder="wanderer" />
      <label>Colour</label>
      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={`swatch${c === color ? ' sel' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`colour ${c}`}
          />
        ))}
      </div>
      {online && (
        <>
          <label>Keep across devices (optional)</label>
          <div className="row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
            />
            <button className="btn small" onClick={saveEmail}>
              link
            </button>
          </div>
          {emailNote && <div className="note">{emailNote}</div>}
        </>
      )}
      <button className="btn small" onClick={onClose}>
        done
      </button>
    </div>
  )
}

function Toast() {
  const toast = useStore((s) => s.toast)
  return <div className={`toast${toast ? ' show' : ''}`}>{toast ? toast.msg : ''}</div>
}

// Placement banner. Appears at top-center while the player is choosing where
// to plant a tree / place a rock. Shows the subject, the current validity
// state, and offers Place / Cancel buttons. `placement.valid` is written
// every frame by <PlacementPreview/>; we poll it at ~10 Hz for the label.
function PlacementBanner() {
  const mode = useStore((s) => s.placementMode)
  const subject = useStore((s) => s.placementSubject)
  const confirm = useStore((s) => s.confirmPlacement)
  const cancel = useStore((s) => s.cancelPlacement)
  const [status, setStatus] = useState({ valid: true, reason: '' })

  // Poll the shared placement ref a few times a second. Cheap enough not
  // to matter, and avoids re-rendering the world on every frame.
  useEffect(() => {
    if (!mode) return
    const id = window.setInterval(() => {
      setStatus({ valid: placement.valid, reason: placement.reason })
    }, 120)
    return () => window.clearInterval(id)
  }, [mode])

  if (!mode || !subject) return null
  return (
    <div className={`place-banner no-look ${status.valid ? 'ok' : 'bad'}`}>
      <div className="place-banner-info">
        <div className="place-banner-title">
          {subject.emoji || (mode === 'rock' ? '🪨' : '🌳')} placing {subject.name || (mode === 'rock' ? 'a rock' : 'a tree')}
        </div>
        <div className="place-banner-status">
          {status.valid ? '✓ good spot' : `✗ ${status.reason || 'blocked'}`}
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

// Contextual "Cut" action pill. Sits above the main HUD button row so it
// never overlaps the persistent commands, and only appears when the player
// has a tree or rock selected — the outline in the scene already tells
// them what will be cut.
function CutAction({ selection, onCut }) {
  const clearSelection = useStore((s) => s.clearSelection)
  return (
    <div className={`cut-pill no-look${selection ? ' show' : ''}`}>
      <span className="cut-pill-label">
        {selection ? `${selection.kind === 'rock' ? '🪨 rock' : '🌳 tree'} selected` : ''}
      </span>
      <button className="cut-pill-cancel" onClick={clearSelection} title="Cancel (Esc)">
        ✕
      </button>
      <button className="cut-pill-action" onClick={onCut} title="Cut selected (X)">
        ✂ Cut
        <span className="cut-pill-key">X</span>
      </button>
    </div>
  )
}

function NavIndicator() {
  const navTarget = useStore((s) => s.navTarget)
  const clearNav = useStore((s) => s.clearNav)
  if (!navTarget) return null
  return (
    <button className="nav-indicator no-look" onClick={clearNav} title="click to cancel navigation">
      <span className="nav-arrow">›</span>
      <span className="nav-name">{navTarget.name}</span>
      <span className="nav-cancel">×</span>
    </button>
  )
}

export default function Hud() {
  const gold = useStore((s) => s.gold)
  const view = useStore((s) => s.viewMode)
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const cycleView = useStore((s) => s.cycleView)
  const plantTree = useStore((s) => s.plantTree)
  const cutSelection = useStore((s) => s.cutSelection)
  const selection = useStore((s) => s.selection)
  const shopOpen = useStore((s) => s.shopOpen)
  const setShopOpen = useStore((s) => s.setShopOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const [seen, setSeen] = useState(false)
  const [editing, setEditing] = useState(false)

  // Derive label for the plant/place button from selected item
  const isRock = selectedItem.type === 'rock'
  const allItems = isRock ? ROCK_ITEMS : TREE_ITEMS
  const currentItem = allItems.find((i) => i.id === selectedItem.id) || allItems[0]
  const plantLabel = isRock ? `Place ${currentItem.emoji}` : `Plant ${currentItem.emoji}`

  return (
    <div className="ui">
      <div className="topbar">
        <div className="brand">
          <div className="title">a shared garden</div>
          <div className="who no-look">
            <button className="tag" onClick={() => setEditing((v) => !v)} title="edit name & colour">
              <span className="dot" style={{ background: color }} />
              {name}
            </button>
            <div className="gold">
              <span className="coin" /> {gold}
            </div>
            <Status />
          </div>
          <Identity open={editing} onClose={() => setEditing(false)} />
        </div>
        <Minimap />
        <Compass />
      </div>

      <PlaceLabel />
      <Toast />
      <PlacementBanner />
      <CutAction selection={selection} onCut={cutSelection} />

      {!seen && (
        <div className="hint" onPointerDown={() => setSeen(true)}>
          drag to look · <b>WASD</b> walk · <b>V</b> view · <b>E</b> plant/place (press again to confirm) · <b>R</b> water · click a tree/rock then <b>X</b> cut · <b>G</b> shop · <b>Enter</b> chat
        </div>
      )}

      <div className="controls">
        <div className="buttons no-look">
          <button className="btn" onClick={cycleView}>
            {VIEW_LABEL[view]}
          </button>
          <button className="btn plant" onClick={plantTree} title="Plant / Place selected item (E)">
            {plantLabel}
          </button>
          <button
            className={`btn shop-btn${shopOpen ? ' active' : ''}`}
            onClick={() => setShopOpen(!shopOpen)}
            title="Nature Shop (G)"
          >
            🌿 Shop
          </button>
          <Screenshot />
          <Settings />
        </div>
      </div>

      <Chat />
      <Shop />
      <WorldMap />
      <NavIndicator />
    </div>
  )
}
