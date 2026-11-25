// TV side networking. Opens a PeerJS peer named after the room code and
// accepts phone connections. Knows nothing about games.
//
// Disconnect detection: WebRTC "close" events are unreliable when a phone just
// closes the tab or locks, so we also use a heartbeat. Phones send input 60x/sec;
// if a phone goes quiet for CONFIG.heartbeatTimeoutMs, it counts as gone. If it starts
// talking again, it's revived automatically.
import { CONFIG } from '../config.js';
import { decodeInput, makeInputChannel, randomRoomCode } from './protocol.js';

/* global Peer */

export class HostNet {
  /**
   * handlers: {
   *   onJoin(client, isReconnect, hello), onLeave(client), onBye(client),
   *   onMessage(client, msg), onInput(client, x, y)
   * }
   */
  constructor(handlers) {
    this.h = handlers;
    this.clients = new Map(); // clientId -> client
    this.peer = null;
    this.code = null;
    this.banned = new Set();
    this._heartbeat = setInterval(() => this._beat(), 1000);
  }

  async open(preferredCode) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = attempt === 0 && preferredCode ? preferredCode : randomRoomCode();
      try {
        await this._tryOpen(code);
        this.code = code;
        this._loadBans();
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

    const alive = () => {
      if (!client || client.conn !== conn) return false;
      client.lastSeen = performance.now();
      if (!client.connected && !client.kicked) { client.connected = true; this.h.onJoin?.(client, true, {}); }
      return true;
    };

    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') { client = this._attach(conn, input, msg); return; }
      if (!alive()) return;
      if (msg.t === 'i') this.h.onInput?.(client, +msg.x || 0, +msg.y || 0);
      else if (msg.t === 'bye') { this._drop(client); this.h.onBye?.(client); }
      else if (msg.t !== 'pong') this.h.onMessage?.(client, msg);
    });

    conn.on('open', () => {
      input = makeInputChannel(conn);
      if (!input) return;
      input.onmessage = (ev) => {
        if (!alive()) return;
        const v = decodeInput(ev.data);
        if (v) this.h.onInput?.(client, v.x, v.y);
      };
      if (client) client.input = input;
    });

    const closed = () => {
      if (client && client.conn === conn && client.connected) {
        client.connected = false;
        this.h.onLeave?.(client);
      }
    };
    conn.on('close', closed);
    conn.on('error', (e) => { console.warn('[host] conn error', e); closed(); });
  }

  _attach(conn, input, hello) {
    const id = String(hello.clientId || conn.peer).slice(0, 64);
    if (this.banned.has(id)) {
      try { conn.send({ t: 'kicked', ban: true }); } catch {}
      setTimeout(() => { try { conn.close(); } catch {} }, 400);
      return null;
    }
    let client = this.clients.get(id);
    const isReconnect = !!client;
    if (client) {
      if (client.conn !== conn) try { client.conn.close(); } catch {}
      client.conn = conn;
      client.input = input;
      client.connected = true;
    } else {
      client = {
        id, conn, input, connected: true, kicked: false,
        send(msg) { try { if (this.conn.open) this.conn.send(msg); } catch (e) { /* ignore */ } },
      };
      this.clients.set(id, client);
    }
    client.lastSeen = performance.now();
    this.h.onJoin?.(client, isReconnect, hello);
    return client;
  }

  _beat() {
    const now = performance.now();
    for (const c of this.clients.values()) {
      if (!c.connected) continue;
      c.send({ t: 'ping' });
      if (now - c.lastSeen > CONFIG.heartbeatTimeoutMs) {
        c.connected = false;
        this.h.onLeave?.(c);
      }
    }
  }

  _drop(client) {
    client.connected = false;
    client.kicked = true;
    this.clients.delete(client.id);
    setTimeout(() => { try { client.conn.close(); } catch {} }, 400);
  }

  /** Remove a player from the room. With ban=true they can't rejoin this room. */
  kick(clientId, ban = false) {
    const c = this.clients.get(clientId);
    if (ban) { this.banned.add(clientId); this._saveBans(); }
    if (!c) return;
    c.send({ t: 'kicked', ban });
    this._drop(c);
  }

  forget(clientId) { this.clients.delete(clientId); }

  /** Tell every phone the TV is closing, then drop off the network. */
  shutdown() {
    for (const c of this.clients.values()) c.send({ t: 'hostclosed' });
    try { this.peer?.destroy(); } catch {}
    clearInterval(this._heartbeat);
  }

  _loadBans() {
    try { this.banned = new Set(JSON.parse(sessionStorage.getItem('bb-bans-' + this.code) || '[]')); } catch {}
  }
  _saveBans() {
    try { sessionStorage.setItem('bb-bans-' + this.code, JSON.stringify([...this.banned])); } catch {}
  }
}
