// Message shapes between phone (controller) and TV (host).
//
// Controller -> Host, reliable "ctrl" connection (JSON):
//   { t:'hello', clientId, name, color, hat }   first message after connecting
//   { t:'action' }                              tapped the big action button
//   { t:'vip', cmd:'pick', game }               VIP picked a game in the lobby
//   { t:'vip', cmd:'start' }                    VIP pressed start
//   { t:'i', x, y }                             tilt fallback if the fast channel isn't open
//
// Controller -> Host, unreliable "input" channel (raw string):  "x,y"   (-1..1, y+ = away from you)
//
// Host -> Controller (JSON):
//   { t:'welcome', playerId, color }
//   { t:'phase', phase, title, text, action, vip, games, selected }
//   { t:'buzz', ms }                            vibrate (Android only, ignored on iOS)

import { CONFIG } from '../config.js';

export const encodeInput = (x, y) => `${x.toFixed(3)},${y.toFixed(3)}`;

export function decodeInput(str) {
  if (typeof str !== 'string') return null;
  const i = str.indexOf(',');
  if (i < 0) return null;
  const x = +str.slice(0, i), y = +str.slice(i + 1);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
}

// Both peers call this on the same RTCPeerConnection; "negotiated" channels with
// matching ids pair up without extra signaling.
export function makeInputChannel(conn) {
  try {
    const pc = conn.peerConnection;
    if (!pc) return null;
    return pc.createDataChannel('input', {
      negotiated: true,
      id: CONFIG.inputChannelId,
      ordered: false,
      maxRetransmits: 0,
    });
  } catch (e) {
    console.warn('Fast input channel unavailable, using fallback', e);
    return null;
  }
}

export function randomRoomCode() {
  const a = CONFIG.roomAlphabet;
  let s = '';
  for (let i = 0; i < CONFIG.roomCodeLength; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
