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
  lobbyDisconnectGraceMs: 20000,

  // Default ball feel. Games can override per ball via ball.tuning.
  ball: {
    radius: 0.5,
    mass: 1,
    force: 26,        // how hard tilt pushes
    airControl: 0.35, // fraction of force while airborne
    maxSpeed: 11,     // tilt stops adding speed past this
    dashImpulse: 8,
    dashCooldown: 1.2,
    bonkBoost: 0.45,  // extra knockback on ball-vs-ball hits (silly physics!)
  },
};
