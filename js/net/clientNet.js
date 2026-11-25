// Phone side networking.
import { CONFIG } from '../config.js';
import { encodeInput, makeInputChannel } from './protocol.js';

/* global Peer */

export class ClientNet {
  /** handlers: { onMessage(msg), onClose() } */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.input = null;
  }

  connect(code, hello, timeoutMs = 15000) {
    this.close();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; reject(err); this.close(); } };
      const timer = setTimeout(() => fail(new Error('Timed out connecting. Is the TV page open?')), timeoutMs);

      const peer = new Peer(CONFIG.peerOptions);
      this.peer = peer;
      peer.on('error', (e) => {
        if (e.type === 'peer-unavailable') fail(new Error(`Room ${code} not found. Check the code on the TV.`));
        else if (!settled) fail(new Error('Connection problem: ' + (e.type || e.message)));
        else console.warn('[client] peer error', e);
      });
      peer.on('open', () => {
        const conn = peer.connect(CONFIG.peerPrefix + code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => {
          this.input = makeInputChannel(conn);
          conn.send(hello);
          clearTimeout(timer);
          settled = true;
          resolve();
        });
        conn.on('data', (msg) => this.h.onMessage?.(msg));
        conn.on('close', () => { if (settled) this.h.onClose?.(); });
        conn.on('error', (e) => console.warn('[client] conn error', e));
      });
    });
  }

  get connected() { return !!(this.conn && this.conn.open); }
  get fastInput() { return !!(this.input && this.input.readyState === 'open'); }

  send(msg) { try { if (this.connected) this.conn.send(msg); } catch {} }

  sendInput(x, y) {
    if (this.fastInput) {
      try { this.input.send(encodeInput(x, y)); return; } catch {}
    }
    this.send({ t: 'i', x: +x.toFixed(3), y: +y.toFixed(3) });
  }

  close() {
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = this.conn = this.input = null;
  }
}
