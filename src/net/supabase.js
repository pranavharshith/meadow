import { createClient } from '@supabase/supabase-js'

// The whole online layer is gated on these two env vars. With no keys the app
// runs fully offline (single-player, localStorage save) and never touches the
// network. Set them in a .env file (or Vercel project settings) to go live:
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_ANON_KEY=...
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const ONLINE = Boolean(url && key)

export const supabase = ONLINE
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 12 } },
    })
  : null
