// Synthesized sound effects (no audio files needed). Swap in samples later if you like:
// every effect is just a method, so callers don't care how it's made.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._lastBonk = 0;
  }

  /** Browsers require a click/keypress before audio can start. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this._noise = this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  get ready() { return !!this.ctx && this.ctx.state === 'running' && !this.muted; }

  _makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.2, vol = 0.4, delay = 0, attack = 0.005 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noiseHit({ dur = 0.2, vol = 0.3, freq = 1200, q = 1, type = 'bandpass', delay = 0, sweepTo }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  /** Rubbery bonk; intensity ~0..1 */
  bonk(intensity = 0.5) {
    const now = performance.now();
    if (now - this._lastBonk < 40) return; // avoid machine-gun stacking
    this._lastBonk = now;
    const i = Math.max(0.15, Math.min(1, intensity));
    const base = 180 + Math.random() * 120;
    this._tone({ type: 'sine', f0: base * 2.2, f1: base * 0.7, dur: 0.18 + i * 0.1, vol: 0.25 + i * 0.4 });
    this._tone({ type: 'triangle', f0: base * 4, f1: base * 1.5, dur: 0.06, vol: 0.12 * i });
    this._noiseHit({ dur: 0.05, vol: 0.15 * i, freq: 2500, q: 0.8 });
  }
  thud(intensity = 0.3) { this._tone({ type: 'sine', f0: 120, f1: 50, dur: 0.15, vol: 0.2 + intensity * 0.3 }); }
  splash() {
    this._noiseHit({ dur: 0.7, vol: 0.45, freq: 900, q: 0.7, type: 'lowpass', sweepTo: 200 });
    this._tone({ type: 'sine', f0: 600, f1: 90, dur: 0.45, vol: 0.25 });
    for (let k = 0; k < 4; k++) this._tone({ type: 'sine', f0: 500 + Math.random() * 700, f1: 900 + Math.random() * 600, dur: 0.06, vol: 0.1, delay: 0.15 + k * 0.07 });
  }
  whoosh() { this._noiseHit({ dur: 0.25, vol: 0.3, freq: 400, q: 2, sweepTo: 2500 }); }
  pop() { this._tone({ type: 'sine', f0: 400, f1: 1200, dur: 0.12, vol: 0.35 }); }
  pickup() {
    this._tone({ type: 'triangle', f0: 880, dur: 0.1, vol: 0.25 });
    this._tone({ type: 'triangle', f0: 1320, dur: 0.15, vol: 0.25, delay: 0.07 });
  }
  beep(high = false) { this._tone({ type: 'square', f0: high ? 880 : 440, dur: high ? 0.4 : 0.15, vol: 0.18 }); }
  crumble() { this._noiseHit({ dur: 0.35, vol: 0.25, freq: 300, q: 0.5, type: 'lowpass' }); }
  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, k) => this._tone({ type: 'square', f0: f, dur: k === notes.length - 1 ? 0.6 : 0.16, vol: 0.15, delay: k * 0.13 }));
    notes.forEach((f, k) => this._tone({ type: 'triangle', f0: f / 2, dur: 0.2, vol: 0.15, delay: k * 0.13 }));
  }
  join() { this._tone({ type: 'sine', f0: 300, f1: 900, dur: 0.15, vol: 0.3 }); this._tone({ type: 'sine', f0: 900, f1: 1400, dur: 0.12, vol: 0.2, delay: 0.1 }); }
}
