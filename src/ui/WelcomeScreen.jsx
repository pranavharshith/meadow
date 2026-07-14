import { useState, useEffect } from 'react'
import { PALETTE, useStore } from '../store'
import { supabase } from '../net/supabase'

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

  const [inputName, setInputName] = useState('')
  const [selectedColor, setSelectedColor] = useState(storeColor || PALETTE[0])
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isValid, setIsValid] = useState(true)

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
    if (!email || connecting) return
    setAuthNote('sending...')
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (error) {
      setAuthNote(error.message)
    } else {
      setAuthMode('otp_input')
      setAuthNote('Check your email for the code.')
    }
  }

  const handleOtpSubmit = async () => {
    if (!otpCode || connecting) return
    setAuthNote('verifying...')
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' })
    if (error) {
      setAuthNote(error.message)
    } else {
      // Supabase handles the session automatically
      completeWelcome()
    }
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-panel">
        <h1>Welcome to Meadow</h1>
        <p>A shared garden to relax, plant trees, and explore.</p>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button 
            className={`btn small ${authMode === 'guest' ? 'primary' : ''}`}
            onClick={() => setAuthMode('guest')}
          >
            Play as Guest
          </button>
          <button 
            className={`btn small ${authMode !== 'guest' ? 'primary' : ''}`}
            onClick={() => setAuthMode('email_input')}
          >
            Login with Email
          </button>
        </div>

        {authMode === 'guest' && (
          <div className="welcome-form">
            <label>Who are you?</label>
            <input 
              type="text" 
              value={inputName} 
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
            
            <label>Pick a colour</label>
            <div className="swatches">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={`swatch${c === selectedColor ? ' sel' : ''}`}
                  style={{ background: c }}
                  onClick={() => setSelectedColor(c)}
                  aria-label={`colour ${c}`}
                />
              ))}
            </div>

            {error && <div className="welcome-error">{error}</div>}

            <button 
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
            <label>Email Address</label>
            <input 
              type="email" 
              value={email} 
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
            {authNote && <div className="welcome-error">{authNote}</div>}
            <button 
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
            <label>Enter 6-digit Code</label>
            <input 
              type="text" 
              value={otpCode} 
              onChange={(e) => {
                setOtpCode(e.target.value)
                setAuthNote('')
              }}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('GAME')}
              placeholder="123456" 
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOtpSubmit()
              }}
            />
            {authNote && <div className="welcome-error">{authNote}</div>}
            <button 
              className="btn primary welcome-btn" 
              onClick={handleOtpSubmit}
              disabled={connecting || !otpCode.trim()}
            >
              Verify & Login
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
