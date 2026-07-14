// Thin indirection between the store (local model) and the network layer.
// Defaults are offline no-ops. <Net/> replaces these with RPC-backed versions
// once a Supabase session is live. All server-authoritative mutations return
// the new gold total so the store can reconcile any optimistic update.

const noopSync = () => false
const noopAsync = async () => ({ ok: false })

export const bridge = {
  online: false,

  // Profile edits (name, color, hats). Gold is server-owned and NOT settable here.
  saveIdentity: async (_name, _color, _headColor, _bodyColor, _legColor, _hatId) => {},

  // Cosmetic purchase
  buyCosmetic: async (_type, _id, _colorVal) => ({ ok: false, error: 'offline' }),

  // Server-gated mutations. Each returns { ok, gold?, error?, ...extras }.
  plant:       async (_tree)               => ({ ok: false, error: 'offline' }),
  water:       async (_treeId)             => ({ ok: false, error: 'offline' }),
  cut:         async (_treeId)             => ({ ok: false, error: 'offline' }),
  discover:    async (_landmarkId)         => ({ ok: false, error: 'offline' }),
  claimDaily:  async ()                    => ({ ok: false, error: 'offline' }),
  releaseItem: async (_id, _type)          => ({ ok: false, error: 'offline' }),
  claimOfflineGold: async ()               => ({ ok: false, error: 'offline' }),
  cutProceduralResource: async (_id, _type, _chunkKey) => ({ ok: false, error: 'offline' }),
  // Rock mutations (server-persisted, visible to all players in region)
  placeRock:   async (_rock)               => ({ ok: false, error: 'offline' }),
  removeRock:  async (_rockId)             => ({ ok: false, error: 'offline' }),
  
  // Crafted Item mutations
  placeCraftedItem: async (_item, _costWood, _costStone) => ({ ok: false, error: 'offline' }),
  removeCraftedItem: async (_itemId)       => ({ ok: false, error: 'offline' }),

  // Gold-sink gated mutations. Each returns { ok, gold?, error? }.
  teleport:    async (_landmarkId)         => ({ ok: false, error: 'offline' }),
  setSpawn:    async (_x, _z)             => ({ ok: false, error: 'offline' }),

  // Tree dye (gold sink, colours your tree's leaves permanently)
  dye:         async (_treeId, _color, _cost) => ({ ok: false, error: 'offline' }),

  // Plot mutation (server-persisted, one per player, permanent)
  buyCustomPlot: async (_plot)              => ({ ok: false, error: 'offline' }),

  // Chat: gate + broadcast in one call. Returns { ok, gold?, error?, text? }.
  sendChat:    noopAsync,

  // World Tree collaborative goal
  donateToWorldTree: async (_amount)      => ({ ok: false, error: 'offline' }),

  // Local mute list — always available (offline too). Populated by Net.jsx
  // from localStorage so it survives reloads.
  isMuted:     (_userId)                   => false,
  toggleMute:  (_userId, _muted)           => {},
}
