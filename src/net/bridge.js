// Thin indirection between the store (local model) and the network layer.
// Defaults are offline no-ops. <Net/> replaces these with RPC-backed versions
// once a Supabase session is live. All server-authoritative mutations return
// the new gold total so the store can reconcile any optimistic update.

const noopSync = () => false
const noopAsync = async () => ({ ok: false })

export const bridge = {
  online: false,

  // Profile edits (name, color). Gold is server-owned and NOT settable here.
  saveIdentity: async (_name, _color) => null,

  // Server-gated mutations. Each returns { ok, gold?, error?, ...extras }.
  plant:        async (_tree)               => ({ ok: false, error: 'offline' }),
  water:        async (_treeId)             => ({ ok: false, error: 'offline' }),
  cut:          async (_treeId)             => ({ ok: false, error: 'offline' }),
  discover:     async (_landmarkId)         => ({ ok: false, error: 'offline' }),
  claimDaily:   async ()                    => ({ ok: false, error: 'offline' }),

  // Chat: gate + broadcast in one call. Returns { ok, gold?, error? }.
  sendChat:     noopAsync,

  // Local mute list — always available (offline too). Populated by Net.jsx
  // from localStorage so it survives reloads.
  isMuted:      (_userId)                   => false,
  toggleMute:   (_userId, _muted)           => {},
}
