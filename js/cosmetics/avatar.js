// A dressed-up ball: rolling body (color + skin) and a face group (eyes, hat, outfit) that
// doesn't roll. Used by the TV balls and by the phone's character preview.
import * as THREE from 'three';
import { skinTexture } from './skins.js';
import { buildHat, buildEyes, buildOutfit, HAT_LINE } from './parts.js';
import { DEFAULT_LOOK } from './catalog.js';

const BODY_GEO = new THREE.SphereGeometry(1, 48, 32);

export class Avatar {
  /** look: { color, skin, hat, eyes, outfit } */
  constructor(look, { anisotropy = 8 } = {}) {
    this.anisotropy = anisotropy;
    this.look = { color: '#ff4d6d', ...DEFAULT_LOOK };
    this.material = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.05 });
    this.body = new THREE.Mesh(BODY_GEO, this.material);
    this.body.scale.setScalar(0.5);
    this.body.castShadow = true;
    this.face = new THREE.Group();
    this.hat = this.eyes = this.outfit = null;
    this.blink = 1 + Math.random() * 3;
    this.time = Math.random() * 10;
    this.set(look, true);
  }

  set(look, force = false) {
    const prev = this.look;
    const next = { ...prev, ...look };
    const changed = (k) => force || next[k] !== prev[k];
    const colorChanged = changed('color');
    this.look = next;
    if (colorChanged || changed('skin')) {
      this.material.map = skinTexture(next.color, next.skin, this.anisotropy);
      this.material.needsUpdate = true;
    }
    if (changed('hat')) {
      this._drop(this.hat);
      this.hat = buildHat(next.hat);
      if (this.hat) { this.hat.position.y = HAT_LINE; this.face.add(this.hat); }
    }
    if (changed('eyes') || (colorChanged && next.eyes === 'sleepy')) {
      this._drop(this.eyes);
      this.eyes = buildEyes(next.eyes, next.color);
      this.face.add(this.eyes);
    }
    if (changed('outfit')) {
      this._drop(this.outfit);
      this.outfit = buildOutfit(next.outfit);
      if (this.outfit) this.face.add(this.outfit);
    }
  }

  _drop(obj) {
    if (!obj) return;
    this.face.remove(obj);
    obj.traverse((o) => o.geometry && o.geometry !== BODY_GEO && !o.geometry.userData.shared && o.geometry.dispose());
  }

  /** Per-frame animation. speed = ball speed (units/s). */
  update(dt, speed = 0) {
    this.time += dt;
    const t = this.time;
    // Blink.
    this.blink -= dt;
    const closed = this.blink < 0.12;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    const u = this.eyes?.userData || {};
    for (const e of u.blink || []) e.scale.y = closed ? 0.15 : 1;
    for (const p of u.pupils || []) {
      if (p.userData.base === undefined) p.userData.base = p.position.x;
      p.position.x = p.userData.base + Math.sin(t * 9) * Math.min(0.03, speed * 0.004);
    }
    for (const s of u.spiral || []) s.rotation.z -= dt * 5;
    if (u.scan) u.scan.rotation.y = Math.sin(t * 2.5) * 0.9;

    const h = this.hat?.userData || {};
    if (h.spin) h.spin.rotation.y += dt * (6 + speed * 2);
    if (h.bob) h.bob.position.y = 0.28 + Math.sin(t * 3) * 0.025;
    for (const w of h.wobble || []) w.rotation.x = Math.sin(t * 6 + w.id) * (0.08 + Math.min(0.25, speed * 0.03));

    const o = this.outfit?.userData || {};
    if (o.cape) {
      const lift = Math.min(0.75, speed * 0.09);
      o.cape.rotation.x = lift + Math.sin(t * (6 + speed)) * (0.03 + lift * 0.08);
    }
  }

  dispose() {
    this._drop(this.hat); this._drop(this.eyes); this._drop(this.outfit);
    this.material.dispose(); // the skin texture is cached + shared, so it stays
  }
}
