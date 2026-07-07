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
