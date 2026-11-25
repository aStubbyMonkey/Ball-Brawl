// Cheap, cheerful particle effects: bursts, confetti, comic pop-text.
import * as THREE from 'three';

const PART_GEO = new THREE.IcosahedronGeometry(1, 0);
const CONFETTI_GEO = new THREE.PlaneGeometry(1, 0.6);
const POP_WORDS = ['BONK!', 'BOING!', 'BOOP!', 'POW!', 'WHOMP!', 'BAP!', 'DOINK!'];

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
      this.mats.set(key, new THREE.MeshBasicMaterial({ color, side: double ? THREE.DoubleSide : THREE.FrontSide, transparent: true }));
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

  splash(pos) {
    this.burst(pos, '#ff7b00', { count: 22, speed: 4, up: 7, size: 0.16, life: 1.1 });
    this.burst(pos, '#ffd000', { count: 10, speed: 3, up: 5, size: 0.1, life: 0.9 });
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

  popText(pos, text, color = '#ffd60a') {
    text = text || POP_WORDS[Math.floor(Math.random() * POP_WORDS.length)];
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.font = '700 72px Fredoka, Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = '#1b1446'; g.strokeText(text, 128, 64);
    g.fillStyle = color; g.fillText(text, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.position.set(pos.x, pos.y + 1, pos.z);
    s.renderOrder = 20;
    s.userData = { life: 0.9, rot: (Math.random() - 0.5) * 0.6 };
    s.material.rotation = s.userData.rot;
    this.scene.add(s);
    this.texts.push(s);
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const m = this.parts[i], u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { this.scene.remove(m); this.parts.splice(i, 1); continue; }
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
      s.scale.set(2.2 * pop, 1.1 * pop, 1);
      s.position.y += dt * 1.2;
      s.material.opacity = Math.min(1, u.life * 3);
    }
  }
}
