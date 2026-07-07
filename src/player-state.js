import * as THREE from 'three'

// Shared mutable singletons updated every frame. Kept OUTSIDE React state so
// high-frequency movement/look updates don't trigger re-renders.
export const P = {
  pos: new THREE.Vector3(0, 0, 0),
  avatarYaw: 0,
  moving: false,
  // social state: 'sit' | 'wave' | null
  emote: null,
  emoteUntil: 0, // timestamp when a one-shot emote (wave) ends
}

// Camera look direction (radians) + zoom multiplier (mouse wheel).
export const look = { yaw: 0, pitch: 0.55, zoom: 1 }

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
