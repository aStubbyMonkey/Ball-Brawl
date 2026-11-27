// Level themes: sky colors, scenery and ambient life (clouds, birds, wind streaks, floating motes).
// A game picks one with `theme: 'volcano'` in its definition; main builds it into the level.
// Add a theme: add an entry to THEMES. Each scenery piece is a function below.
import * as THREE from 'three';
import { SOFT_DOT } from './lava.js';

export const THEMES = {
  meadow: {
    sky: { top: '#3d9df5', mid: '#bfe6ff', bottom: '#f4fbff', fog: '#cfeaff', fogNear: 60, fogFar: 200 },
    clouds: { count: 16, y: [-14, -4], r: [24, 70] }, cloudSea: -9,
    islands: 6, birds: 2, wind: 0.6, motes: { color: '#ffffff', count: 120 },
  },
  volcano: {
    sky: { top: '#5b3cc4', mid: '#ff9a8b', bottom: '#ffd29a', fog: '#ffab8f', fogNear: 55, fogFar: 230 },
    clouds: { count: 8, y: [16, 30], r: [60, 110], tint: '#6e5a66', smoky: true },
    volcanoes: 3, wind: 0.5, motes: { color: '#ffcf8a', count: 70 },
  },
  candy: {
    sky: { top: '#6ec6ff', mid: '#c3a6ff', bottom: '#ff9eb5', fog: '#d9b8f5', fogNear: 55, fogFar: 220 },
    clouds: { count: 12, y: [10, 26], r: [45, 100], tint: '#8a7a8e', smoky: true },
    pillars: 9, balloons: 4, wind: 0.6, motes: { color: '#ffffff', count: 90 },
  },
  skytower: {
    sky: { top: '#2f6fd6', mid: '#9fd3ff', bottom: '#ffd5e5', fog: '#bfe0ff', fogNear: 60, fogFar: 240 },
    clouds: { count: 22, y: [-6, 26], r: [18, 75], lowSmoke: 6 }, // clouds near the lava turn to dark smoke
    birds: 3, wind: 1.6, motes: { color: '#ffffff', count: 120 },
  },
};

const rand = (a, b) => a + Math.random() * (b - a);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const shared = (g) => { g.userData.shared = true; return g; };
const CLOUD_GEO = shared(new THREE.IcosahedronGeometry(1, 2));
const STREAK_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 2, 128, 4);
  const t = new THREE.CanvasTexture(c); t.userData.shared = true; return t;
})();

