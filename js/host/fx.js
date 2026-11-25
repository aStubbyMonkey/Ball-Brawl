// Cheap, cheerful particle effects: bursts, confetti, comic pop-text.
import * as THREE from 'three';

const PART_GEO = new THREE.IcosahedronGeometry(1, 0);
const CONFETTI_GEO = new THREE.PlaneGeometry(1, 0.6);
const RING_GEO = new THREE.RingGeometry(0.8, 1, 40);
export const WORDS = {
  bonk: ['BONK!', 'BONK!', 'BONK!', 'BOINK!', 'BOOP!', 'BAP!', 'DOINK!'],
  big: ['POW!', 'WHAM!', 'WHOMP!', 'THWACK!'],
  boom: ['KABOOM!', 'KA-BLAM!', 'KAPOW!'],
  boing: ['BOING!', 'BOIIING!', 'SPROING!', 'BWOMP!'],
  lava: ['SPLOOSH!', 'SIZZLE!', 'KERSPLASH!', 'TSSSS!', 'YEOWCH!', 'HOT HOT HOT!'],
  dash: ['ZOOM!', 'WHOOSH!', 'VROOM!'],
  back: ["I'M BACK!", 'TA-DA!', 'BOING!'],
};
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.mats = new Map();
    this.texts = [];
  }

  _mat(color, double) {
    const key = color + (double ? 'd' : '');
    if (!this.mats.has(key)) {
      this.mats.set(key, new THREE.MeshBasicMaterial({ color, side: double ? THREE.DoubleSide : THREE.FrontSide, transparent: true, fog: false }));
    }
    return this.mats.get(key);
  }

  burst(pos, color, { count = 14, speed = 5, size = 0.12, up = 3, life = 0.8, gravity = -14 } = {}) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(PART_GEO, this._mat(color));
      m.position.set(pos.x, pos.y, pos.z);
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.8 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      m.userData = {
        v: new THREE.Vector3(Math.cos(a) * s * e, up + Math.random() * up, Math.sin(a) * s * e),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), g: gravity, spin: Math.random() * 10,
      };
      m.scale.setScalar(m.userData.size);
      this.scene.add(m);
      this.parts.push(m);
    }
  }

  /** Lava splash: big orange fountain + shockwave + a silly word. */
  splash(pos) {
    this.burst(pos, '#ff7b00', { count: 30, speed: 5, up: 9, size: 0.18, life: 1.2 });
    this.burst(pos, '#ffd000', { count: 16, speed: 3.5, up: 7, size: 0.12, life: 1 });
    this.burst(pos, '#555555', { count: 8, speed: 1, up: 4, size: 0.2, life: 1.4, gravity: 3 }); // smoke puffs
    this.shockwave(pos, '#ffb000', 4);
    this.popText({ x: pos.x, y: Math.max(pos.y, -1) + 1, z: pos.z }, pick(WORDS.lava), '#ff7b00', 1.4);
  }

  /** KABOOM: fireball burst + double shockwave. */
  explosion(pos) {
    this.burst(pos, '#ffffff', { count: 10, speed: 8, up: 4, size: 0.2, life: 0.35, gravity: 0 });
    this.burst(pos, '#ffd60a', { count: 24, speed: 9, up: 5, size: 0.2, life: 0.7 });
    this.burst(pos, '#ff4d00', { count: 24, speed: 6, up: 6, size: 0.25, life: 0.9 });
    this.burst(pos, '#444444', { count: 10, speed: 2, up: 3, size: 0.3, life: 1.2, gravity: 2 });
    this.shockwave(pos, '#ffd60a', 5);
    this.shockwave(pos, '#ff4d6d', 3.2, 0.5);
  }

  /** Flat ring that expands and fades. */
  shockwave(pos, color, radius = 3, life = 0.45) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(RING_GEO, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.05, pos.z);
    m.userData = { ring: true, life, max: life, radius };
    this.scene.add(m);
    this.parts.push(m);
  }

  poof(pos) { this.burst(pos, '#ffffff', { count: 16, speed: 4, up: 1.5, size: 0.18, life: 0.6, gravity: 2 }); }

  confetti(center = new THREE.Vector3(0, 10, 0), count = 160) {
    const colors = ['#ff4d6d', '#ffd60a', '#4cc9f0', '#7bd389', '#9b5de5', '#ff9f1c'];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(CONFETTI_GEO, this._mat(colors[i % colors.length], true));
      m.position.set(center.x + (Math.random() - 0.5) * 20, center.y + Math.random() * 6, center.z + (Math.random() - 0.5) * 14);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      m.userData = {
        v: new THREE.Vector3((Math.random() - 0.5) * 3, -1 - Math.random() * 2, (Math.random() - 0.5) * 3),
        life: 5, max: 5, size: 0.25, g: -1.2, spin: 4 + Math.random() * 6, drag: true,
      };
      m.scale.setScalar(0.25);
      this.scene.add(m);
      this.parts.push(m);
    }
  }

  popText(pos, text, color = '#ffd60a', size = 1) {
    text = text || pick(WORDS.bonk);
    // Size the canvas to the text, so long words ("HOT HOT HOT!") never get cut off.
    const font = '700 112px Fredoka, Impact, sans-serif';
    const probe = (this._probe ||= document.createElement('canvas').getContext('2d'));
    probe.font = font;
    const H = 176, w = Math.ceil(probe.measureText(text).width + 60);
    const c = document.createElement('canvas');
    c.width = w; c.height = H;
    const g = c.getContext('2d');
    g.font = font;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 22; g.strokeStyle = '#1b1446'; g.strokeText(text, w / 2, H / 2 + 6);
    g.fillStyle = color; g.fillText(text, w / 2, H / 2);
    // A little highlight on the top half for a shiny comic look.
    g.save(); g.globalCompositeOperation = 'source-atop';
    const hl = g.createLinearGradient(0, H * 0.2, 0, H * 0.55);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, w, H * 0.55);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    s.position.set(pos.x, pos.y + 1, pos.z);
    s.renderOrder = 20;
    // World height ~1.1 * size; width follows the text's real aspect ratio.
    s.userData = { life: 0.9, rot: (Math.random() - 0.5) * 0.5, size, aspect: w / H };
    s.material.rotation = s.userData.rot;
    this.scene.add(s);
    this.texts.push(s);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const m = this.parts[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.scene.remove(m); if (u.ring) m.material.dispose(); this.parts.splice(i, 1); continue; }
      if (u.ring) {
        const t = 1 - u.life / u.max;
        m.scale.setScalar(0.3 + u.radius * (1 - Math.pow(1 - t, 3)));
        m.material.opacity = 1 - t;
        continue;
      }
      u.v.y += u.g * dt;
      if (u.drag) { u.v.x *= 0.99; u.v.z *= 0.99; }
      m.position.addScaledVector(u.v, dt);
      m.rotation.x += u.spin * dt; m.rotation.y += u.spin * 0.7 * dt;
      const k = Math.min(1, u.life / (u.max * 0.4));
      m.scale.setScalar(u.size * k);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const s = this.texts[i], u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); this.texts.splice(i, 1); continue; }
      const age = 0.9 - u.life;
      const pop = age < 0.12 ? age / 0.12 * 1.3 : 1.3 - Math.min(0.3, (age - 0.12) * 2);
      s.scale.set(1.1 * u.aspect * pop * u.size, 1.1 * pop * u.size, 1);
      s.position.y += dt * 1.2;
      s.material.opacity = Math.min(1, u.life * 3);
    }
  }
}
