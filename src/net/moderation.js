// Client-side chat moderation.
//
// This is intentionally lightweight — it stops accidental slurs / spam and
// gives players a mute button, but it's not a substitute for real moderation.
// The server-side RPCs (send_world_chat / check_region_chat) enforce the
// authoritative rate limits, so even a modded client that skips this file
// can't spam a channel.

const MUTE_KEY = 'meadow-mutes-v1'

// A tiny, conservative bad-word list. Matches whole words only, case-insensitive.
// Add to this list as needed; keep it short — long lists cause false positives.
const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy',
  'nigger', 'nigga', 'faggot', 'retard', 'slut', 'whore',
]

const BAD_RE = new RegExp(
  '\\b(' + BAD_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'gi'
)

/** Replace profanity in `text` with asterisks. Preserves length. */
export function maskProfanity(text) {
  if (!text) return text
  return text.replace(BAD_RE, (m) => '*'.repeat(m.length))
}

/** Cheap client-side pre-send rate limit; server has the real one. */
let lastSentAt = 0
export function clientChatCooldown(scope) {
  const now = Date.now()
  const min = scope === 'world' ? 1500 : 800
  if (now - lastSentAt < min) return false
  lastSentAt = now
  return true
}

// --- Mute list ------------------------------------------------------------

function loadMutes() {
  try {
    return new Set(JSON.parse(localStorage.getItem(MUTE_KEY)) || [])
  } catch {
    return new Set()
  }
}

let mutes = loadMutes()

export function isMuted(userId) {
  return userId ? mutes.has(userId) : false
}

export function setMuted(userId, muted) {
  if (!userId) return
  if (muted) mutes.add(userId)
  else mutes.delete(userId)
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify([...mutes]))
  } catch {
    /* ignore quota */
  }
}

export function toggleMute(userId) {
  setMuted(userId, !isMuted(userId))
  return isMuted(userId)
}

export function listMutes() {
  return [...mutes]
}
