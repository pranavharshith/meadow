import { useEffect } from 'react'
import { keys, look, P } from './player-state'
import { useStore } from './store'

const LOOK_SENS = 0.0026
const PITCH_MIN = 0.12
const PITCH_MAX = 1.35
const ZOOM_MIN = 0.55
const ZOOM_MAX = 2.2

// Global keyboard + drag-to-look input. Drags that begin on UI (.no-look)
// elements are ignored so buttons don't rotate the camera.
export default function Controls() {
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return
      keys[e.code] = true
      const st = useStore.getState()
      if (e.code === 'KeyE') st.plantTree()
      else if (e.code === 'KeyR') st.waterNearest()
      else if (e.code === 'KeyV') st.cycleView()
      else if (e.code === 'KeyM') st.toggleMute()
      else if (e.code === 'KeyC') P.emote = P.emote === 'sit' ? null : 'sit'
      else if (e.code === 'KeyF') {
        P.emote = 'wave'
        P.emoteUntil = performance.now() + 1600
      }
    }
    const onKeyUp = (e) => {
      keys[e.code] = false
    }

    let dragging = false
    let lx = 0
    let ly = 0
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('.no-look')) return
      dragging = true
      lx = e.clientX
      ly = e.clientY
      // any movement key / drag cancels sitting
      if (P.emote === 'sit') P.emote = null
    }
    const onMove = (e) => {
      if (!dragging) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      look.yaw -= dx * LOOK_SENS
      look.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, look.pitch + dy * LOOK_SENS))
    }
    const onUp = () => {
      dragging = false
    }
    const onWheel = (e) => {
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
