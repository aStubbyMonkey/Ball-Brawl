// TV side networking. Opens a PeerJS peer named after the room code and
// accepts phone connections. Knows nothing about games.
import { CONFIG } from '../config.js';
import { decodeInput, makeInputChannel, randomRoomCode } from './protocol.js';

/* global Peer */

export class HostNet {
  /**
   * handlers: {
   *   onJoin(client, isReconnect, hello), onLeave(client),
   *   onMessage(client, msg), onInput(client, x, y)
   * }
   */
  constructor(handlers) {
    this.h = handlers;
    this.clients = new Map(); // clientId -> client
    this.peer = null;
    this.code = null;
  }

  async open(preferredCode) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = attempt === 0 && preferredCode ? preferredCode : randomRoomCode();
      try {
        await this._tryOpen(code);
        this.code = code;
        return code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue; // code taken, pick another
        throw e;
      }
    }
    throw new Error('Could not reserve a room code');
  }

  _tryOpen(code) {
    return new Promise((resolve, reject) => {
      const peer = new Peer(CONFIG.peerPrefix + code, CONFIG.peerOptions);
      const onErr = (e) => { peer.destroy(); reject(e); };
      peer.once('error', onErr);
      peer.once('open', () => {
        peer.off('error', onErr);
        this.peer = peer;
        peer.on('connection', (conn) => this._onConnection(conn));
        peer.on('disconnected', () => {
          // Lost the signaling server (not the players). Reconnect so new phones can still join.
          if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000);
        });
        peer.on('error', (e) => console.warn('[host] peer error', e.type, e));
        resolve();
      });
    });
  }

  _onConnection(conn) {
    let client = null;
    let input = null;

    const handleInput = (x, y) => { if (client && client.conn === conn) this.h.onInput?.(client, x, y); };

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        client = this._attach(conn, input, msg);
        return;
      }
      if (!client) return;
      if (msg.t === 'i') handleInput(+msg.x || 0, +msg.y || 0);
      else this.h.onMessage?.(client, msg);
    });

    conn.on('open', () => {
      input = makeInputChannel(conn);
      if (input) {
        input.onmessage = (ev) => {
          const v = decodeInput(ev.data);
          if (v) handleInput(v.x, v.y);
        };
        if (client) client.input = input;
      }
    });

    const closed = () => {
      if (client && client.conn === conn && client.connected) {
        client.connected = false;
        this.h.onLeave?.(client);
      }
    };
    conn.on('close', closed);
    conn.on('error', (e) => { console.warn('[host] conn error', e); closed(); });
    // ICE failures don't always fire 'close'; watch the underlying connection too.
    const watch = setInterval(() => {
      const pc = conn.peerConnection;
      if (!pc) return;
      if (['failed', 'closed', 'disconnected'].includes(pc.iceConnectionState)) {
        if (pc.iceConnectionState !== 'disconnected' || !conn.open) { clearInterval(watch); closed(); }
      }
    }, 2000);
    conn.on('close', () => clearInterval(watch));
  }

  _attach(conn, input, hello) {
    const id = String(hello.clientId || conn.peer).slice(0, 64);
    let client = this.clients.get(id);
    const isReconnect = !!client;
    if (client) {
      if (client.conn !== conn) try { client.conn.close(); } catch {}
      client.conn = conn;
      client.input = input;
      client.connected = true;
    } else {
      client = {
        id,
        conn,
        input,
        connected: true,
        send(msg) { try { if (this.conn.open) this.conn.send(msg); } catch (e) { /* ignore */ } },
      };
      this.clients.set(id, client);
    }
    this.h.onJoin?.(client, isReconnect, hello);
    return client;
  }

  forget(clientId) { this.clients.delete(clientId); }
}
