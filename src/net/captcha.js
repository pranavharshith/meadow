// Cloudflare Turnstile helper used to gate anonymous sign-in.
//
// When VITE_TURNSTILE_SITE_KEY is unset (default), getCaptchaToken() returns
// null and sign-in proceeds without a token. Enabling captcha requires BOTH:
//   1. Set VITE_TURNSTILE_SITE_KEY here (the frontend site key), and
//   2. Enable the CAPTCHA integration in the Supabase Auth dashboard with the
//      matching secret key. Supabase will then require a token for
//      signInAnonymously() and reject sign-ins that lack one.
//
// We render an invisible widget once, cache the promise, and refresh the
// token on demand — Turnstile tokens are single-use and expire after ~5 min.

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

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
 * Fetch a fresh Turnstile token, or null if captcha isn't configured.
 * Never throws — failure to load the widget just resolves to null so the
 * game keeps working in dev without a captcha configured.
 */
export async function getCaptchaToken() {
  if (!SITE_KEY) return null
  try {
    const turnstile = await loadScript()
    if (!turnstile) return null
    const el = ensureContainer()

    return await new Promise((resolve) => {
      const done = (token) => resolve(token || null)
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
        'error-callback': () => done(null),
        'timeout-callback': () => done(null),
      })
    })
  } catch {
    return null
  }
}

export const CAPTCHA_ENABLED = Boolean(SITE_KEY)
