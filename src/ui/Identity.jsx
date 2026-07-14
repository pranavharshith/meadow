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
    <div className={`identity no-look${open ? ' open' : ''}`}>
      <label>Your name {isChecking ? '(checking...)' : (!isValid ? '(unavailable)' : '')}</label>
      <input 
        value={inputName} 
        maxLength={18} 
        className={!isValid && !isChecking ? 'invalid' : ''}
        onChange={(e) => setInputName(e.target.value)} 
        onBlur={(e) => { useStore.getState().setInputContext('UI'); if(isValid && !isChecking) commitName(e); }} 
        onFocus={() => useStore.getState().setInputContext('CHAT')}
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
      {online && linkMode === 'email' && (
        <>
          <label>Keep across devices (optional)</label>
          <div className="row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('UI')}
              placeholder="you@email.com"
            />
            <button className="btn small" onClick={saveEmail}>
              link
            </button>
          </div>
          {emailNote && <div className="note">{emailNote}</div>}
        </>
      )}
      {online && linkMode === 'otp' && (
        <>
          <label>Enter 6-digit Code</label>
          <div className="row">
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('UI')}
              placeholder="123456"
            />
            <button className="btn small" onClick={verifyOtp}>
              verify
            </button>
          </div>
          {emailNote && <div className="note">{emailNote}</div>}
        </>
      )}
      {online && linkMode === 'conflict' && (
        <div style={{ background: 'rgba(255,50,50,0.1)', padding: '8px', borderRadius: '4px', margin: '8px 0', border: '1px solid rgba(255,50,50,0.3)' }}>
          <div style={{ marginBottom: '8px', fontSize: '0.85em', color: 'rgba(255,200,200,0.9)' }}>
            This email is already linked to another Meadow account. Do you want to log out of this guest account and log into the old one?
            <br/><br/>
            <strong>Note: Your current guest progress will be lost.</strong>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn small" style={{ background: 'rgba(255,50,50,0.2)' }} onClick={handleConflictAccept}>
              Switch Account
            </button>
            <button className="btn small" onClick={() => { setLinkMode('email'); setEmailNote(''); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        <button
          className={`btn small${gold < 40 || isProcessingTeleport ? ' disabled' : ''}`}
          onClick={() => gold >= 40 && useStore.getState().setSpawnHere()}
          disabled={isProcessingTeleport}
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
