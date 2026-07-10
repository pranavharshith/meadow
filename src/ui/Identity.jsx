import { useEffect, useState } from 'react'
import { PALETTE, useStore } from '../store'
import { ONLINE, supabase } from '../net/supabase'

export default function Identity({ open, onClose }) {
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const gold = useStore((s) => s.gold)
  const online = useStore((s) => s.online)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const flash = useStore((s) => s.flash)
  const treesPlanted = useStore((s) => s.treesPlanted)
  const discovered = useStore((s) => s.discovered)
  const joinDate = useStore((s) => s.joinDate)
  
  const [inputName, setInputName] = useState(name)
  const [email, setEmail] = useState('')
  const [emailNote, setEmailNote] = useState('')

  // Sync local input from store whenever the panel opens
  useEffect(() => {
    if (open) setInputName(name)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitName = () => {
    const cleaned = inputName.trim().slice(0, 18) || 'wanderer'
    if (cleaned.length < 2) {
      flash('name must be at least 2 characters')
      setInputName(name)
      return
    }
    setName(cleaned)
  }

  const handleDone = () => {
    commitName()
    onClose()
  }

  const saveEmail = async () => {
    if (!ONLINE || !supabase || !email) return
    setEmailNote('sending…')
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: window.location.origin }
    )
    if (!error) {
      setEmailNote('check your email to confirm')
      return
    }
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('rate')) setEmailNote('too many requests — wait a minute')
    else if (msg.includes('already') || msg.includes('registered'))
      setEmailNote('that email is already linked to another account')
    else if (msg.includes('signup') || msg.includes('disabled'))
      setEmailNote('email sign-in is disabled on the server')
    else setEmailNote(`could not send: ${error.message}`)
  }

  return (
    <div className={`identity no-look${open ? ' open' : ''}`}>
      <label>Your name</label>
      <input value={inputName} maxLength={18} onChange={(e) => setInputName(e.target.value)} onBlur={commitName} placeholder="wanderer" />
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
      <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
        <div style={{ marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '2px', fontSize: '0.85em', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.9)' }}>Statistics</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', marginBottom: '2px', color: 'white' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Trees Planted</span><span>{treesPlanted}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', marginBottom: '2px', color: 'white' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Landmarks</span><span>{discovered.length} / 10</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85em', color: 'white' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>Joined</span><span>{joinDate ? new Date(joinDate).toLocaleDateString() : 'Unknown'}</span>
        </div>
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
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className={`btn small${gold < 40 ? ' disabled' : ''}`}
          onClick={() => gold >= 40 && useStore.getState().setSpawnHere()}
        >
          📍 Set Here · 40g
        </button>
      </div>
      <button className="btn small" onClick={handleDone}>
        done
      </button>
    </div>
  )
}
