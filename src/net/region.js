// The world is divided into square regions. A region is the unit of "nearby":
// you share presence, position updates and regional chat with everyone in the
// same region. Regions are large enough that border crossings are infrequent,
// so we only need to subscribe to one region channel at a time.
export const REGION = 120
const HYSTERESIS = 20 // must be this far inside new region before switching

export function regionOf(x, z) {
  return { rx: Math.floor(x / REGION), rz: Math.floor(z / REGION) }
}

// Returns true only if the position is at least HYSTERESIS units inside the
// given region (not near the border). Used to prevent rapid switching.
export function isDeepInRegion(x, z, rx, rz) {
  const localX = x - rx * REGION
  const localZ = z - rz * REGION
  return localX >= HYSTERESIS && localX <= REGION - HYSTERESIS &&
         localZ >= HYSTERESIS && localZ <= REGION - HYSTERESIS
}

export function regionKey(rx, rz) {
  return `${rx}:${rz}`
}

export function regionChannel(rx, rz) {
  return `region:${rx}:${rz}`
}
