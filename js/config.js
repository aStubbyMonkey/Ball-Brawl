// Global tunables. Tweak freely — nothing else should hard-code these.
export const CONFIG = {
  // PeerJS ids are global on the public PeerJS server, so prefix them to avoid collisions.
  peerPrefix: 'ballbrawl-v1-',
  roomCodeLength: 4,
  roomAlphabet: 'BCDFGHJKLMNPQRSTVWXZ', // no vowels = no accidental words

  // Passed straight to `new Peer(id, options)`. Add your own TURN servers here
  // if players on strict networks (some school/corporate Wi-Fi) can't connect.
  peerOptions: {
    debug: 1,
    // config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
  },

  // Tilt input goes over an extra *unreliable, unordered* WebRTC data channel
  // (no retransmits = no lag spikes). Both sides create it with this id.
  inputChannelId: 42,
  inputSendHz: 60,

  maxPlayers: 12,
  roundsPerMatch: 5,
  placementPoints: [3, 2, 1], // points for 1st, 2nd, 3rd... in each round
  lobbyDisconnectGraceMs: 10000, // a disconnected player's spot is kept this long in the lobby
  heartbeatTimeoutMs: 4000,      // no messages for this long = player is gone

  // Default ball feel. Games can override per ball via ball.tuning.
  // Movement is "velocity seeking": tilt sets a target speed and the ball accelerates
  // toward it, so letting go of the tilt brakes you to a stop.
  ball: {
    radius: 0.5,
    mass: 1,
    maxSpeed: 7,      // full tilt = this speed (units/sec)
    accel: 8,         // how eagerly it chases the target speed (higher = snappier)
    maxAccel: 22,     // cap on that acceleration
    airControl: 0.3,  // fraction of control while airborne
    bonkBoost: 0.85,  // extra knockback per unit of the hitter's speed: the faster ball wins the bonk
    hitStun: 0.45,    // seconds of reduced control after a big hit, so knockback actually carries
  },
};
