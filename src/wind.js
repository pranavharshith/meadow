// Shared wind state used by grass + tree-leaf shaders so everything sways in
// sync. `time` advances every frame; `strength` slowly breathes between calm
// and breezy (driven by <WindClock/>), which the weather system nudges too.
export const windTime = { value: 0 }
export const windStrength = { value: 1 }

// 0..1 how wet the world is right now (rain). Drives puddle sheen / fog tint.
export const wetness = { value: 0 }
