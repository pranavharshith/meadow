import { useState, useEffect, useRef } from 'react'
import { PALETTE, useStore } from '../store'
import { supabase } from '../net/supabase'
import { useFocusTrap } from './a11y'

export default function WelcomeScreen() {
  const hasCompletedWelcome = useStore((s) => s.hasCompletedWelcome)
  const completeWelcome = useStore((s) => s.completeWelcome)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const storeColor = useStore((s) => s.color)
  const connecting = useStore((s) => s.connecting)
  
  const [authMode, setAuthMode] = useState('guest') // 'guest', 'email_input', 'otp_input'
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [authNote, setAuthNote] = useState('')
  const [authNoteKind, setAuthNoteKind] = useState('error') // 'error' | 'ok'

  const [inputName, setInputName] = useState('')
  const [selectedColor, setSelectedColor] = useState(storeColor || PALETTE[0])
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isValid, setIsValid] = useState(true)

  const panelRef = useRef(null)
  const open = !hasCompletedWelcome
  useFocusTrap(panelRef, open)
  // Welcome cannot be dismissed with Escape — must enter

  useEffect(() => {
    if (authMode !== 'guest') return
    const check = inputName.trim()
    if (!check || check.length < 2) {
      setIsValid(false)
      return
    }
    setIsValid(true)
    setIsChecking(true)
    const t = setTimeout(async () => {
      if (!supabase) {
        setIsChecking(false)
        setIsValid(true)
        setError('')
        return
      }
      const { data } = await supabase.rpc('check_name_available', { p_name: check })
      setIsChecking(false)
      if (data === false) {
        setIsValid(false)
        setError('name unavailable or invalid')
      } else {
        setIsValid(true)
        setError('')
      }
    }, 300)
    return () => clearTimeout(t)
  }, [inputName, authMode])

  if (hasCompletedWelcome) return null

  const handleGuestEnter = async () => {
    if (!isValid || isChecking || connecting) return
    const cleaned = inputName.trim().slice(0, 18)
    if (cleaned.length < 2) {
      setError('name must be at least 2 characters')
      return
    }
    if (cleaned.toLowerCase() === 'wanderer') {
      setError('please choose a unique name')
      return
    }
    
    setColor(selectedColor)
    setName(cleaned)
    completeWelcome()
  }

  const handleEmailSubmit = async () => {
    if (!email || connecting || !supabase) return
    setAuthNote('sending...')
    setAuthNoteKind('muted')
    const { error: err } = await supabase.auth.signInWithOtp({ email })
    if (err) {
      setAuthNote(err.message)
      setAuthNoteKind('error')
    } else {
      setAuthMode('otp_input')
      setAuthNote('Check your email for the code.')
      setAuthNoteKind('ok')
    }
  }

  const handleOtpSubmit = async () => {
    if (!otpCode || connecting || !supabase) return
    setAuthNote('verifying...')
    setAuthNoteKind('muted')
    const { error: err } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' })
    if (err) {
      setAuthNote(err.message)
      setAuthNoteKind('error')
    } else {
      completeWelcome()
    }
  }

  const resendCode = async () => {
    if (!email || !supabase) return
    setAuthNote('resending...')
    setAuthNoteKind('muted')
    const { error: err } = await supabase.auth.signInWithOtp({ email })
    if (err) {
      setAuthNote(err.message)
      setAuthNoteKind('error')
    } else {
      setAuthNote('Code resent — check your email.')
      setAuthNoteKind('ok')
    }
  }

  const nameHintId = 'welcome-name-hint'
  const authNoteId = 'welcome-auth-note'

  return (
    <div className="welcome-screen" role="presentation">
      <div
        ref={panelRef}
        className="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-desc"
      >
        <h1 id="welcome-title">Welcome to Meadow</h1>
        <p id="welcome-desc">A shared garden to relax, plant trees, and explore.</p>
        
        <div className="auth-mode-tabs" role="tablist" aria-label="Sign-in method">
          <button 
            type="button"
            role="tab"
            aria-selected={authMode === 'guest'}
            className={`btn small ${authMode === 'guest' ? 'primary' : ''}`}
            onClick={() => { setAuthMode('guest'); setAuthNote(''); }}
          >
            Play as Guest
          </button>
          <button 
            type="button"
            role="tab"
            aria-selected={authMode !== 'guest'}
            className={`btn small ${authMode !== 'guest' ? 'primary' : ''}`}
            onClick={() => { setAuthMode('email_input'); setError(''); }}
          >
            Login with Email
          </button>
        </div>

        {authMode === 'guest' && (
          <div className="welcome-form">
            <label htmlFor="welcome-name">Who are you?</label>
            <input 
              id="welcome-name"
              type="text" 
              value={inputName} 
              className={!isValid && inputName.trim().length >= 2 ? 'invalid' : ''}
              aria-invalid={!isValid && inputName.trim().length >= 2}
              aria-describedby={error ? nameHintId : undefined}
              autoComplete="nickname"
              onChange={(e) => {
                setInputName(e.target.value)
                setError('')
              }}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('GAME')}
              placeholder="your name" 
              maxLength={18}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGuestEnter()
              }}
            />
            {error && (
              <div id={nameHintId} className="field-hint error" role="alert">{error}</div>
            )}
            {isChecking && !error && (
              <div className="field-hint muted">checking name…</div>
            )}
            
            <fieldset className="swatch-fieldset">
              <legend>Pick a colour</legend>
              <div className="swatches" role="listbox" aria-label="Avatar colour">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="option"
                    aria-selected={c === selectedColor}
                    className={`swatch${c === selectedColor ? ' sel' : ''}`}
                    style={{ '--swatch-color': c }}
                    onClick={() => setSelectedColor(c)}
                    aria-label={`colour ${c}`}
                  />
                ))}
              </div>
            </fieldset>

            <button 
              type="button"
              className="btn primary welcome-btn" 
              onClick={handleGuestEnter}
              disabled={connecting || !isValid || isChecking || !inputName.trim()}
            >
              {connecting ? 'connecting...' : (isChecking ? 'checking...' : 'Enter Meadow')}
            </button>
          </div>
        )}

        {authMode === 'email_input' && (
          <div className="welcome-form">
            <button
              type="button"
              className="btn small ghost welcome-back"
              onClick={() => setAuthMode('guest')}
            >
              ← Back
            </button>
            <div className="alert-box welcome-progress-warn" role="note" id="welcome-progress-warn">
              <div className="alert-box-body">
                <strong>Guest progress does not merge.</strong>
                {' '}Logging in loads that email’s meadow account. Any guest name, gold, and plantings on this device stay local only and will not move over.
              </div>
            </div>
            <label htmlFor="welcome-email">Email Address</label>
            <input 
              id="welcome-email"
              type="email" 
              value={email}
              autoComplete="email"
              inputMode="email"
              aria-describedby={authNote ? `${authNoteId} welcome-progress-warn` : 'welcome-progress-warn'}
              onChange={(e) => {
                setEmail(e.target.value)
                setAuthNote('')
              }}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('GAME')}
              placeholder="you@email.com" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEmailSubmit()
              }}
            />
            {authNote && (
              <div
                id={authNoteId}
                className={authNoteKind === 'ok' ? 'welcome-success' : authNoteKind === 'muted' ? 'field-hint muted' : 'welcome-error'}
                role={authNoteKind === 'error' ? 'alert' : 'status'}
              >
                {authNote}
              </div>
            )}
            <button 
              type="button"
              className="btn primary welcome-btn" 
              onClick={handleEmailSubmit}
              disabled={connecting || !email.trim()}
            >
              Send Code
            </button>
          </div>
        )}

        {authMode === 'otp_input' && (
          <div className="welcome-form">
            <button
              type="button"
              className="btn small ghost welcome-back"
              onClick={() => { setAuthMode('email_input'); setOtpCode(''); setAuthNote(''); }}
            >
              ← Back
            </button>
            <div className="field-hint muted" id="welcome-progress-warn">
              Verifying will open the email account — not your current guest save.
            </div>
            <label htmlFor="welcome-otp">Enter 6-digit Code</label>
            <input 
              id="welcome-otp"
              type="text" 
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              value={otpCode}
              aria-describedby={authNote ? authNoteId : undefined}
              onChange={(e) => {
                setOtpCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))
                setAuthNote('')
              }}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('GAME')}
              placeholder="123456" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOtpSubmit()
              }}
            />
            {authNote && (
              <div
                id={authNoteId}
                className={authNoteKind === 'ok' ? 'welcome-success' : authNoteKind === 'muted' ? 'field-hint muted' : 'welcome-error'}
                role={authNoteKind === 'error' ? 'alert' : 'status'}
              >
                {authNote}
              </div>
            )}
            <button 
              type="button"
              className="btn primary welcome-btn" 
              onClick={handleOtpSubmit}
              disabled={connecting || !otpCode.trim()}
            >
              Verify & Login
            </button>
            <button
              type="button"
              className="btn small ghost"
              onClick={resendCode}
              disabled={connecting || !email.trim()}
            >
              Resend code
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
