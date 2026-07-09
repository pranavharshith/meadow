import * as THREE from 'three'

// Shared mutable singletons updated every frame. Kept OUTSIDE React state so
// high-frequency movement/look updates don't trigger re-renders.

// ── Spawn: random position within the Spawn Plaza (radius 4–10 units) ──────
// or at the player's custom spawn point if one was saved.
let spawnX = 0, spawnZ = 0, spawnYaw = 0, lookYaw = 0
try {
  const saved = JSON.parse(localStorage.getItem('meadow-save-v1'))
  if (saved && saved.customSpawn) {
    spawnX = saved.customSpawn.x
    spawnZ = saved.customSpawn.z
    spawnYaw = Math.atan2(-spawnX, -spawnZ) // face toward origin
  }
} catch {}
if (!spawnX && !spawnZ) {
  const spawnAngle = Math.random() * Math.PI * 2
  const spawnR = 4 + Math.random() * 6
  spawnX = Math.cos(spawnAngle) * spawnR
  spawnZ = Math.sin(spawnAngle) * spawnR
  spawnYaw = spawnAngle + Math.PI
}
lookYaw = spawnYaw
export const P = {
  pos: new THREE.Vector3(spawnX, 0, spawnZ),
  avatarYaw: spawnYaw, // face toward the center on spawn
  moving: false,
  // social state: 'sit' | 'wave' | null
  emote: null,
  emoteUntil: 0, // timestamp when a one-shot emote (wave) ends
}

// Camera state (mutated by Controls, read by CameraRig and Player)
export const look = {
  yaw: Math.PI + 0.1, // looking slightly off-center
  pitch: 0.35,        // looking slightly down
  zoom: 1.0,
  lastLookTime: 0,
}

// Raw keyboard state keyed by e.code.
export const keys = {}

// Positions of trees near the player, used by minimap + collision + wildlife.
// Each entry: { x, z, r, mature }
export const treeRegistry = []

// Positions of rocks near the player, used for collision.
// Each entry: { x, z, r }
export const rockRegistry = []

// Name of the place the player is currently standing in (landmark) or ''.
export const place = { name: '' }

// Placement preview state. Written every frame by <PlacementPreview/>, read
// by the store's confirmPlacement() action. Kept out of React state so the
// ghost can move at 60 Hz without triggering re-renders.
//   x, z    — world-space target position
//   yaw     — rotation to apply to the placed object
//   valid   — true if the current spot passes all rules
//   reason  — human-readable reason when !valid (shown in the HUD)
export const placement = {
  x: 0,
  z: 0,
  yaw: 0,
  valid: false,
  reason: '',
}
