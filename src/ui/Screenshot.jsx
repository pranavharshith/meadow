import { useStore } from '../store'
import { place } from '../player-state'

// Captures the Three.js canvas, overlays place name + branding, then triggers
// share (Web Share API) or downloads the image as a fallback.
function captureAndShare() {
  const canvas = document.querySelector('canvas')
  if (!canvas) return

  const name = useStore.getState().name
  const placeName = place.name || 'the meadow'

  // Create a temp canvas to composite the screenshot + text overlay
  const w = canvas.width
  const h = canvas.height
  const tmp = document.createElement('canvas')
  tmp.width = w
  tmp.height = h
  const ctx = tmp.getContext('2d')

  // Draw the 3D scene
  ctx.drawImage(canvas, 0, 0)

  // Semi-transparent gradient bar at the bottom
  const grad = ctx.createLinearGradient(0, h - 80, 0, h)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = grad
  ctx.fillRect(0, h - 80, w, 80)

  // Place name — bottom left
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(w * 0.028)}px system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(placeName, 20, h - 16)

  // Branding — bottom right
  ctx.font = `${Math.round(w * 0.018)}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.textAlign = 'right'
  ctx.fillText(`${name} · a shared garden`, w - 20, h - 16)

  // Convert to blob and share/download
  tmp.toBlob(async (blob) => {
    if (!blob) return

    // Try Web Share API first (mobile + some desktop)
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], 'shared-garden.png', { type: 'image/png' })
      const shareData = { files: [file], title: 'a shared garden', text: `${placeName}` }
      if (navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData)
          return
        } catch {
          // user cancelled or not supported — fall through to download
        }
      }
    }

    // Fallback: download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shared-garden-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }, 'image/png')
}

export default function Screenshot() {
  return (
    <button
      className="screenshot-btn no-look"
      onClick={captureAndShare}
      aria-label="take screenshot"
      title="screenshot"
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="16" height="13" rx="2" />
        <circle cx="10" cy="11" r="3.5" />
        <path d="M7 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
      </svg>
    </button>
  )
}
