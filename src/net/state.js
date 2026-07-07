// Shared mutable networking state, kept OUTSIDE React so high-frequency updates
// (positions ~10Hz) never trigger re-renders. Components read these each frame.

// id -> remote player. Position fields are interpolated toward the t* targets.
//   { id, name, color, x, z, yaw, tx, tz, tyaw, emote, msg, msgUntil }
export const remotePlayers = new Map()

// Lightweight status the HUD can poll.
export const netStatus = {
  online: false,
  ready: false, // signed in + profile loaded
  region: '',
  count: 1, // players in current region incl. you
}
