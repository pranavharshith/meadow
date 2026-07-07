// World is divided into square chunks. The player always has a 3x3 window of
// chunks populated around them, so grass / flowers / trees feel endless while
// the active instance count stays bounded.
export const CHUNK = 100

// Deterministic per-chunk seed so a chunk always regenerates identically.
export function seedFor(cx, cz) {
  return ((cx * 73856093) ^ (cz * 19349663)) >>> 0
}
