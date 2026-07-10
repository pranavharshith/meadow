import { useEffect, useRef, useCallback } from 'react'
import { keys, look } from '../player-state'
import { useStore } from '../store'

// ─────────────────────────────────────────────────────────────────────────────
// TouchJoystick — Dual-zone mobile controller
//
// Left half of screen = movement joystick (floating ring + knob).
//   • Touch down anywhere on the left → ring appears there, knob tracks finger.
//   • Joystick vector is mapped to cardinal `keys` entries so Player.jsx
//     and the game loop need zero changes.
//
// Right half = invisible camera look zone (same as mouse drag in Controls.jsx).
//   • Registers as no-look so it doesn't conflict with the global drag handler
//     when the joystick is visible. Camera look is handled here directly.
//
// The component renders nothing when joystickEnabled is false (settings toggle).
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DIST  = 52   // px — full-tilt radius
const DEAD_ZONE = MAX_DIST * 0.20 // 20% deadzone to prevent drift

const LOOK_SENS = 0.0032 // radians per pixel
const PITCH_MIN = 0.12
const PITCH_MAX = 1.35

export default function TouchJoystick() {
  const enabled = useStore((s) => s.joystickEnabled)

  // Refs so we never need re-renders inside event handlers
  const joyState  = useRef({ active: false, id: null, ox: 0, oy: 0, cx: 0, cy: 0 })
  const lookState = useRef({ active: false, id: null, lx: 0, ly: 0 })

  const ringRef  = useRef(null)
  const knobRef  = useRef(null)
  const wrapRef  = useRef(null)

  // ── Joystick output → keys ──────────────────────────────────────────────
  const applyJoy = useCallback((dx, dy) => {
    const d = Math.hypot(dx, dy)
    if (d < DEAD_ZONE) {
      keys['JoyUp'] = false; keys['JoyDown'] = false
      keys['JoyLeft'] = false; keys['JoyRight'] = false
      return
    }
    const nx = dx / Math.max(d, 1)
    const ny = dy / Math.max(d, 1)
    // Map to WASD-equivalent joy keys — Player.jsx treats them identically
    keys['JoyUp']    = ny < -0.3
    keys['JoyDown']  = ny >  0.3
    keys['JoyLeft']  = nx < -0.3
    keys['JoyRight'] = nx >  0.3
  }, [])

  const clearJoy = useCallback(() => {
    keys['JoyUp'] = false; keys['JoyDown'] = false
    keys['JoyLeft'] = false; keys['JoyRight'] = false
    if (ringRef.current) ringRef.current.style.opacity = '0'
  }, [])

  // ── Update ghost ring position ──────────────────────────────────────────
  const showRingAt = useCallback((ox, oy) => {
    const ring = ringRef.current
    if (!ring) return
    ring.style.left   = ox + 'px'
    ring.style.top    = oy + 'px'
    ring.style.opacity = '1'
  }, [])

  const moveKnob = useCallback((dx, dy) => {
    const knob = knobRef.current
    if (!knob) return
    const d = Math.hypot(dx, dy)
    const clamped = Math.min(d, MAX_DIST)
    const angle   = Math.atan2(dy, dx)
    const kx = Math.cos(angle) * clamped
    const ky = Math.sin(angle) * clamped
    knob.style.transform = `translate(${kx}px, ${ky}px)`
  }, [])

  // ── Touch handlers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) { clearJoy(); return }

    const isLeftZone  = (x) => x < window.innerWidth / 2
    const isRightZone = (x) => x >= window.innerWidth / 2

    const onStart = (e) => {
      for (const touch of e.changedTouches) {
        const tx = touch.clientX
        const ty = touch.clientY

        if (isLeftZone(tx) && !joyState.current.active) {
          joyState.current = { active: true, id: touch.identifier, ox: tx, oy: ty, cx: tx, cy: ty }
          showRingAt(tx, ty)
        } else if (isRightZone(tx) && !lookState.current.active) {
          lookState.current = { active: true, id: touch.identifier, lx: tx, ly: ty }
        }
      }
    }

    const onMove = (e) => {
      for (const touch of e.changedTouches) {
        const joy = joyState.current
        if (joy.active && touch.identifier === joy.id) {
          const dx = touch.clientX - joy.ox
          const dy = touch.clientY - joy.oy
          moveKnob(dx, dy)
          applyJoy(dx, dy)
        }

        const lk = lookState.current
        if (lk.active && touch.identifier === lk.id) {
          const ddx = touch.clientX - lk.lx
          const ddy = touch.clientY - lk.ly
          lk.lx = touch.clientX
          lk.ly = touch.clientY
          look.yaw   -= ddx * LOOK_SENS
          look.pitch  = Math.min(PITCH_MAX, Math.max(PITCH_MIN, look.pitch + ddy * LOOK_SENS))
        }
      }
    }

    const onEnd = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === joyState.current.id) {
          joyState.current.active = false
          clearJoy()
          if (knobRef.current) knobRef.current.style.transform = 'translate(0, 0)'
        }
        if (touch.identifier === lookState.current.id) {
          lookState.current.active = false
        }
      }
    }

    window.addEventListener('touchstart', onStart, { passive: false })
    window.addEventListener('touchmove',  onMove,  { passive: false })
    window.addEventListener('touchend',   onEnd,   { passive: false })
    window.addEventListener('touchcancel',onEnd,   { passive: false })

    return () => {
      clearJoy()
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove',  onMove)
      window.removeEventListener('touchend',   onEnd)
      window.removeEventListener('touchcancel',onEnd)
    }
  }, [enabled, applyJoy, clearJoy, showRingAt, moveKnob])

  if (!enabled) return null

  return (
    <div ref={wrapRef} className="joy-overlay no-look" aria-hidden="true">
      {/* Floating ring: appears where the finger lands on the left half */}
      <div ref={ringRef} className="joy-ring">
        <div ref={knobRef} className="joy-knob" />
      </div>

      {/* Visual left-zone hint (faint semicircle border) */}
      <div className="joy-zone-hint" />
    </div>
  )
}
