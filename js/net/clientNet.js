// Phone side networking.
import { CONFIG } from '../config.js';
import { encodeInput, makeInputChannel } from './protocol.js';

/* global Peer */

export class ClientNet {
  /** handlers: { onMessage(msg), onClose(reason) } */
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conn = null;
    this.input = null;
    this.gen = 0;        // bumps on every connect/close so stale callbacks are ignored
    this.lastMsg = 0;
    // The TV pings every second. Silence = the TV closed, crashed, or the network dropped.
    setInterval(() => {
      if (this.connected && performance.now() - this.lastMsg > CONFIG.heartbeatTimeoutMs + 1500) {
        this.close();
        this.h.onClose?.('timeout');
      }
    }, 1000);
  }

  connect(code, hello, timeoutMs = 15000) {
    this.close();
    const gen = ++this.gen;
    const mine = () => gen === this.gen;
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; reject(err); if (mine()) this.close(); } };
      const timer = setTimeout(() => fail(new Error('Timed out connecting. Is the TV page open?')), timeoutMs);

      const peer = new Peer(CONFIG.peerOptions);
      this.peer = peer;
      peer.on('error', (e) => {
        if (!mine()) return;
        if (e.type === 'peer-unavailable') fail(new Error(`Room ${code} not found. Check the code on the TV.`));
        else if (!settled) fail(new Error('Connection problem: ' + (e.type || e.message)));
        else console.warn('[client] peer error', e);
      });
      peer.on('open', () => {
        if (!mine()) return;
        const conn = peer.connect(CONFIG.peerPrefix + code, { reliable: true, serialization: 'json' });
        this.conn = conn;
        conn.on('open', () => {
          if (!mine()) return;
          this.input = makeInputChannel(conn);
          this.lastMsg = performance.now();
          conn.send(hello);
          clearTimeout(timer);
          settled = true;
          resolve();
        });
        conn.on('data', (msg) => {
          if (!mine()) return;
          this.lastMsg = performance.now();
          if (msg && msg.t === 'ping') return;
          this.h.onMessage?.(msg);
        });
        conn.on('close', () => { if (settled && mine()) { this.close(); this.h.onClose?.('closed'); } });
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

  /** Leave on purpose: tell the TV so it removes us right away. */
  leave() {
    this.send({ t: 'bye' });
    const conn = this.conn, peer = this.peer;
    this.gen++;
    this.peer = this.conn = this.input = null;
    setTimeout(() => { try { conn?.close(); } catch {} try { peer?.destroy(); } catch {} }, 150);
  }

  close() {
    this.gen++;
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = this.conn = this.input = null;
  }
}
