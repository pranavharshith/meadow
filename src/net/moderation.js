import { bridge } from './bridge'

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

let mutes = new Set()
// Display names for mute list UI (best-effort from chat / presence)
const muteNames = new Map()
let muteRevision = 0
const muteListeners = new Set()

function loadLocalMutes() {
  try {
    const raw = JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry === 'string') mutes.add(entry)
        else if (entry && entry.id) {
          mutes.add(entry.id)
          if (entry.name) muteNames.set(entry.id, entry.name)
        }
      }
    }
  } catch { /* ignore */ }
}

function persistLocalMutes() {
  try {
    const payload = [...mutes].map((id) => ({ id, name: muteNames.get(id) || 'player' }))
    localStorage.setItem(MUTE_KEY, JSON.stringify(payload))
  } catch { /* ignore */ }
}

function bumpMutes() {
  muteRevision += 1
  for (const fn of muteListeners) {
    try { fn(muteRevision) } catch { /* ignore */ }
  }
}

loadLocalMutes()

export function getMuteRevision() {
  return muteRevision
}

export function subscribeMutes(fn) {
  muteListeners.add(fn)
  return () => muteListeners.delete(fn)
}

export function setMutesFromServer(serverMutes) {
  mutes = new Set(serverMutes || [])
  // Merge with any local-only names we already know
  persistLocalMutes()
  bumpMutes()
}

export function isMuted(userId) {
  return userId ? mutes.has(userId) : false
}

export function setMuted(userId, muted, name) {
  if (!userId) return
  if (muted) {
    mutes.add(userId)
    if (name) muteNames.set(userId, name)
  } else {
    mutes.delete(userId)
    muteNames.delete(userId)
  }
  persistLocalMutes()
  bumpMutes()
}

export function toggleMute(userId, name) {
  const next = !isMuted(userId)
  setMuted(userId, next, name)
  if (bridge.online && bridge.toggleMute) {
    bridge.toggleMute(userId).catch(() => {})
  }
  return next
}

export function listMutes() {
  return [...mutes].map((id) => ({ id, name: muteNames.get(id) || 'player' }))
}

export function rememberMuteName(userId, name) {
  if (!userId || !name) return
  muteNames.set(userId, name)
  if (mutes.has(userId)) persistLocalMutes()
}
