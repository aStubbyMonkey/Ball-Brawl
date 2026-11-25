// A player's ball: physics body + rolling mesh + googly-eyed face + hat + name + trail.
// Balls persist across games; games just spawn() / deactivate() them.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { Avatar } from '../cosmetics/avatar.js';

const TRAIL_GEO = new THREE.SphereGeometry(1, 12, 8);
const TRAIL_N = 16;
const _p = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();

export class Ball {
  /**
   * @param engine Engine
   * @param player { id, name, color, skin, hat, eyes, outfit }
   * @param onHit (ball, otherBody, impact, normal) => void   normal points from this ball to the other
   */
  constructor(engine, player, onHit) {
    this.engine = engine;
    this.player = player;
    this.tuning = { ...CONFIG.ball };
    const R = this.tuning.radius;
    this.radius = R;
    this.active = false;
    this.dashTimer = 0;
    this.dashGrace = 0; // brief window after a dash where we don't brake the burst away
    this.stun = 0;      // brief window after a hit with reduced control
    this.rollQ = new THREE.Quaternion();
    this.squash = 0; this.squashVel = 0;
    this.yaw = 0;
    this.blink = 2 + Math.random() * 3;
    this.data = {}; // scratch space for games (lives, score, lastHitBy...)

    const body = new CANNON.Body({
      mass: this.tuning.mass,
      shape: new CANNON.Sphere(R),
      material: engine.mat.ball,
      linearDamping: 0.05,
      // The physics sphere never spins (spin was what made balls fly off and feel
      // uncontrollable). The rolling you see is purely visual, driven by velocity.
      fixedRotation: true,
    });
    body.ball = this;
    body.addEventListener('collide', (e) => {
      const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const n = e.contact.ni.clone();
      if (e.contact.bi !== body) n.negate(n);
      onHit?.(this, e.body, impact, n);
    });
    this.body = body;

    // --- visuals ---
    const color = new THREE.Color(player.color);
    this.avatar = new Avatar(player, { anisotropy: engine.renderer.capabilities.getMaxAnisotropy() });
    this.mesh = this.avatar.body;   // rolls
    this.mesh.scale.setScalar(R);
    this.face = this.avatar.face;   // doesn't roll; turns to face movement
    this.face.scale.setScalar(R / 0.5);

    this.label = makeLabel(player.name, player.color);

    this.trailMat = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.35), transparent: true, opacity: 0.55 });
    this.trail = [];
    for (let i = 0; i < TRAIL_N; i++) {
      const m = new THREE.Mesh(TRAIL_GEO, this.trailMat);
      m.visible = false; m.userData.life = 0;
      this.trail.push(m);
    }
    this._trailI = 0; this._trailT = 0;

    this.root = new THREE.Group();
    this.root.add(this.mesh, this.face, this.label, ...this.trail);
    this.root.visible = false;
    engine.scene.add(this.root);
  }

  /** Change any of { color, skin, hat, eyes, outfit }. */
  setLook(look) { this.avatar.set(look); }

  setName(name, color) {
    this.root.remove(this.label);
    this.label.material.map.dispose(); this.label.material.dispose();
    this.label = makeLabel(name, color || this.player.color);
    this.root.add(this.label);
  }

  spawn(pos, yaw = 0) {
    const b = this.body;
    b.position.set(pos[0], pos[1], pos[2]);
    b.velocity.setZero(); b.angularVelocity.setZero();
    b.quaternion.set(0, 0, 0, 1);
    b._prev?.copy(b.position); // no interpolation streak from the old spot
    if (!this.active) this.engine.world.addBody(b);
    this.active = true;
    this.yaw = yaw;
    this.root.visible = true;
    this.dashTimer = 0; this.dashGrace = 0; this.stun = 0;
    for (const t of this.trail) { t.visible = false; t.userData.life = 0; }
    this.sync();
  }

  deactivate() {
    if (this.active) this.engine.world.removeBody(this.body);
    this.active = false;
    this.root.visible = false;
  }

  get position() { return this.body.position; }

  isGrounded() {
    const p = this.body.position, R = this.radius;
    const from = new CANNON.Vec3(p.x, p.y - R + 0.02, p.z);
    const to = new CANNON.Vec3(p.x, p.y - R - 0.18, p.z);
    const res = new CANNON.RaycastResult();
    this.engine.world.raycastClosest(from, to, { skipBackfaces: true }, res);
    return res.hasHit && res.body !== this.body;
  }

  /** x,y in -1..1 (y+ = away from players = -z on screen). Call every fixed step. */
  applyInput(x, y, dt) {
    if (!this.active) return;
    const T = this.tuning;
    const v = this.body.velocity;
    // Tilt picks a target velocity; accelerate toward it (no tilt = brake to a stop).
    let ax = (x * T.maxSpeed - v.x) * T.accel;
    let az = (-y * T.maxSpeed - v.z) * T.accel;
    let lim = T.maxAccel * (this._groundedCache ? 1 : T.airControl);
    if (this.stun > 0) lim *= 0.15;
    if (this.dashGrace > 0) lim *= 0.2;
    const m = Math.hypot(ax, az);
    if (m > lim) { ax *= lim / m; az *= lim / m; }
    // NOTE: no second argument. cannon's applyForce point is *relative* to the center;
    // passing a world position here is what used to spin balls like crazy.
    this.body.applyForce(new CANNON.Vec3(ax * T.mass, 0, az * T.mass));
  }

  /** Called once per fixed step before applyInput. */
  step(dt) {
    if (!this.active) return;
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashGrace = Math.max(0, this.dashGrace - dt);
    this.stun = Math.max(0, this.stun - dt);
    this._groundedCache = this.isGrounded();
  }

  /** Knock the ball around and briefly reduce its control. */
  stagger(seconds = this.tuning.hitStun) { this.stun = Math.max(this.stun, seconds); }

  /** Quick burst. Direction = tilt if tilting, else current velocity. */
  dash(x, y) {
    if (!this.active || this.dashTimer > 0) return false;
    let dx = x, dz = -y;
    if (Math.hypot(dx, dz) < 0.2) { dx = this.body.velocity.x; dz = this.body.velocity.z; }
    const m = Math.hypot(dx, dz);
    if (m < 0.01) { dx = Math.sin(this.yaw); dz = Math.cos(this.yaw); }
    else { dx /= m; dz /= m; }
    const I = this.tuning.dashImpulse * this.tuning.mass;
    this.body.applyImpulse(new CANNON.Vec3(dx * I, 1.5, dz * I));
    this.dashTimer = this.tuning.dashCooldown;
    this.dashGrace = 0.3;
    this.poke(0.35);
    return true;
  }

  /** Visual squash-and-stretch kick. */
  poke(amount) { this.squashVel += amount * 12; }

  /** Smoothed render position (interpolated between physics steps, so slow-mo stays silky). */
  get renderPosition() { return this.engine.lerpPos(this.body, _p); }

  sync() {
    const p = this.engine.lerpPos(this.body, _p);
    this.mesh.position.copy(p);
    this.mesh.quaternion.copy(this.rollQ);
    this.face.position.copy(p);
    this.label.position.set(p.x, p.y + this.radius + 0.95, p.z);
  }

  /** Per rendered frame: visuals only. */
  frame(dt) {
    if (!this.active) return;
    const v = this.body.velocity;
    const speed = Math.hypot(v.x, v.z);
    // Visual roll: rotate around the axis perpendicular to travel.
    if (speed > 0.01) {
      _axis.set(v.z / speed, 0, -v.x / speed);
      _dq.setFromAxisAngle(_axis, (speed * dt) / this.radius);
      this.rollQ.premultiply(_dq);
    }
    this.sync();

    // Face turns toward travel direction.
    if (speed > 0.6) {
      const target = Math.atan2(v.x, v.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 8);
    }
    this.face.rotation.y = this.yaw;

    // Squash spring.
    this.squashVel += (-this.squash * 180 - this.squashVel * 14) * dt;
    this.squash += this.squashVel * dt;
    const s = Math.max(-0.4, Math.min(0.4, this.squash));
    this.mesh.scale.set(this.radius * (1 + s * 0.5), this.radius * (1 - s), this.radius * (1 + s * 0.5));
    const fs = this.radius / 0.5;
    this.face.scale.set(fs * (1 + s * 0.5), fs * (1 - s), fs * (1 + s * 0.5));
    this.avatar.update(dt, speed); // blink, pupils, propellers, capes...

    // Trail.
    this._trailT -= dt;
    if (speed > 4 && this._trailT <= 0) {
      this._trailT = 0.03;
      const t = this.trail[this._trailI++ % TRAIL_N];
      t.position.set(this.body.position.x, this.body.position.y - this.radius * 0.3, this.body.position.z);
      t.userData.life = 1; t.visible = true;
    }
    for (const t of this.trail) {
      if (t.userData.life <= 0) continue;
      t.userData.life -= dt * 2.4;
      if (t.userData.life <= 0) { t.visible = false; continue; }
      t.scale.setScalar(this.radius * 0.55 * t.userData.life);
    }
  }

  dispose() {
    this.deactivate();
    this.engine.scene.remove(this.root);
    this.avatar.dispose();
    this.trailMat.dispose();
    this.label.material.map.dispose(); this.label.material.dispose();
  }
}

function makeLabel(text, color) {
  // Canvas is sized to the text, so long names never get clipped.
  const font = '700 64px Fredoka, system-ui, sans-serif';
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width + 64);
  const c = document.createElement('canvas');
  c.width = w + 16; c.height = 128;
  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = 'rgba(20,14,60,0.72)';
  roundRect(g, 8, 18, w, 92, 46); g.fill();
  g.lineWidth = 8; g.strokeStyle = color; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(0.6 * (c.width / 128), 0.6, 1);
  s.renderOrder = 10;
  return s;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
