import { useEffect, useRef, useState } from 'react'
import { useStore, PALETTE } from '../store'
import { place } from '../player-state'
import Minimap from './Minimap'

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

function Identity({ open, onClose }) {
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const ref = useRef()
  return (
    <div className={`identity no-look${open ? ' open' : ''}`} ref={ref}>
      <label>Your name</label>
      <input
        value={name}
        maxLength={18}
        onChange={(e) => setName(e.target.value)}
        placeholder="wanderer"
      />
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

export default function Hud() {
  const gold = useStore((s) => s.gold)
  const muted = useStore((s) => s.muted)
  const view = useStore((s) => s.viewMode)
  const name = useStore((s) => s.name)
  const cycleView = useStore((s) => s.cycleView)
  const toggleMute = useStore((s) => s.toggleMute)
  const plantTree = useStore((s) => s.plantTree)
  const [seen, setSeen] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <div className="ui">
      <div className="topbar">
        <div className="brand">
          <div className="title">a shared garden</div>
          <div className="who no-look">
            <button className="tag" onClick={() => setEditing((v) => !v)} title="edit name & colour">
              <span className="dot" style={{ background: useStore.getState().color }} />
              {name}
            </button>
            <div className="gold">
              <span className="coin" /> {gold}
            </div>
          </div>
          <Identity open={editing} onClose={() => setEditing(false)} />
        </div>
        <Minimap />
      </div>

      <PlaceLabel />
      <Toast />

      {!seen && (
        <div className="hint" onPointerDown={() => setSeen(true)}>
          drag to look · <b>WASD</b> walk · <b>V</b> view · <b>E</b> plant · <b>R</b> water · <b>C</b> sit · <b>F</b> wave · scroll zoom
        </div>
      )}

      <div className="controls">
        <div className="buttons no-look">
          <button className="btn" onClick={cycleView}>
            {VIEW_LABEL[view]}
          </button>
          <button className="btn plant" onClick={plantTree}>
            Plant
          </button>
          <button className="btn icon" onClick={toggleMute} aria-label="toggle sound">
            {muted ? 'muted' : 'sound'}
          </button>
        </div>
      </div>
    </div>
  )
}
