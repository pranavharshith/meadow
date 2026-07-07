// Deterministic value noise + fractal terrain height.
// The SAME terrainHeight() is used to displace the ground mesh and to place
// grass, flowers and trees, so everything sits perfectly on the surface.

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(x, z) {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return h - Math.floor(h)
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

export function valueNoise(x, z) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const v00 = hash(xi, zi)
  const v10 = hash(xi + 1, zi)
  const v01 = hash(xi, zi + 1)
  const v11 = hash(xi + 1, zi + 1)
  const u = smooth(xf)
  const v = smooth(zf)
  return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v)
}

// Gentle rolling hills. Amplitude ~ +/- 7.5 units, large soft features.
export function terrainHeight(x, z) {
  let amp = 1
  let freq = 0.012
  let sum = 0
  let h = 0
  for (let o = 0; o < 4; o++) {
    h += valueNoise(x * freq, z * freq) * amp
    sum += amp
    amp *= 0.5
    freq *= 2
  }
  h /= sum
  return (h - 0.5) * 15
}

// Approximate terrain slope (0 = flat, grows with steepness). Uses finite
// differences of the height field. Handy for shading creases darker.
export function terrainSlope(x, z) {
  const e = 2.0
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  return Math.sqrt(hx * hx + hz * hz) / (2 * e)
}

// Smooth 0..1 density field used to make the meadow non-uniform: some areas
// get taller grass / clusters of flowers, others stay sparse. Deterministic.
export function clusterField(x, z) {
  const n = valueNoise(x * 0.02 + 11.3, z * 0.02 - 7.1)
  return smooth(clamp((n - 0.35) / 0.5, 0, 1))
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v
}
