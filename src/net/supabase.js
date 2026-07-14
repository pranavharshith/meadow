import { createClient } from '@supabase/supabase-js'

// The whole online layer is gated on these two env vars. With no keys the app
// runs fully offline (single-player, localStorage save) and never touches the
// network. Set them in a .env file (or Vercel project settings) to go live:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
//
// Trim values — a leading space after `=` in .env is a common footgun and
// produces invalid URLs / JWT keys with no obvious console explosion.
const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const ONLINE = Boolean(url && key)

// One-time diagnostics (dev only) so "stuck offline" is not silent
if (import.meta.env.DEV) {
  if (!ONLINE) {
    console.info(
      '[meadow] Offline mode: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart `npm run dev`.',
    )
  } else {
    console.info('[meadow] Supabase env loaded:', url.replace(/^(https:\/\/[^/]+).*/, '$1/…'))
  }
}

export const supabase = ONLINE
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 12 } },
    })
  : null
