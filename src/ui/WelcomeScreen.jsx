import { useState, useEffect } from 'react'
import { PALETTE, useStore } from '../store'
import { supabase } from '../net/supabase'

export default function WelcomeScreen() {
  const name = useStore((s) => s.name)
  const setName = useStore((s) => s.setName)
  const setColor = useStore((s) => s.setColor)
  const storeColor = useStore((s) => s.color)
  const connecting = useStore((s) => s.connecting)
  
  const [inputName, setInputName] = useState('')
  const [selectedColor, setSelectedColor] = useState(storeColor || PALETTE[0])
  const [error, setError] = useState('')
  const [isChecking, setIsChecking] = useState(false)
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
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
  }, [inputName])

  // If the user already has a valid name, hide this screen.
  // It intercepts the UI rendering before the user enters the game.
  if (name) return null

  const handleEnter = async () => {
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
    
    // Commit the changes to the store, which will trigger bridge.saveIdentity
    setColor(selectedColor)
    setName(cleaned)
  }

  return (
    <div className="welcome-screen">
      <div className="welcome-panel">
        <h1>Welcome to Meadow</h1>
        <p>A shared garden to relax, plant trees, and explore.</p>
        
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
              if (e.key === 'Enter') handleEnter()
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
            onClick={handleEnter}
            disabled={connecting || !isValid || isChecking || !inputName.trim()}
          >
            {connecting ? 'connecting...' : (isChecking ? 'checking...' : 'Enter Meadow')}
          </button>
        </div>
      </div>
    </div>
  )
}
