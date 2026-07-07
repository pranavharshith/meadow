// The world is divided into square regions. A region is the unit of "nearby":
// you share presence, position updates and regional chat with everyone in the
// same region. Regions are large enough that border crossings are infrequent,
// so we only need to subscribe to one region channel at a time.
export const REGION = 120

export function regionOf(x, z) {
  return { rx: Math.floor(x / REGION), rz: Math.floor(z / REGION) }
}

export function regionKey(rx, rz) {
  return `${rx}:${rz}`
}

export function regionChannel(rx, rz) {
  return `region:${rx}:${rz}`
}
