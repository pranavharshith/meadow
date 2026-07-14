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

    let dragging = false
    let hasMoved = false
    let lx = 0
    let ly = 0
    const onDown = (e) => {
      // Ignore right-clicks (2) and middle-clicks (1) so the browser's context menu (Inspect) works
      if (e.button !== 0) return
      
      if (e.target.closest && e.target.closest('.no-look')) return
      
      if (!document.pointerLockElement && e.target.tagName === 'CANVAS') {
        const promise = e.target.requestPointerLock()
        if (promise) promise.catch(() => {})
      }
      
      dragging = true
      hasMoved = false
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
      
      if (!hasMoved && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        hasMoved = true
        useStore.getState().setIsDraggingCamera(true)
      }
      
      // Prevent dragging from secretly spinning the camera while in Map or Drone view
      const view = useStore.getState().viewMode
      if (view !== 'top' && view !== 'drone') {
        look.yaw -= dx * LOOK_SENS
        const pMin = view === 'first' ? -1.5 : PITCH_MIN
        const pMax = view === 'first' ? 1.5 : PITCH_MAX
        look.pitch = Math.min(pMax, Math.max(pMin, look.pitch + dy * LOOK_SENS))
      }
    }
    const onUp = () => {
      dragging = false
      if (hasMoved) {
        setTimeout(() => {
          useStore.getState().setIsDraggingCamera(false)
        }, 50)
      }
      if (document.pointerLockElement) {
        document.exitPointerLock()
      }
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
