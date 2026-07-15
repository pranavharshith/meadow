import { useEffect } from 'react'
import { keys, look, P, pointer, releaseAllKeys } from './player-state'
import { useStore } from './store'

const LOOK_SENS = 0.0026
const PITCH_MIN = -0.8 // Allow camera to tilt upwards in third-person
const PITCH_MAX = 1.35
const ZOOM_MIN = 0.55
const ZOOM_MAX = 2.2
// A gesture only becomes a camera drag once it travels past this many pixels.
// Below it, the press stays a clean tap so world clicks aren't stolen by tiny
// jitter, and the cursor is never locked for a simple selection.
const DRAG_THRESHOLD = 6

// Global keyboard + drag-to-look input. Drags that begin on UI (.no-look)
// elements are ignored so buttons don't rotate the camera.
export default function Controls() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return
      const st = useStore.getState()
      
      // If we are actively chatting/typing, block all global hotkeys except Escape (which closes chat)
      if (st.inputContext === 'CHAT') {
        if (e.code === 'Escape') {
          // If we want Escape to also blur the input, the Chat input component handles that.
          // But we must return so Escape doesn't cancel placement underneath.
          return
        }
        return
      }

      // Ignore gameplay hotkeys and WASD if UI overlay is open, but allow toggles
      // Create hub / map / social UI — only allow toggle hotkeys
      if (st.inputContext === 'UI' || st.createOpen || st.mapOpen) {
        if (e.code !== 'Escape' && e.code !== 'KeyG' && e.code !== 'KeyQ' && e.code !== 'KeyM' && e.code !== 'KeyV') {
          return
        }
      }

      keys[e.code] = true

      // If the player presses a movement key, cancel sitting
      if (P.emote === 'sit' && (
        e.code === st.keybinds.forward || e.code === st.keybinds.left || e.code === st.keybinds.backward || e.code === st.keybinds.right ||
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
        }
        if (st.placementMode) st.cancelPlacement()
        else st.clearSelection()
      }
      else if (e.code === 'KeyG') {
        // Toggle Create hub (nature tabs). If already open on craft, switch to trees.
        if (st.createOpen && st.createTab !== 'craft') st.setCreateOpen(false)
        else {
          st.setCreateOpen(true, 'trees')
          if (document.pointerLockElement) document.exitPointerLock()
        }
      }
      else if (e.code === 'KeyQ') {
        if (st.createOpen && st.createTab === 'craft') st.setCreateOpen(false)
        else {
          st.setCreateOpen(true, 'craft')
          if (document.pointerLockElement) document.exitPointerLock()
        }
      }
      else if (e.code === 'KeyV') st.cycleView()
      else if (e.code === 'KeyM') {
        const next = !st.mapOpen
        st.setMapOpen(next)
        if (next && document.pointerLockElement) document.exitPointerLock()
      }
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

    // Touch is owned by TouchJoystick when the on-screen joystick is enabled,
    // so the same finger can't drive both systems and double the sensitivity.
    const touchOwnedElsewhere = (e) =>
      e.pointerType === 'touch' && useStore.getState().joystickEnabled

    let holding = false // primary button is down
    let downX = 0
    let downY = 0
    let lx = 0
    let ly = 0

    const onDown = (e) => {
      // Ignore right-clicks (2) and middle-clicks (1) so the browser's context menu (Inspect) works
      if (e.button !== 0) return
      if (touchOwnedElsewhere(e)) return
      if (e.target.closest && e.target.closest('.no-look')) return

      holding = true
      downX = lx = e.clientX
      downY = ly = e.clientY
      // Every fresh press starts as a tap; it only becomes a drag once the
      // pointer travels past the threshold (see onMove).
      pointer.moved = false
      pointer.dragging = false
      // any movement key / drag cancels sitting
      if (P.emote === 'sit') P.emote = null
    }

    const beginDrag = (e) => {
      pointer.moved = true
      pointer.dragging = true
      useStore.getState().setIsDraggingCamera(true)
      // Lock the pointer only now, on a genuine drag — never on a plain click.
      // This removes the cursor flicker and the rapid lock/unlock race.
      if (!document.pointerLockElement && e.target && e.target.tagName === 'CANVAS') {
        const promise = e.target.requestPointerLock()
        if (promise && promise.catch) promise.catch(() => {})
      }
    }

    const onMove = (e) => {
      if (touchOwnedElsewhere(e)) return
      const isLocked = !!document.pointerLockElement
      if (!holding && !isLocked) return

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

      // Promote to a drag once we've clearly moved. Until then, swallow the
      // tiny deltas so a selecting tap never nudges the camera.
      if (!pointer.dragging) {
        if (Math.abs(e.clientX - downX) < DRAG_THRESHOLD &&
            Math.abs(e.clientY - downY) < DRAG_THRESHOLD) return
        beginDrag(e)
      }

      // Dragging never spins the camera in Map or Drone (top-down) views.
      const view = useStore.getState().viewMode
      if (view !== 'top' && view !== 'drone') {
        look.yaw -= dx * LOOK_SENS
        const pMin = view === 'first' ? -1.5 : PITCH_MIN
        const pMax = view === 'first' ? 1.5 : PITCH_MAX
        look.pitch = Math.min(pMax, Math.max(pMin, look.pitch + dy * LOOK_SENS))
      }
    }

    const onUp = (e) => {
      if (touchOwnedElsewhere(e)) return
      holding = false
      // `pointer.moved` stays true until the next press so world onClick
      // handlers (which fire on this same pointer-up, just before us) can see
      // it. The drag flag itself ends immediately.
      pointer.dragging = false
      useStore.getState().setIsDraggingCamera(false)
      if (document.pointerLockElement) document.exitPointerLock()
    }

    const onWheel = (e) => {
      // Same guard as onDown: scrolling inside a UI panel (chat, settings,
      // shop, worldmap, etc.) must not steal the wheel for camera zoom.
      if (e.target && e.target.closest && e.target.closest('.no-look')) return
      look.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, look.zoom + e.deltaY * 0.0012))
    }

    // Losing focus (alt-tab, switching tabs, opening devtools) can swallow the
    // keyup, leaving a movement key stuck down. Release everything so we always
    // return to a calm, still avatar.
    const onBlur = () => {
      releaseAllKeys()
      holding = false
      pointer.moved = false
      pointer.dragging = false
      useStore.getState().setIsDraggingCamera(false)
    }
    const onVisibility = () => {
      if (document.hidden) onBlur()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
