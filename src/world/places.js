// Memorable, fixed places in the endless meadow. Because terrain is
// deterministic, fixed world coordinates always land on the same spot, so
// "meet me at the Lonely Oak" is a real, shareable location. Players discover
// them by walking near, which reveals the name and grants a one-time bonus.

export const LANDMARKS = [
  // --- Spawn Plaza (world origin — all players start here) ---
  { id: 'spawn-plaza', name: 'The Meadow Gate', kind: 'spawn', x: 0, z: 0, nearRange: 30, discoverRange: 18 },

  // --- Near ring (within ~100 units of origin) ---
  { id: 'lonely-oak', name: 'The Lonely Oak', kind: 'oak', x: 62, z: -48 },
  { id: 'crystal-pond', name: 'Crystal Pond', kind: 'pond', x: -74, z: 40 },
  { id: 'whispering-hill', name: 'Whispering Hill', kind: 'hill', x: 120, z: 96 },
  { id: 'windmill-meadow', name: 'Windmill Meadow', kind: 'windmill', x: -110, z: -92 },
  { id: 'seven-sisters', name: 'Seven Sisters Grove', kind: 'grove', x: 24, z: 150 },
  { id: 'sun-stone', name: 'The Sun Stone', kind: 'stone', x: -150, z: 130 },
  { id: 'mossy-arch', name: 'Mossy Arch', kind: 'ruin', x: 45, z: 80 },
  { id: 'firefly-hollow', name: 'Firefly Hollow', kind: 'hollow', x: -30, z: -60 },

  // --- Mid ring (100–250 units) ---
  { id: 'broken-bridge', name: 'The Broken Bridge', kind: 'bridge', x: 180, z: -140 },
  { id: 'elderwood', name: 'Elderwood', kind: 'grove', x: -200, z: -50 },
  { id: 'flower-terrace', name: 'Flower Terrace', kind: 'flowers', x: 90, z: -220 },
  { id: 'starfall-clearing', name: 'Starfall Clearing', kind: 'clearing', x: -160, z: 210 },
  { id: 'echo-stones', name: 'Echo Stones', kind: 'stone', x: 240, z: 30 },
  { id: 'willow-bend', name: 'Willow Bend', kind: 'willow', x: -60, z: 240 },
  { id: 'amber-ridge', name: 'Amber Ridge', kind: 'hill', x: 200, z: 200 },
  { id: 'foxglove-path', name: 'Foxglove Path', kind: 'flowers', x: -240, z: -180 },

  // --- Far ring (250–400 units) ---
  { id: 'ancient-lighthouse', name: 'Ancient Lighthouse', kind: 'lighthouse', x: 340, z: -100 },
  { id: 'silver-brook', name: 'Silver Brook', kind: 'stream', x: -300, z: 280 },
  { id: 'canyon-edge', name: 'Canyon Edge', kind: 'canyon', x: 280, z: -300 },
  { id: 'twin-peaks', name: 'Twin Peaks', kind: 'hill', x: -350, z: -260 },
  { id: 'forgotten-shrine', name: 'Forgotten Shrine', kind: 'ruin', x: 100, z: -380 },
  { id: 'dawn-meadow', name: 'Dawn Meadow', kind: 'clearing', x: -380, z: 60 },
  { id: 'coral-stones', name: 'Coral Stones', kind: 'stone', x: 360, z: 250 },
  { id: 'cloud-overlook', name: 'Cloud Overlook', kind: 'hill', x: -50, z: -400 },
]

export const DISCOVER_RANGE = 14 // default: how close you must be to "discover" a place
export const NEAR_RANGE = 26 // default: how close before the place name shows in the HUD

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
  return {
    landmark: best,
    dist: bestD,
    nearRange: best ? (best.nearRange ?? NEAR_RANGE) : NEAR_RANGE,
    discoverRange: best ? (best.discoverRange ?? DISCOVER_RANGE) : DISCOVER_RANGE,
  }
}
