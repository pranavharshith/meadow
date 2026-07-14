// Cloudflare Turnstile helper used to gate anonymous sign-in.
//
// In production builds, VITE_TURNSTILE_SITE_KEY MUST be set. Without it,
// getCaptchaToken() throws so Net will not open an unauthenticated online
// session (bots cannot cycle anonymous identities).
//
// In development (import.meta.env.DEV), missing keys still warn and return
// null so local offline/online testing works without Turnstile.
//
// We render an invisible widget once, cache the promise, and refresh the
// token on demand — Turnstile tokens are single-use and expire after ~5 min.

// Trim — `.env` lines like `KEY = value` leave spaces that break Turnstile.
const SITE_KEY = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const IS_PROD = import.meta.env.PROD

let scriptPromise = null
let widgetId = null
let containerEl = null

function loadScript() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.defer = true
    s.onload = () => resolve(window.turnstile)
    s.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

function ensureContainer() {
  if (containerEl) return containerEl
  containerEl = document.createElement('div')
  // Fully off-screen but still in the layout so Turnstile can render.
  containerEl.style.position = 'fixed'
  containerEl.style.left = '-10000px'
  containerEl.style.top = '0'
  containerEl.style.width = '300px'
  containerEl.style.height = '65px'
  containerEl.setAttribute('aria-hidden', 'true')
  document.body.appendChild(containerEl)
  return containerEl
}

/**
 * Fetch a fresh Turnstile token.
 * Production: throws if site key missing or widget fails (fail closed).
 * Development: returns null if captcha isn't configured.
 */
export async function getCaptchaToken() {
  if (!SITE_KEY) {
    if (IS_PROD) {
      throw new Error('VITE_TURNSTILE_SITE_KEY is required in production')
    }
    console.warn('VITE_TURNSTILE_SITE_KEY is not set. Proceeding without Captcha (dev only).')
    return null
  }
  try {
    const turnstile = await loadScript()
    if (!turnstile) {
      if (IS_PROD) throw new Error('turnstile unavailable')
      return null
    }
    const el = ensureContainer()

    const token = await new Promise((resolve, reject) => {
      const done = (t) => resolve(t || null)
      // Reset any prior render so we always get a fresh token.
      if (widgetId != null) {
        try { turnstile.reset(widgetId) } catch { /* ignore */ }
      }
      // Note: 'size' no longer supports 'invisible' — that's controlled by
      // the widget mode configured in the Cloudflare dashboard (set the
      // widget to "Invisible" or "Managed" there). We just render off-screen
      // and let the widget mode decide whether a challenge UI appears.
      widgetId = turnstile.render(el, {
        sitekey: SITE_KEY,
        callback: done,
        'error-callback': () => {
          if (IS_PROD) reject(new Error('captcha failed'))
          else done(null)
        },
        'timeout-callback': () => {
          if (IS_PROD) reject(new Error('captcha timeout'))
          else done(null)
        },
      })
    })

    if (IS_PROD && !token) {
      throw new Error('captcha token missing')
    }
    return token
  } catch (err) {
    if (IS_PROD) throw err
    return null
  }
}

export const CAPTCHA_ENABLED = Boolean(SITE_KEY)
export const CAPTCHA_REQUIRED = IS_PROD
