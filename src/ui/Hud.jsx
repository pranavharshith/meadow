import { useEffect, useRef, useState } from 'react'
import { useStore, PALETTE } from '../store'
import { place } from '../player-state'
import { supabase, ONLINE } from '../net/supabase'
import Minimap from './Minimap'
import Chat from './Chat'

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
  return (
    <div className={`status${online ? ' on' : ''}`}>
      <span className="live" />
      {online ? `${count} here` : 'offline'}
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

export default function Hud() {
  const gold = useStore((s) => s.gold)
  const muted = useStore((s) => s.muted)
  const view = useStore((s) => s.viewMode)
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
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
      </div>

      <PlaceLabel />
      <Toast />

      {!seen && (
        <div className="hint" onPointerDown={() => setSeen(true)}>
          drag to look · <b>WASD</b> walk · <b>V</b> view · <b>E</b> plant · <b>R</b> water · <b>C</b> sit · <b>F</b> wave · <b>Enter</b> chat
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

      <Chat />
    </div>
  )
}
