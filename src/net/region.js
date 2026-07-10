// The world is divided into square regions. A region is the unit of "nearby":
// you share regional chat with everyone in the same region. Position + presence
// traffic is further split into a small number of shards per region so one
// viral region can't melt a single Realtime channel.
export const REGION = 120
const HYSTERESIS = 20 // must be this far inside new region before switching

// Each region is split into this many parallel presence/pos/tree channels.
// A client picks its shard deterministically from its user id, so all
// clients see a roughly-even slice of remote players (~1/N) while total
// per-channel presence stays under Realtime's comfortable cap (~30-40).
// Chat is broadcast on a separate un-sharded channel so it still reaches
// everyone in the region.
export const SHARDS_PER_REGION = 1

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

// Stable shard index in [0, SHARDS_PER_REGION) for a given user id.
export function shardFor(userId) {
  if (!userId) return 0
  let h = 0
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) | 0
  }
  return Math.abs(h) % SHARDS_PER_REGION
}

// Presence + position + tree-broadcast channel (sharded).
export function regionChannel(rx, rz, shard = 0) {
  return `region:${rx}:${rz}:s${shard}`
}

// Region-wide chat + presence-count channel (NOT sharded). Every client in
// the region joins this so chat reaches everyone and the head count is
// authoritative even when position traffic is spread across shards.
export function regionChatChannel(rx, rz) {
  return `region-chat:${rx}:${rz}`
}

export const CHUNK_SIZE = 30

export function chunkOf(x, z) {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) }
}

export function chunkKey(cx, cz) {
  return `${cx}:${cz}`
}
