import { useEffect } from 'react'
import { keys, look, P } from './player-state'
import { useStore } from './store'

const LOOK_SENS = 0.0026
const PITCH_MIN = -0.8 // Allow camera to tilt upwards in third-person
const PITCH_MAX = 1.35
const ZOOM_MIN = 0.55
const ZOOM_MAX = 2.2

// Global keyboard + drag-to-look input. Drags that begin on UI (.no-look)
// elements are ignored so buttons don't rotate the camera.
export default function Controls() {
  useEffect(() => {
    // True when the user is typing into a text field (chat, name, email) so
    // keyboard input never leaks into movement / actions.
    const isTyping = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    const onKeyDown = (e) => {
      if (e.repeat) return
      if (isTyping()) return
      const st = useStore.getState()
      // Ignore gameplay hotkeys and WASD if UI overlay is open, but allow toggles
      if (st.shopOpen || st.mapOpen) {
        if (e.code !== 'Escape' && e.code !== 'KeyG' && e.code !== 'KeyM' && e.code !== 'KeyV') {
          return
        }
      }

      keys[e.code] = true

      // If the player presses a movement key, cancel sitting
      if (P.emote === 'sit' && (
        e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
        e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight'
      )) {
        P.emote = null
      }
      if (e.code === 'KeyE') st.plantTree() // enters placement, or confirms if already in it
      else if (e.code === 'KeyR') st.waterNearest()
      else if (e.code === 'KeyX') st.cutSelection()
      else if (e.code === 'Escape') {
        if (document.pointerLockElement) {
          document.exitPointerLock()
        } else {
          // Placement takes precedence over selection so pressing Esc doesn't
          // silently clear a selection that wasn't the user's focus.
          if (st.placementMode) st.cancelPlacement()
          else st.clearSelection()
        }
      }
      else if (e.code === 'KeyG') {
        const next = !st.shopOpen
        st.setShopOpen(next)
        if (next && document.pointerLockElement) document.exitPointerLock()
      }
      else if (e.code === 'KeyV') st.cycleView()
      else if (e.code === 'KeyM') st.toggleMute()
      else if (e.code === 'KeyC') P.emote = P.emote === 'sit' ? null : 'sit'
      else if (e.code === 'KeyF') {
        P.emote = 'wave'
        P.emoteUntil = performance.now() + 1600
      }
    }
    const onKeyUp = (e) => {
      // clear regardless so a key held before focusing an input can't stick
      keys[e.code] = false
    }

    let dragging = false
    let lx = 0
    let ly = 0
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.no-look')) return
      
      if (!document.pointerLockElement && e.target.tagName === 'CANVAS') {
        e.target.requestPointerLock()
      }
      
      dragging = true
      lx = e.clientX
      ly = e.clientY
      // any movement key / drag cancels sitting
      if (P.emote === 'sit') P.emote = null
    }
    const onMove = (e) => {
      const isLocked = !!document.pointerLockElement
      if (!dragging && !isLocked) return
      
      look.lastLookTime = performance.now()

      let dx = 0
      let dy = 0

      if (isLocked) {
        dx = e.movementX || 0
        dy = e.movementY || 0
      } else {
        dx = e.clientX - lx
        dy = e.clientY - ly
        lx = e.clientX
        ly = e.clientY
      }
      
      // Prevent dragging from secretly spinning the camera while in Map view
      if (useStore.getState().viewMode !== 'top') {
        look.yaw -= dx * LOOK_SENS
        const view = useStore.getState().viewMode
        const pMin = view === 'first' ? -1.5 : PITCH_MIN
        const pMax = view === 'first' ? 1.5 : PITCH_MAX
        look.pitch = Math.min(pMax, Math.max(pMin, look.pitch + dy * LOOK_SENS))
      }
    }
    const onUp = () => {
      dragging = false
    }
    const onWheel = (e) => {
      // Same guard as onDown: scrolling inside a UI panel (chat, settings,
      // shop, worldmap, etc.) must not steal the wheel for camera zoom.
      if (e.target && e.target.closest && e.target.closest('.no-look')) return
      look.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, look.zoom + e.deltaY * 0.0012))
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  return null
}
