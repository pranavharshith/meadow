import { useState } from 'react'
import { PALETTE, useStore } from '../store'
import { ONLINE, supabase } from '../net/supabase'

export default function Identity({ open, onClose }) {
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const online = useStore((s) => s.online)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const [email, setEmail] = useState('')
  const [emailNote, setEmailNote] = useState('')

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
    // Surface the real reason so setup problems are debuggable.
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
