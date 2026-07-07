// Thin indirection between the store (pure local model) and the network layer.
// Defaults are no-ops so the store works fully offline. <Net/> overrides these
// when a Supabase connection is live. This avoids a store <-> net import cycle.
export const bridge = {
  online: false,
  // persist the player's profile (gold/name/color) to the DB
  saveProfile: () => {},
  // mirror a newly planted tree to the DB + broadcast it to the region
  plant: (_tree) => {},
  // send a chat message: scope is 'region' | 'world'. Returns true if accepted.
  sendChat: (_scope, _text) => false,
}
