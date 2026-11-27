// "Ball cam": every phone gets a live close-up video of its own ball, rendered by the TV.
//
// How: each frame the TV renders a few small extra views (one per phone, taking turns) into a
// corner of its own canvas, copies that into a little 2D canvas per player, and streams that
// canvas to the phone as a WebRTC video call over the same PeerJS connection.
// The work is budgeted so the TV stays smooth: about 2 extra small renders per frame in total.
import * as THREE from 'three';

const W = 360, H = 270;          // video size (4:3)
const PER_FRAME = 2;             // extra renders per TV frame (shared by all phones)
const _v = new THREE.Vector3(), _l = new THREE.Vector3();

export class PhoneCams {
  constructor(engine, getPeer) {
    this.engine = engine;
    this.getPeer = getPeer;
    this.cams = new Map(); // player -> cam
    this.enabled = false;  // only while a round is on screen
    this.rr = 0;
    this.slowFrames = 0;
    this.budget = PER_FRAME;
  }

  /** Start streaming to this player's phone (call again after a reconnect). */
  attach(p) {
    this.detach(p);
    const peer = this.getPeer();
    const remote = p.client?.conn?.peer;
    if (!peer || !remote || !p.client.conn.open) return;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#1b1446'; g.fillRect(0, 0, W, H);
    let stream;
    try { stream = canvas.captureStream(0); } catch { return; }
    const track = stream.getVideoTracks()[0];
    let call;
    try { call = peer.call(remote, stream, { metadata: { kind: 'ballcam' } }); } catch (e) { console.warn('[ballcam]', e); return; }
    if (!call) return;
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
    const cam = { p, canvas, g, stream, track, call, camera, pos: null, look: new THREE.Vector3(), on: true };
    call.on('close', () => { if (this.cams.get(p) === cam) this.cams.delete(p); });
    call.on('error', () => {});
    this.cams.set(p, cam);
  }

  detach(p) {
    const c = this.cams.get(p);
    if (!c) return;
    this.cams.delete(p);
    try { c.call.close(); } catch {}
    c.stream.getTracks().forEach((t) => t.stop());
  }

  /** Phone toggled its ball cam on/off. */
  setWanted(p, on) { const c = this.cams.get(p); if (c) c.on = on; }

  /** Called by the engine right before the main render, every frame. */
  render(realDt, opts = {}) {
    if (!this.enabled || !this.cams.size) return;
    // If the TV is struggling, do fewer extra renders.
    if (realDt > 1 / 40) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
    this.budget = this.slowFrames > 30 ? 1 : PER_FRAME;

    const list = [...this.cams.values()].filter((c) => c.on);
    if (!list.length) return;
    const R = this.engine.renderer, glc = R.domElement, pr = R.getPixelRatio();
    const vw = W / pr, vh = H / pr;
    if (glc.width < W || glc.height < H) return;
    const n = Math.min(this.budget, list.length);
    R.setScissorTest(true);
    for (let k = 0; k < n; k++) {
      const c = list[this.rr++ % list.length];
      this._aim(c, realDt * list.length / n, opts);
      R.setViewport(0, 0, vw, vh);
      R.setScissor(0, 0, vw, vh);
      R.render(this.engine.scene, c.camera);
      c.g.drawImage(glc, 0, glc.height - H, W, H, 0, 0, W, H);
      c.track.requestFrame?.();
    }
    R.setScissorTest(false);
    const size = R.getSize(_v);
    R.setViewport(0, 0, size.x, size.y);
  }

  _aim(c, dt, { up = 7.5, back = 7 } = {}) {
    const b = c.p.ball, cam = c.camera, main = this.engine.camera;
    if (!b.active) {
      // Out of the round: watch what the TV is showing.
      cam.position.copy(main.position); cam.quaternion.copy(main.quaternion);
      c.pos = null;
      return;
    }
    const target = this.engine.lerpPos(b.body, _l);
    _v.set(target.x, target.y + up, target.z + back);
    if (!c.pos) { c.pos = _v.clone(); c.look.copy(target); }
    const k = 1 - Math.exp(-dt * 6);
    c.pos.lerp(_v, k);
    c.look.lerp(_l.set(target.x, target.y, target.z - 1.5), Math.min(1, k * 1.5));
    cam.position.copy(c.pos);
    cam.lookAt(c.look);
  }
}
