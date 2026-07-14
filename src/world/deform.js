// Footstep feedback — C1/C2: no mesh mutation / normal recompute.
// Height field is the sole vertical truth (`terrainHeight`). Soft dust is
// optional via water ripples when walking through water; dry ground stays flat.

import { addRipple } from '../player-state'
import { isOverWater } from './water-path'

let lastDentAt = 0
const DENT_COOLDOWN_MS = 120

/**
 * Lightweight step feedback. Does not alter terrain mesh (avoids height
 * desync with player / grass). On water, adds a ripple only.
 */
export function deformTerrain(x, z) {
  const now = performance.now()
  if (now - lastDentAt < DENT_COOLDOWN_MS) return
  lastDentAt = now
  if (isOverWater(x, z, 0.5)) {
    addRipple(x, z, now * 0.001, 0.55)
  }
}