/** Builds the theme into ctx.level and returns { update(dt) }. */
export function buildTheme(ctx, name, overrides = null) {
  const th = { ...(THEMES[name] || THEMES.meadow), ...(overrides || {}) };
  ctx.engine.setSky(th.sky);
  const updaters = [];
  const L = ctx.level;
  const wind = new THREE.Vector3(1, 0, 0.35).normalize();

  // ---- clouds: puffy clusters drifting with the wind
  if (th.clouds) {
    const tint = th.clouds.tint || '#ffffff';
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, emissive: tint, emissiveIntensity: th.clouds.smoky ? 0.1 : 0.35 });
    // Over lava, clouds are sooty grey smoke instead of fluffy white.
    const smoke = new THREE.MeshStandardMaterial({ color: '#4a4248', roughness: 1, emissive: '#2a1a1a', emissiveIntensity: 0.3 });
    const clouds = [];
    for (let i = 0; i < th.clouds.count; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(Math.random() * 4);
      for (let k = 0; k < puffs; k++) {
        const m = new THREE.Mesh(CLOUD_GEO, mat);
        m.userData.cloudPuff = true;
        const s = rand(1.4, 3);
        m.position.set((k - puffs / 2) * 1.6 + rand(-0.5, 0.5), rand(-0.3, 0.8) * s * 0.4, rand(-1, 1));
        m.scale.set(s, s * 0.75, s);
        c.add(m);
      }
      const a = Math.random() * Math.PI * 2, r = rand(...th.clouds.r);
      c.position.set(Math.cos(a) * r, rand(...th.clouds.y), Math.sin(a) * r);
      c.scale.setScalar(rand(0.8, 1.8));
      c.userData.speed = rand(0.6, 1.6);
      if (th.clouds.lowSmoke !== undefined && c.position.y < th.clouds.lowSmoke) c.traverse((o) => { if (o.userData.cloudPuff) o.material = smoke; });
      L.add(c); clouds.push(c);
    }
    const maxR = th.clouds.r[1] + 10;
    updaters.push((dt) => {
      for (const c of clouds) {
        c.position.addScaledVector(wind, c.userData.speed * dt);
        if (c.position.length() > maxR && c.position.dot(wind) > 0) c.position.addScaledVector(wind, -maxR * 1.9);
      }
    });
  }

  // ---- sea of clouds under the lobby
  if (th.cloudSea !== undefined) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#eaf6ff', emissiveIntensity: 0.4 });
    const sea = new THREE.Group();
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(CLOUD_GEO, mat);
      const a = Math.random() * Math.PI * 2, r = 6 + Math.sqrt(Math.random()) * 90, s = rand(4, 9);
      m.position.set(Math.cos(a) * r, th.cloudSea + rand(-1.5, 1), Math.sin(a) * r);
      m.scale.set(s, s * 0.45, s);
      sea.add(m);
    }
    L.add(sea);
    updaters.push((dt, t) => { sea.rotation.y = t * 0.01; });
  }

  // ---- floating grassy islands
  if (th.islands) {
    const rock = new THREE.MeshStandardMaterial({ color: '#a1887f', roughness: 0.9, flatShading: true });
    const grass = new THREE.MeshStandardMaterial({ color: '#7bd389', roughness: 0.8, flatShading: true });
    const leaf = new THREE.MeshStandardMaterial({ color: '#52b788', roughness: 0.8, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: '#8d5524', roughness: 0.9 });
    const isles = [];
    for (let i = 0; i < th.islands; i++) {
      const g = new THREE.Group();
      const R = rand(2, 4.5);
      const base = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.6, 7), rock); base.rotation.x = Math.PI; base.position.y = -R * 0.8;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R, 0.5, 7), grass);
      g.add(base, top);
      for (let k = 0; k < 1 + Math.floor(Math.random() * 3); k++) {
        const tree = new THREE.Group();
        tree.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), trunk), 0, 0.6, 0));
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.6, 1), 0), leaf); crown.position.y = 1.5;
        tree.add(crown);
        tree.position.set(rand(-R, R) * 0.5, 0.2, rand(-R, R) * 0.5);
        g.add(tree);
      }
      const a = (i / th.islands) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(26, 48);
      g.position.set(Math.cos(a) * r, rand(-4, 6), Math.sin(a) * r);
      g.userData = { y: g.position.y, ph: Math.random() * 6 };
      g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      L.add(g); isles.push(g);
    }
    updaters.push((dt, t) => { for (const g of isles) { g.position.y = g.userData.y + Math.sin(t * 0.5 + g.userData.ph) * 0.6; g.rotation.y += dt * 0.03; } });
  }

  // ---- distant volcanoes with smoke
  if (th.volcanoes) {
    const rock = new THREE.MeshStandardMaterial({ color: '#6b4a5a', roughness: 0.95, flatShading: true });
    const lavaTop = new THREE.MeshBasicMaterial({ color: '#ffb000' });
    const smokeMat = new THREE.MeshStandardMaterial({ color: '#c9b7c9', roughness: 1, transparent: true, opacity: 0.7, depthWrite: false });
    const vents = [];
    for (let i = 0; i < th.volcanoes; i++) {
      const g = new THREE.Group();
      const H = rand(22, 34), R = H * 1.1;
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.14, R, H, 10, 3), rock));
      const cap = new THREE.Mesh(new THREE.CircleGeometry(R * 0.13, 10), lavaTop); cap.rotation.x = -Math.PI / 2; cap.position.y = H / 2 - 0.3;
      g.add(cap);
      const a = -Math.PI / 2 + (i - (th.volcanoes - 1) / 2) * 0.75 + rand(-0.15, 0.15), r = rand(85, 120);
      g.position.set(Math.cos(a) * r, -6 + H / 2, Math.sin(a) * r);
      L.add(g);
      vents.push({ top: new THREE.Vector3(g.position.x, g.position.y + H / 2, g.position.z), t: Math.random() });
    }
    const puffs = [];
    updaters.push((dt) => {
      for (const v of vents) {
        v.t -= dt;
        if (v.t <= 0) {
          v.t = rand(0.25, 0.5);
          const m = new THREE.Mesh(CLOUD_GEO, smokeMat);
          m.position.copy(v.top).add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
          m.userData = { life: 6, s: rand(1.5, 2.5) };
          L.add(m); puffs.push(m);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const m = puffs[i], u = m.userData;
        u.life -= dt;
        m.position.y += dt * 2.2; m.position.addScaledVector(wind, dt * 1.5);
        m.scale.setScalar(u.s * (1 + (6 - u.life) * 0.5));
        if (u.life <= 0) { L.group.remove(m); puffs.splice(i, 1); }
      }
    });
  }

  // ---- rock pillars poking out of the lava, with candy-colored tops
  if (th.pillars) {
    const rock = new THREE.MeshStandardMaterial({ color: '#7b5e7b', roughness: 0.95, flatShading: true });
    const tops = ['#ffadad', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6'];
    for (let i = 0; i < th.pillars; i++) {
      const a = (i / th.pillars) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(24, 40), H = rand(6, 16);
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(rand(1, 1.8), rand(2.2, 3.2), H, 7, 2), rock), 0, H / 2, 0));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: tops[i % tops.length], roughness: 0.5 }));
      cap.position.y = H; cap.scale.set(1, 0.6, 1);
      g.add(cap);
      g.position.set(Math.cos(a) * r, -8, Math.sin(a) * r);
      L.add(g);
    }
  }

  // ---- hot air balloons drifting by
  if (th.balloons) {
    const cols = [['#ff4d6d', '#ffd60a'], ['#4cc9f0', '#ffffff'], ['#9b5de5', '#f15bb5'], ['#7bd389', '#ffd60a']];
    const list = [];
    for (let i = 0; i < th.balloons; i++) {
      const [a1, a2] = cols[i % cols.length];
      const c = document.createElement('canvas'); c.width = 256; c.height = 16;
      const gg = c.getContext('2d');
      for (let k = 0; k < 8; k++) { gg.fillStyle = k % 2 ? a1 : a2; gg.fillRect(k * 32, 0, 33, 16); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const g = new THREE.Group();
      const env = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      env.scale.set(1, 1.2, 1); env.position.y = 3;
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: '#a47148' }));
      g.add(env, basket);
      for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), new THREE.MeshBasicMaterial({ color: '#5a3b2a' }));
        line.position.set(x, 1.0, z); g.add(line);
      }
      const a = rand(0, Math.PI * 2), r = rand(40, 65);
      g.position.set(Math.cos(a) * r, rand(6, 18), Math.sin(a) * r);
      g.userData = { y: g.position.y, ph: rand(0, 6), a, r, s: rand(0.01, 0.02) * (Math.random() < 0.5 ? -1 : 1) };
      L.add(g); list.push(g);
    }
    updaters.push((dt, t) => {
      for (const g of list) {
        const u = g.userData; u.a += u.s * dt;
        g.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 0.4 + u.ph) * 1.2, Math.sin(u.a) * u.r);
      }
    });
  }

  // ---- little flocks of birds flapping across the sky
  if (th.birds) {
    const mat = new THREE.MeshBasicMaterial({ color: '#3d405b', side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.25, 1.1, 0, 0], 3));
    const flocks = [];
    for (let f = 0; f < th.birds; f++) {
      const flock = new THREE.Group();
      const birds = [];
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
        r.scale.x = -1;
        b.add(l, r);
        b.position.set(-Math.abs(i - 2) * 1.6, rand(-0.4, 0.4), (i - 2) * 1.4);
        b.userData = { l, r, ph: rand(0, 6) };
        flock.add(b); birds.push(b);
      }
      flock.userData = { birds, reset: true };
      L.add(flock); flocks.push(flock);
    }
    updaters.push((dt, t) => {
      for (const f of flocks) {
        const u = f.userData;
        if (u.reset) {
          u.reset = false;
          const a = rand(0, Math.PI * 2);
          u.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
          f.position.set(-u.dir.x * 70, rand(8, 20) + ctx.engine.camLook.y, -u.dir.z * 70).add(new THREE.Vector3(-u.dir.z, 0, u.dir.x).multiplyScalar(rand(-25, 25)));
          f.rotation.y = Math.atan2(-u.dir.z, u.dir.x);
        }
        f.position.addScaledVector(u.dir, dt * 6);
        if (f.position.length() > 90) u.reset = true;
        for (const b of u.birds) {
          const w = Math.sin(t * 9 + b.userData.ph) * 0.7;
          b.userData.l.rotation.x = w; b.userData.r.rotation.x = w;
        }
      }
    });
  }

  // ---- white wind streaks zipping past
  if (th.wind) {
    const streaks = [];
    let spawn = 0;
    updaters.push((dt) => {
      spawn -= dt * th.wind;
      if (spawn <= 0) {
        spawn = rand(0.05, 0.18);
        const mat = new THREE.MeshBasicMaterial({ map: STREAK_TEX, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(3, 7), rand(0.06, 0.12)), mat);
        const look = ctx.engine.camLook;
        m.position.set(look.x + rand(-22, 22), look.y + rand(0.5, 7), look.z + rand(-16, 16)).addScaledVector(wind, -8);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -Math.atan2(wind.z, wind.x);
        m.userData = { life: 0, max: rand(0.7, 1.3), speed: rand(14, 22) };
        L.add(m); streaks.push(m);
      }
      for (let i = streaks.length - 1; i >= 0; i--) {
        const m = streaks[i], u = m.userData;
        u.life += dt;
        m.position.addScaledVector(wind, u.speed * dt);
        const k = u.life / u.max;
        m.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.55;
        if (k >= 1) { L.group.remove(m); m.geometry.dispose(); m.material.dispose(); streaks.splice(i, 1); }
      }
    });
  }

  // ---- floating motes: soft specks hanging in the air around the action
  if (th.motes) {
    const N = th.motes.count, box = [44, 16, 36];
    const pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-0.5, 0.5) * box[0]; pos[i * 3 + 1] = rand(-0.2, 0.8) * box[1]; pos[i * 3 + 2] = rand(-0.5, 0.5) * box[2];
      ph[i] = rand(0, 100);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: SOFT_DOT, color: th.motes.color, size: 0.22, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false;
    L.add(pts);
    updaters.push((dt, t) => {
      const c = ctx.engine.camLook;
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        pos[k] += (wind.x * 0.6 + Math.sin(t * 0.7 + ph[i]) * 0.3) * dt;
        pos[k + 1] += Math.sin(t * 0.9 + ph[i] * 1.3) * 0.25 * dt;
        pos[k + 2] += (wind.z * 0.6 + Math.cos(t * 0.6 + ph[i]) * 0.3) * dt;
        // Wrap around the camera's focus so there are always motes in view.
        for (let a = 0; a < 3; a++) {
          const centre = [c.x, c.y + box[1] * 0.3, c.z][a], half = box[a] / 2;
          if (pos[k + a] < centre - half) pos[k + a] += box[a];
          else if (pos[k + a] > centre + half) pos[k + a] -= box[a];
        }
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  let time = 0;
  return { update(dt) { time += dt; for (const u of updaters) u(dt, time); } };
}
