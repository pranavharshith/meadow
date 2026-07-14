import { useEffect, useState, useRef } from 'react'
import { PALETTE, useStore } from '../store'
import { ONLINE, supabase } from '../net/supabase'
import { useFocusTrap, useEscapeKey } from './a11y'

export default function Identity({ open, onClose }) {
  const panelRef = useRef(null)
  useFocusTrap(panelRef, open)
  useEscapeKey(open, onClose)

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
  const isProcessingTeleport = useStore((s) => s.isProcessingTeleport)
  
  const [inputName, setInputName] = useState(name)
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [linkMode, setLinkMode] = useState('email') // 'email', 'otp', 'conflict'
  const [emailNote, setEmailNote] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isValid, setIsValid] = useState(true)

  // Sync local input from store whenever the panel opens
  useEffect(() => {
    if (open) setInputName(name)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const check = inputName.trim()
    if (!check || check.length < 2 || check === name) {
      setIsValid(check === name || check.length >= 2)
      return
    }
    setIsValid(true)
    setIsChecking(true)
    const t = setTimeout(async () => {
      if (!supabase) {
        setIsChecking(false)
        setIsValid(true)
        return
      }
      const { data } = await supabase.rpc('check_name_available', { p_name: check })
      setIsChecking(false)
      if (data === false) setIsValid(false)
      else setIsValid(true)
    }, 300)
    return () => clearTimeout(t)
  }, [inputName, name])

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
    
    try {
      const { data, error } = await supabase.auth.linkIdentity({ 
        provider: 'email', 
        options: { email } 
      });
      if (error && error.status === 422) {
        setLinkMode('conflict')
        setEmailNote('')
        return
      } else if (error) {
        throw error
      }
      setLinkMode('otp')
      setEmailNote('check your email for the code')
    } catch (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('rate')) setEmailNote('too many requests — wait a minute')
      else if (msg.includes('signup') || msg.includes('disabled'))
        setEmailNote('email sign-in is disabled on the server')
      else setEmailNote(`could not send: ${error.message}`)
    }
  }

  const verifyOtp = async () => {
    if (!otpCode) return
    setEmailNote('verifying...')
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' })
    if (error) {
      setEmailNote(error.message)
    } else {
      setEmailNote('Account linked successfully!')
      setTimeout(() => {
        setLinkMode('email')
        setEmail('')
        setOtpCode('')
        setEmailNote('')
      }, 2000)
    }
  }

  const handleConflictAccept = async () => {
    setEmailNote('switching accounts...')
    await supabase.auth.signOut()
    await supabase.auth.signInWithOtp({ email })
    // Net.jsx will handle the auth state change and reload the world.
    // The user will be prompted to enter the OTP on the Welcome Screen.
    useStore.getState().setOnline(false) // Trigger a reset
    window.location.reload() // Fastest way to reset all game state cleanly
  }

  return (
    <div
      ref={panelRef}
      className={`identity no-look${open ? ' open' : ''}`}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby="identity-title"
    >
      <h2 id="identity-title" className="sr-only">Your identity</h2>
      <label htmlFor="identity-name">
        Your name {isChecking ? '(checking...)' : (!isValid ? '(unavailable)' : '')}
      </label>
      <input 
        id="identity-name"
        value={inputName} 
        maxLength={18} 
        className={!isValid && !isChecking ? 'invalid' : ''}
        aria-invalid={!isValid && !isChecking}
        autoComplete="nickname"
        onChange={(e) => setInputName(e.target.value)} 
        onBlur={(e) => { useStore.getState().setInputContext('UI'); if(isValid && !isChecking) commitName(e); }} 
        onFocus={() => useStore.getState().setInputContext('CHAT')}
        placeholder="wanderer" 
      />
      <fieldset className="swatch-fieldset">
        <legend>Colour</legend>
        <div className="swatches" role="listbox" aria-label="Avatar colour">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              role="option"
              aria-selected={c === color}
              className={`swatch${c === color ? ' sel' : ''}`}
              style={{ '--swatch-color': c }}
              onClick={() => setColor(c)}
              aria-label={`colour ${c}`}
            />
          ))}
        </div>
      </fieldset>
      <div className="stat-grid">
        <div className="stat-grid-title">Statistics</div>
        <div className="stat-row">
          <span className="stat-label">Trees Planted</span><span>{treesPlanted}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Landmarks</span><span>{discovered.length} / 10</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Joined</span><span>{joinDate ? new Date(joinDate).toLocaleDateString() : 'Unknown'}</span>
        </div>
      </div>
      {online && linkMode === 'email' && (
        <>
          <label htmlFor="identity-email">Keep across devices (optional)</label>
          <div className="row">
            <input
              id="identity-email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('UI')}
              placeholder="you@email.com"
            />
            <button type="button" className="btn small" onClick={saveEmail}>
              link
            </button>
          </div>
          {emailNote && <div className="note" role="status">{emailNote}</div>}
        </>
      )}
      {online && linkMode === 'otp' && (
        <>
          <label htmlFor="identity-otp">Enter 6-digit Code</label>
          <div className="row">
            <input
              id="identity-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('UI')}
              placeholder="123456"
            />
            <button type="button" className="btn small" onClick={verifyOtp}>
              verify
            </button>
          </div>
          {emailNote && <div className="note" role="status">{emailNote}</div>}
        </>
      )}
      {online && linkMode === 'conflict' && (
        <div className="alert-box" role="alertdialog" aria-labelledby="identity-conflict-title">
          <div className="alert-box-body" id="identity-conflict-title">
            This email is already linked to another Meadow account. Do you want to log out of this guest account and log into the old one?
            <br/><br/>
            <strong>Note: Your current guest progress will be lost.</strong>
          </div>
          <div className="row">
            <button type="button" className="btn small danger-soft" onClick={handleConflictAccept}>
              Switch Account
            </button>
            <button type="button" className="btn small" onClick={() => { setLinkMode('email'); setEmailNote(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="row mt">
        <button
          type="button"
          className={`btn small${gold < 40 || isProcessingTeleport ? ' disabled' : ''}`}
          onClick={() => gold >= 40 && useStore.getState().setSpawnHere()}
          disabled={isProcessingTeleport || gold < 40}
        >
          📍 Set Here · 40g
        </button>
      </div>
      <button type="button" className="btn small" onClick={handleDone}>
        done
      </button>
    </div>
  )
}
