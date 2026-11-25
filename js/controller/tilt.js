// Turns phone orientation into a 2D stick (-1..1).
//
// We use DeviceOrientation (alpha/beta/gamma), which behaves the same on iOS and
// Android, and convert it to the "up" vector in the phone's own frame. Calibration
// stores whatever pose the player likes as neutral; tilt is measured relative to
// that, so flat-on-table, angled-in-hand or upright all work.

const DEG = Math.PI / 180;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class Tilt {
  constructor() {
    this.up = null;        // current world-up in device coords
    this.neutral = null;
    this.right = null;
    this.fwd = null;
    this.hasSensor = false;
    this.maxAngle = 24 * DEG; // tilt this far = full speed
    this.deadzone = 0.07;
    this.smoothing = 0.45;    // 0 = raw, closer to 1 = smoother/laggier
    this.x = 0; this.y = 0;
    this._onOri = this._onOri.bind(this);
  }

  /** MUST be called directly inside a tap handler (iOS rule). */
  static requestPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      return DOE.requestPermission().then((r) => r === 'granted').catch(() => false);
    }
    return Promise.resolve(!!DOE);
  }

  start() { window.addEventListener('deviceorientation', this._onOri); }
  stop() { window.removeEventListener('deviceorientation', this._onOri); }

  _onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    const b = e.beta * DEG, g = e.gamma * DEG;
    // Up vector in device frame for W3C Z-X'-Y'' Euler angles (alpha doesn't matter).
    this.up = [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)];
    this.hasSensor = true;
    if (!this.neutral) this.calibrate();
  }

  _screenAngle() {
    const a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
    return (+a || 0) * DEG;
  }

  calibrate() {
    if (!this.up) return false;
    const n = this.up.slice();
    const a = this._screenAngle();
    // Screen's "right" direction expressed in device axes (handles landscape).
    const screenRight = [Math.cos(a), -Math.sin(a), 0];
    let r = screenRight.map((v, i) => v - dot(screenRight, n) * n[i]);
    if (Math.hypot(...r) < 0.2) return false; // held edge-on, weird pose
    r = norm(r);
    this.neutral = n;
    this.right = r;
    this.fwd = cross(n, r);
    this.x = this.y = 0;
    return true;
  }

  /** Returns smoothed {x, y}; y+ means "tilt away from you" (roll forward). */
  read() {
    if (!this.up || !this.neutral) return { x: 0, y: 0 };
    const u = this.up;
    const clampS = (v) => Math.max(-1, Math.min(1, v));
    let x = Math.asin(clampS(-dot(u, this.right))) / this.maxAngle;
    let y = Math.asin(clampS(-dot(u, this.fwd))) / this.maxAngle;
    // If the player flips past ~90°, the neutral half-space test keeps it sane.
    if (dot(u, this.neutral) < 0) { const l = Math.hypot(x, y) || 1; x /= l; y /= l; }
    // Radial deadzone + clamp to unit circle.
    let m = Math.hypot(x, y);
    if (m < this.deadzone) { x = 0; y = 0; }
    else {
      const k = Math.min(1, (m - this.deadzone) / (1 - this.deadzone)) / m;
      x *= k; y *= k;
    }
    const s = this.smoothing;
    this.x = this.x * s + x * (1 - s);
    this.y = this.y * s + y * (1 - s);
    return { x: this.x, y: this.y };
  }
}

/** On-screen joystick fallback (no sensor, desktop browser, or player preference). */
export class TouchStick {
  constructor(el, knob) {
    this.el = el; this.knob = knob;
    this.x = 0; this.y = 0; this.id = null;
    const radius = () => el.clientWidth / 2;
    const move = (t) => {
      const r = el.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / radius();
      let dy = (t.clientY - (r.top + r.height / 2)) / radius();
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.x = dx; this.y = -dy;
      knob.style.transform = `translate(${dx * 70}%, ${dy * 70}%)`;
    };
    el.addEventListener('pointerdown', (e) => { this.id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) move(e); });
    const end = (e) => {
      if (e.pointerId !== this.id) return;
      this.id = null; this.x = this.y = 0; knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  read() { return { x: this.x, y: this.y }; }
}
