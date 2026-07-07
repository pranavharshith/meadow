// Memorable, fixed places in the endless meadow. Because terrain is
// deterministic, fixed world coordinates always land on the same spot, so
// "meet me at the Lonely Oak" is a real, shareable location. Players discover
// them by walking near, which reveals the name and grants a one-time bonus.
export const LANDMARKS = [
  { id: 'lonely-oak', name: 'The Lonely Oak', kind: 'oak', x: 62, z: -48 },
  { id: 'crystal-pond', name: 'Crystal Pond', kind: 'pond', x: -74, z: 40 },
  { id: 'whispering-hill', name: 'Whispering Hill', kind: 'hill', x: 120, z: 96 },
  { id: 'windmill-meadow', name: 'Windmill Meadow', kind: 'windmill', x: -110, z: -92 },
  { id: 'seven-sisters', name: 'Seven Sisters Grove', kind: 'grove', x: 24, z: 150 },
  { id: 'sun-stone', name: 'The Sun Stone', kind: 'stone', x: -150, z: 130 },
]

export const DISCOVER_RANGE = 14 // how close you must be to "discover" a place
export const NEAR_RANGE = 26 // how close before the place name shows in the HUD

export function nearestLandmark(x, z) {
  let best = null
  let bestD = Infinity
  for (const l of LANDMARKS) {
    const d = Math.hypot(l.x - x, l.z - z)
    if (d < bestD) {
      bestD = d
      best = l
    }
  }
  return { landmark: best, dist: bestD }
}
