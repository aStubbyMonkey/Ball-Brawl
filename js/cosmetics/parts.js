// 3D cosmetic builders: hats, eyes and outfits. Everything is authored for a ball of radius 0.5
// centered at the origin, with the face looking down +z.
//   hats:    y = 0 is the "hat line" (0.41 above the center); the avatar places them there
//   eyes:    built in ball space (eye centers around (±0.17, 0.16, 0.38))
//   outfits: built in ball space
// A builder returns a THREE.Group. Optional userData hooks the avatar animates:
//   blink: [objects whose scale.y squashes when blinking]   pupils: [objects that wobble]
//   spin: object to spin (propeller)   bob: object to bob (halo)   wobble: [objects to sway]
//   cape: pivot rotated back by speed   scan: visor light   spiral: [objects to rotate]
import * as THREE from 'three';

// ---------------------------------------------------------------- helpers
const matCache = new Map();
/** Shared, cached material. Don't dispose these. */
export function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)) {
    const { basic, ...rest } = o;
    matCache.set(key, basic
      ? new THREE.MeshBasicMaterial({ color, ...rest })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...rest }));
  }
  return matCache.get(key);
}
const GLOSS = { roughness: 0.15, metalness: 0.4 };
const GOLD = { roughness: 0.25, metalness: 0.85 };

function mk(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  if (scale !== undefined) Array.isArray(scale) ? m.scale.set(...scale) : m.scale.setScalar(scale);
  return m;
}
const group = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => k && g.add(k)); return g; };

const _o = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4();
/** Place obj on the ball surface at latitude/longitude (degrees; lon 0 = front), +z facing out. */
function surf(obj, lat, lon, r = 0.5) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  const p = new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
  obj.position.copy(p);
  obj.quaternion.setFromRotationMatrix(_m4.lookAt(p, _o, _up));
  return obj;
}
/** A slice of a sphere (for caps, jackets, patches). phi is centered on the front when centered=true. */
function shell(r, thetaStart, thetaLen, mat, { phiStart = 0, phiLen = Math.PI * 2, segW = 48, segH = 12 } = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, segW, segH, phiStart, phiLen, thetaStart, thetaLen), mat);
  return m;
}
const FRONT = Math.PI / 2; // SphereGeometry phi that points at +z

function starShape(r, inner = 0.45, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}
function heartShape(s) {
  const h = new THREE.Shape();
  h.moveTo(0, -s * 0.55);
  h.bezierCurveTo(-s * 1.1, s * 0.1, -s * 0.55, s * 0.95, 0, s * 0.42);
  h.bezierCurveTo(s * 0.55, s * 0.95, s * 1.1, s * 0.1, 0, -s * 0.55);
  return h;
}
const extrude = (shape, depth = 0.03) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });

const texCache = new Map();
function canvasTex(key, w, h, paint) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
const stripeTex = (key, a, b, n) => canvasTex(key, 256, 16, (g, w, h) => {
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i / n) * w, 0, w / n + 1, h); }
});

// ---------------------------------------------------------------- hats
const HAT_BUILDERS = {
  party() {
    const cone = mk(new THREE.ConeGeometry(0.2, 0.5, 24), M('#ff4fa3'), [0, 0.2, 0]);
    const stripes = [0.06, 0.2].map((y) => mk(new THREE.CylinderGeometry(0.2 - (y + 0.05) * 0.4, 0.2 - (y - 0.0) * 0.4, 0.05, 24, 1, true), M('#ffe066'), [0, y, 0]));
    const pom = mk(new THREE.SphereGeometry(0.075, 12, 10), M('#ffe066'), [0, 0.47, 0]);
    const g = group(cone, pom, ...stripes); g.rotation.z = 0.2; return g;
  },
  tophat() {
    const black = M('#222222', { roughness: 0.35 });
    return group(
      mk(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 32), black),
      mk(new THREE.CylinderGeometry(0.23, 0.22, 0.42, 32), black, [0, 0.22, 0]),
      mk(new THREE.CylinderGeometry(0.228, 0.226, 0.08, 32), M('#e63946'), [0, 0.07, 0]),
    );
  },
  crown() {
    const gold = M('#ffc300', GOLD);
    const ring = mk(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 24, 1, true), M('#ffc300', { ...GOLD, side: THREE.DoubleSide }), [0, 0.06, 0]);
    const g = group(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mk(new THREE.ConeGeometry(0.06, 0.17, 8), gold, [Math.sin(a) * 0.23, 0.2, Math.cos(a) * 0.23]));
      g.add(mk(new THREE.SphereGeometry(0.02, 8, 6), gold, [Math.sin(a) * 0.23, 0.3, Math.cos(a) * 0.23]));
      g.add(mk(new THREE.SphereGeometry(0.035, 10, 8), M('#ff006e', GLOSS), [Math.sin(a) * 0.258, 0.07, Math.cos(a) * 0.258]));
    }
    return g;
  },
  propeller() {
    const cap = shell(0.53, 0, 1.05, M('#4cc9f0'));
    cap.position.y = -0.41;
    const seams = [0, 1, 2].map((i) => { const s = shell(0.535, 0, 1.05, M('#ffd60a'), { phiStart: i * 2.1, phiLen: 0.25, segW: 4 }); s.position.y = -0.41; return s; });
    const stem = mk(new THREE.CylinderGeometry(0.025, 0.025, 0.16), M('#333333'), [0, 0.18, 0]);
    const spin = new THREE.Group(); spin.position.y = 0.27;
    for (const [c, r] of [['#ff4d6d', 0], ['#ffd60a', Math.PI]]) {
      const blade = mk(new THREE.BoxGeometry(0.36, 0.02, 0.09), M(c), [0.18, 0, 0], [0.25, 0, 0]);
      const p = group(blade); p.rotation.y = r; spin.add(p);
    }
    spin.add(mk(new THREE.SphereGeometry(0.04, 10, 8), M('#ffffff'), [0, 0.01, 0]));
    const g = group(cap, ...seams, stem, spin); g.userData.spin = spin; return g;
  },
  cowboy() {
    const pts = [[0.0, 0.27], [0.17, 0.28], [0.22, 0.24], [0.25, 0.06], [0.27, 0.0], [0.42, 0.02], [0.49, 0.09], [0.51, 0.13]].map(([x, y]) => new THREE.Vector2(x, y));
    const hat = mk(new THREE.LatheGeometry(pts, 40), M('#b5713a', { side: THREE.DoubleSide, roughness: 0.8 }), [0, -0.02, 0]);
    hat.scale.set(1, 1, 0.88);
    const band = mk(new THREE.CylinderGeometry(0.255, 0.262, 0.05, 32, 1, true), M('#5a3214', { side: THREE.DoubleSide }), [0, 0.05, 0]);
    band.scale.set(1, 1, 0.88);
    const star = mk(extrude(starShape(0.04), 0.01), M('#ffd60a', GOLD), [0, 0.04, 0.23]);
    const g = group(hat, band, star); g.rotation.x = -0.12; return g;
  },
  beanie() {
    const knit = shell(0.535, 0, 1.12, M('#e63946', { roughness: 0.9 }));
    knit.position.y = -0.41;
    const ribs = mk(new THREE.TorusGeometry(0.47, 0.06, 10, 40), M('#f4f1de', { roughness: 0.9 }), [0, -0.17, 0], [Math.PI / 2, 0, 0]);
    const pom = mk(new THREE.IcosahedronGeometry(0.1, 2), M('#f4f1de', { roughness: 1, flatShading: true }), [0, 0.17, 0]);
    return group(knit, ribs, pom);
  },
  cap() {
    const crown = shell(0.535, 0, 1.0, M('#4361ee'));
    crown.position.y = -0.41;
    const bill = mk(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 32, 1, false, -Math.PI / 2, Math.PI), M('#4361ee'), [0, -0.1, 0.3], [0.22, 0, 0]);
    bill.scale.set(1, 1, 0.8);
    const button = mk(new THREE.SphereGeometry(0.04, 10, 8), M('#ffffff'), [0, 0.12, 0]);
    const logo = surf(mk(new THREE.CircleGeometry(0.08, 24), M('#ffffff')), 50, 0, 0.537);
    logo.position.y -= 0.41;
    return group(crown, bill, button, logo);
  },
  viking() {
    const metal = M('#9aa5b1', { roughness: 0.3, metalness: 0.8 });
    const dome = shell(0.535, 0, 1.0, metal); dome.position.y = -0.41;
    const band = mk(new THREE.TorusGeometry(0.455, 0.035, 10, 40), M('#ffc300', GOLD), [0, -0.12, 0], [Math.PI / 2, 0, 0]);
    const ridge = mk(new THREE.TorusGeometry(0.535, 0.025, 8, 30, 1.9), M('#ffc300', GOLD), [0, -0.41, 0], [0, Math.PI / 2, Math.PI / 2 - 0.95]);
    const g = group(dome, band, ridge);
    for (const s of [-1, 1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 0.38, -0.05, 0), new THREE.Vector3(s * 0.62, 0.02, 0), new THREE.Vector3(s * 0.62, 0.32, 0.04));
      const horn = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.06, 10), M('#f4ecd8', { roughness: 0.6 }));
      // Taper the tube toward the tip.
      const pos = horn.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const seg = Math.floor(i / 11) / 16, c = curve.getPoint(Math.min(1, seg));
        const k = 1 - seg * 0.85;
        pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
      }
      horn.geometry.computeVertexNormals();
      g.add(horn);
    }
    return g;
  },
  chef() {
    const white = M('#ffffff', { roughness: 0.8 });
    const g = group(mk(new THREE.CylinderGeometry(0.3, 0.29, 0.18, 32), white, [0, 0.06, 0]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(mk(new THREE.SphereGeometry(0.16, 16, 12), white, [Math.sin(a) * 0.17, 0.27, Math.cos(a) * 0.17]));
    }
    g.add(mk(new THREE.SphereGeometry(0.2, 16, 12), white, [0, 0.34, 0]));
    return g;
  },
  wizard() {
    const purple = M('#5a189a', { roughness: 0.7 });
    const brim = mk(new THREE.CylinderGeometry(0.44, 0.44, 0.025, 40), purple);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(Math.sin(t * 1.6) * t * t * -0.12, t * 0.7, 0)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const cone = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.26, 20), purple);
    const pos = cone.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const seg = Math.floor(i / 21) / 24, c = curve.getPoint(Math.min(1, seg)), k = Math.max(0.02, 1 - seg);
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    }
    cone.geometry.computeVertexNormals();
    const band = mk(new THREE.CylinderGeometry(0.255, 0.26, 0.06, 32, 1, true), M('#ffd60a', GOLD), [0, 0.04, 0]);
    const g = group(brim, cone, band);
    for (const [x, y, z, s] of [[0.1, 0.22, 0.17, 0.05], [-0.12, 0.34, 0.11, 0.04], [0.02, 0.46, 0.08, 0.03]]) {
      g.add(mk(extrude(starShape(s), 0.01), M('#ffd60a', { emissive: '#7a5a00' }), [x, y, z], [-0.3, 0, 0]));
    }
    return g;
  },
  pirate() {
    const black = M('#1d1d1d', { roughness: 0.6 });
    const hat = mk(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 32, 1, false, Math.PI / 2, Math.PI), black, [0, -0.02, 0], [Math.PI / 2, 0, 0]);
    hat.scale.set(1, 1, 0.72);
    const trim = mk(new THREE.TorusGeometry(0.4, 0.015, 6, 32, Math.PI), M('#ffc300', GOLD), [0, -0.02, 0.055]);
    trim.scale.set(1, 0.72, 1);
    const skull = mk(new THREE.SphereGeometry(0.065, 14, 10), M('#ffffff'), [0, 0.11, 0.06]);
    const eyeL = mk(new THREE.SphereGeometry(0.016, 6, 6), black, [-0.022, 0.115, 0.12]);
    const eyeR = mk(new THREE.SphereGeometry(0.016, 6, 6), black, [0.022, 0.115, 0.12]);
    const bone1 = mk(new THREE.CapsuleGeometry(0.012, 0.13, 3, 6), M('#ffffff'), [0, 0.04, 0.07], [0, 0, 0.9]);
    const bone2 = mk(new THREE.CapsuleGeometry(0.012, 0.13, 3, 6), M('#ffffff'), [0, 0.04, 0.07], [0, 0, -0.9]);
    return group(hat, trim, skull, eyeL, eyeR, bone1, bone2);
  },
  halo() {
    const ring = mk(new THREE.TorusGeometry(0.24, 0.035, 12, 40), M('#ffe066', { emissive: '#ffcc00', emissiveIntensity: 0.9, roughness: 0.3 }), [0, 0.28, 0], [Math.PI / 2, 0, 0]);
    const g = group(ring); g.userData.bob = ring; return g;
  },
  headphones() {
    const band = mk(new THREE.TorusGeometry(0.54, 0.035, 10, 32, Math.PI), M('#3d405b', GLOSS), [0, -0.41, 0]);
    const g = group(band);
    for (const s of [-1, 1]) {
      g.add(mk(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24), M('#ff4d6d', GLOSS), [s * 0.54, -0.43, 0], [0, 0, Math.PI / 2]));
      g.add(mk(new THREE.TorusGeometry(0.12, 0.035, 8, 20), M('#222222', { roughness: 0.9 }), [s * 0.49, -0.43, 0], [0, Math.PI / 2, 0]));
    }
    return g;
  },
  antennae() {
    const g = group(); g.userData.wobble = [];
    for (const s of [-1, 1]) {
      const a = group(
        mk(new THREE.CylinderGeometry(0.015, 0.02, 0.3, 8), M('#7bd389'), [0, 0.15, 0]),
        mk(new THREE.SphereGeometry(0.06, 14, 10), M('#b9fbc0', { emissive: '#4ade80', emissiveIntensity: 0.8 }), [0, 0.32, 0]),
      );
      a.position.set(s * 0.12, 0, 0); a.rotation.z = -s * 0.35;
      g.add(a); g.userData.wobble.push(a);
    }
    return g;
  },
  catears() {
    const g = group();
    for (const s of [-1, 1]) {
      const ear = mk(new THREE.ConeGeometry(0.13, 0.24, 4), M('#2b2b2b', { roughness: 0.8 }), [s * 0.19, 0.08, 0], [0, Math.PI / 4, -s * 0.4], [1, 1, 0.5]);
      const inner = mk(new THREE.ConeGeometry(0.08, 0.15, 4), M('#ff8fab', { roughness: 0.8 }), [s * 0.185, 0.07, 0.03], [0, Math.PI / 4, -s * 0.4], [1, 1, 0.4]);
      g.add(ear, inner);
    }
    return g;
  },
  unicorn() {
    const horn = mk(new THREE.ConeGeometry(0.07, 0.38, 20), M('#fff3fb', { roughness: 0.3 }), [0, 0.17, 0]);
    const g = group(horn);
    for (let i = 0; i < 4; i++) g.add(mk(new THREE.TorusGeometry(0.06 - i * 0.012, 0.01, 6, 20), M('#ffc300', GOLD), [0, 0.05 + i * 0.075, 0], [Math.PI / 2 - 0.25, 0, 0]));
    const wrap = group(g); g.position.set(0, 0, 0.12); g.rotation.x = 0.35;
    return wrap;
  },
  mohawk() {
    const g = group();
    for (let k = -3; k <= 3; k++) {
      const spike = mk(new THREE.ConeGeometry(0.06, 0.24, 10), M(k % 2 ? '#ff4fa3' : '#9b5de5', { roughness: 0.6 }));
      const a = k * 0.22;
      spike.position.set(0, -0.41 + Math.cos(a) * 0.55, Math.sin(a) * 0.55);
      spike.rotation.x = a;
      g.add(spike);
    }
    return g;
  },
  cone() {
    const orange = M('#ff7b00', { roughness: 0.5 });
    const white = M('#ffffff', { roughness: 0.5 });
    return group(
      mk(new THREE.BoxGeometry(0.5, 0.04, 0.5), orange, [0, 0.02, 0]),
      mk(new THREE.ConeGeometry(0.24, 0.6, 32), orange, [0, 0.33, 0]),
      mk(new THREE.CylinderGeometry(0.155, 0.18, 0.08, 32, 1, true), white, [0, 0.23, 0]),
      mk(new THREE.CylinderGeometry(0.075, 0.1, 0.07, 32, 1, true), white, [0, 0.42, 0]),
    );
  },
  flower() {
    const g = group(mk(new THREE.SphereGeometry(0.07, 14, 10), M('#ffd60a'), [0, 0, 0.02], [0, 0, 0], [1, 1, 0.6]));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(mk(new THREE.SphereGeometry(0.06, 10, 8), M('#ffffff'), [Math.cos(a) * 0.11, Math.sin(a) * 0.11, 0], [0, 0, a], [1.4, 0.6, 0.3]));
    }
    g.position.set(0.22, 0.02, 0.12); g.rotation.set(-0.6, 0.6, 0);
    return group(g);
  },
  sprout() {
    const green = M('#52b788');
    const stem = mk(new THREE.CylinderGeometry(0.015, 0.02, 0.16, 8), green, [0, 0.1, 0]);
    const l1 = mk(new THREE.SphereGeometry(0.08, 12, 8), M('#74c69d'), [0.08, 0.2, 0], [0, 0, -0.6], [1.3, 0.35, 0.8]);
    const l2 = mk(new THREE.SphereGeometry(0.07, 12, 8), M('#74c69d'), [-0.07, 0.17, 0], [0, 0, 0.6], [1.3, 0.35, 0.8]);
    const g = group(stem, l1, l2); g.userData.wobble = [g]; return g;
  },
  bow() {
    const pink = M('#ff5fa2', { roughness: 0.4 });
    const g = group(
      mk(new THREE.ConeGeometry(0.12, 0.22, 4), pink, [-0.11, 0, 0], [0, 0, Math.PI / 2]),
      mk(new THREE.ConeGeometry(0.12, 0.22, 4), pink, [0.11, 0, 0], [0, 0, -Math.PI / 2]),
      mk(new THREE.SphereGeometry(0.06, 12, 10), pink),
    );
    g.position.set(0.12, 0.02, -0.04); g.rotation.set(-0.3, 0, -0.3);
    return group(g);
  },
};

// ---------------------------------------------------------------- eyes
const EYE_GEO = new THREE.SphereGeometry(1, 24, 18);
EYE_GEO.userData.shared = true;
const WHITE = () => M('#ffffff', { roughness: 0.25 });
const INK = () => M('#151020', { basic: true });

function googly(x, y, z, r = 0.15, pr = 0.5, look = [0, 0]) {
  const g = new THREE.Group();
  const w = mk(EYE_GEO, WHITE(), [0, 0, 0], [0, 0, 0], r);
  const p = mk(EYE_GEO, INK(), [look[0] * r * 0.35, look[1] * r * 0.35, r * 0.62], [0, 0, 0], r * pr);
  const shine = mk(EYE_GEO, M('#ffffff', { basic: true }), [r * 0.15, r * 0.2, r * 0.62 + r * pr * 0.75], [0, 0, 0], r * pr * 0.3);
  p.add(shine); shine.position.set(0.3, 0.35, 0.75); shine.scale.setScalar(0.3);
  g.add(w, p);
  g.position.set(x, y, z);
  g.userData.pupil = p;
  return g;
}
function eyesWith(list, extra = []) {
  const g = group(...list, ...extra);
  g.userData.blink = list.filter((e) => e.userData.pupil);
  g.userData.pupils = list.map((e) => e.userData.pupil).filter(Boolean);
  return g;
}
const L = [-0.17, 0.16, 0.38], R = [0.17, 0.16, 0.38];

function glassesArms(mat) {
  return [-1, 1].map((s) => mk(new THREE.BoxGeometry(0.02, 0.025, 0.36), mat, [s * 0.36, 0.2, 0.2], [0, s * -0.55, 0]));
}

const EYE_BUILDERS = {
  googly: () => eyesWith([googly(...L), googly(...R)]),
  happy() {
    const ink = M('#151020', { roughness: 0.4 });
    const g = group();
    for (const [x, s] of [[-0.17, -1], [0.17, 1]]) {
      g.add(mk(new THREE.TorusGeometry(0.075, 0.022, 8, 20, Math.PI), ink, [x, 0.13, 0.455], [0, s * 0.33, 0]));
      g.add(mk(new THREE.CircleGeometry(0.06, 20), M('#ff8fab', { transparent: true, opacity: 0.8 }), [x * 1.45, 0.0, 0.455], [0, s * 0.55, 0], [1, 0.6, 1]));
    }
    return g;
  },
  angry() {
    const brow = M('#151020', { roughness: 0.4 });
    const g = eyesWith([googly(...L, 0.13, 0.45), googly(...R, 0.13, 0.45)]);
    g.add(mk(new THREE.BoxGeometry(0.17, 0.04, 0.04), brow, [-0.16, 0.31, 0.42], [0, -0.35, -0.38]));
    g.add(mk(new THREE.BoxGeometry(0.17, 0.04, 0.04), brow, [0.16, 0.31, 0.42], [0, 0.35, 0.38]));
    return g;
  },
  sleepy(color) {
    const lid = M(new THREE.Color(color).multiplyScalar(0.8).getStyle(), { roughness: 0.4 });
    const a = googly(...L, 0.14, 0.45, [0, -0.6]), b = googly(...R, 0.14, 0.45, [0, -0.6]);
    for (const e of [a, b]) e.add(mk(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lid, [0, 0, 0], [0.5, 0, 0]));
    const g = eyesWith([a, b]); g.userData.blink = []; return g;
  },
  derp: () => eyesWith([googly(-0.18, 0.17, 0.37, 0.17, 0.45, [-0.8, 0.6]), googly(0.16, 0.13, 0.4, 0.11, 0.55, [0.7, -0.7])]),
  lashes() {
    const ink = M('#151020', { roughness: 0.4 });
    const a = googly(...L, 0.145), b = googly(...R, 0.145);
    for (const [e, s] of [[a, -1], [b, 1]]) {
      for (let i = 0; i < 3; i++) {
        const ang = (i - 1) * 0.5 + s * 0.35;
        e.add(mk(new THREE.BoxGeometry(0.015, 0.07, 0.015), ink, [Math.sin(ang) * 0.15, Math.cos(ang) * 0.15 + 0.01, 0.06], [0, 0, -ang]));
      }
    }
    return eyesWith([a, b]);
  },
  sparkle() {
    const list = [L, R].map(([x, y, z]) => {
      const g = new THREE.Group();
      const iris = mk(EYE_GEO, M('#151020', { roughness: 0.2 }), [0, 0, 0], [0, 0, 0], [0.12, 0.16, 0.08]);
      const big = mk(EYE_GEO, M('#ffffff', { basic: true }), [-0.04, 0.06, 0.07], [0, 0, 0], 0.04);
      const small = mk(EYE_GEO, M('#ffffff', { basic: true }), [0.04, -0.05, 0.07], [0, 0, 0], 0.02);
      g.add(iris, big, small); g.position.set(x, y, z + 0.04); g.userData.pupil = big;
      return g;
    });
    return eyesWith(list);
  },
  dizzy() {
    const tex = canvasTex('spiral', 128, 128, (g, w) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#151020'; g.lineWidth = 7; g.beginPath();
      for (let a = 0; a < Math.PI * 8; a += 0.1) { const r = a * 2.3; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      g.stroke();
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const list = [[-1, L], [1, R]].map(([s, [x, y]]) => {
      const disc = mk(new THREE.CircleGeometry(0.13, 32), mat);
      const w = group(disc); w.position.set(x, y, 0.46); w.rotation.y = s * 0.33;
      return { w, disc };
    });
    const g = group(...list.map((l) => l.w)); g.userData.spiral = list.map((l) => l.disc); return g;
  },
  cyclops: () => eyesWith([googly(0, 0.17, 0.33, 0.23, 0.5)]),
  shades() {
    const frame = M('#111111', { roughness: 0.15, metalness: 0.6 });
    const g = group(...glassesArms(frame));
    for (const s of [-1, 1]) {
      const lens = mk(new THREE.CylinderGeometry(0.135, 0.135, 0.04, 32), frame, [s * 0.17, 0.17, 0.465], [Math.PI / 2, 0, -s * 0.0], [1.2, 1, 0.82]);
      lens.rotation.z = 0; lens.rotation.y = s * 0.3;
      const glint = mk(new THREE.BoxGeometry(0.15, 0.02, 0.005), M('#ffffff', { basic: true, transparent: true, opacity: 0.75 }), [s * 0.15, 0.22, 0.495], [0, s * 0.3, 0.6]);
      g.add(lens, glint);
    }
    g.add(mk(new THREE.BoxGeometry(0.12, 0.03, 0.03), frame, [0, 0.21, 0.49]));
    return g;
  },
  hearts() {
    const lensMat = M('#ff4fa3', { roughness: 0.1, metalness: 0.3, emissive: '#5a0030' });
    const g = group(...glassesArms(M('#ff4fa3', GLOSS)));
    const geo = extrude(heartShape(0.13), 0.03);
    for (const s of [-1, 1]) g.add(mk(geo, lensMat, [s * 0.17, 0.17, 0.455], [0, s * 0.3, 0]));
    g.add(mk(new THREE.BoxGeometry(0.1, 0.025, 0.025), M('#ff4fa3', GLOSS), [0, 0.2, 0.49]));
    return g;
  },
  stars() {
    const lensMat = M('#ffd60a', { roughness: 0.15, metalness: 0.5, emissive: '#5a4300' });
    const g = group(...glassesArms(M('#ffd60a', GOLD)));
    const geo = extrude(starShape(0.15, 0.5), 0.03);
    for (const s of [-1, 1]) g.add(mk(geo, lensMat, [s * 0.18, 0.17, 0.45], [0, s * 0.3, 0]));
    g.add(mk(new THREE.BoxGeometry(0.08, 0.025, 0.025), M('#ffd60a', GOLD), [0, 0.2, 0.49]));
    return g;
  },
  nerd() {
    const frame = M('#151020', { roughness: 0.3 });
    const a = googly(-0.17, 0.16, 0.39, 0.11, 0.6), b = googly(0.17, 0.16, 0.39, 0.11, 0.6);
    const g = eyesWith([a, b], glassesArms(frame));
    for (const s of [-1, 1]) {
      g.add(mk(new THREE.TorusGeometry(0.145, 0.025, 10, 32), frame, [s * 0.17, 0.16, 0.49], [0, s * 0.3, 0]));
      g.add(mk(new THREE.CircleGeometry(0.135, 32), M('#cdeeff', { transparent: true, opacity: 0.25, roughness: 0.05 }), [s * 0.17, 0.16, 0.495], [0, s * 0.3, 0]));
    }
    g.add(mk(new THREE.BoxGeometry(0.07, 0.025, 0.025), frame, [0, 0.19, 0.51]));
    return g;
  },
  monocle() {
    const gold = M('#ffc300', GOLD);
    const right = googly(...R, 0.14, 0.5);
    const g = eyesWith([right]);
    g.add(mk(new THREE.TorusGeometry(0.075, 0.022, 8, 20, Math.PI), M('#151020', { roughness: 0.4 }), [-0.17, 0.13, 0.455], [0, -0.33, 0]));
    g.add(mk(new THREE.TorusGeometry(0.16, 0.02, 10, 32), gold, [0.17, 0.16, 0.5], [0, 0.3, 0]));
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 0.08, 0.47), new THREE.Vector3(0.36, -0.1, 0.4), new THREE.Vector3(0.42, -0.2, 0.2)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.008, 5), gold));
    return g;
  },
  visor() {
    const band = mk(new THREE.CylinderGeometry(0.535, 0.535, 0.15, 48, 1, true, -1.25, 2.5), M('#1b1446', { roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide }), [0, 0.17, 0]);
    const glow = mk(new THREE.CylinderGeometry(0.54, 0.54, 0.03, 48, 1, true, -1.15, 2.3), M('#4cc9f0', { basic: true, side: THREE.DoubleSide }), [0, 0.17, 0]);
    const dot = mk(new THREE.SphereGeometry(0.035, 10, 8), M('#ffffff', { basic: true }), [0, 0.17, 0.545]);
    const scan = group(dot);
    const g = group(band, glow, scan); g.userData.scan = scan; return g;
  },
  patch() {
    const black = M('#151020', { roughness: 0.6 });
    const g = eyesWith([googly(...R, 0.15)]);
    g.add(mk(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 24), black, [-0.17, 0.17, 0.455], [Math.PI / 2, 0, 0], [1, 1, 0.9]));
    g.children[g.children.length - 1].rotation.z = 0; g.children[g.children.length - 1].rotation.y = -0.33;
    const strap = group(mk(new THREE.TorusGeometry(0.49, 0.016, 6, 48), black, [0, 0, 0], [Math.PI / 2, 0, 0]));
    strap.position.y = 0.13; strap.rotation.set(0.15, 0, -0.32);
    g.add(strap);
    return g;
  },
};

// ---------------------------------------------------------------- outfits
function cape(color, emblem) {
  const geo = new THREE.PlaneGeometry(1, 1, 10, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getY(i) + 0.5; // u -0.5..0.5, v 0 (bottom)..1 (top)
    // Drape over the back of the ball, from the shoulders (lat 22) down past the middle (lat -62).
    const lat = THREE.MathUtils.degToRad(-62 + v * 84);
    const a = u * (1.9 + (1 - v) * 0.6);
    const r = 0.52 + (1 - v) * 0.07;
    pos.setXYZ(i, -Math.sin(a) * r * Math.cos(lat), r * Math.sin(lat) - 0.18, -Math.cos(a) * r * Math.cos(lat));
  }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, M(color, { side: THREE.DoubleSide, roughness: 0.7 }));
  const pivot = group(cloth); pivot.position.y = 0.18;
  const g = group(pivot);
  // A thin gold cord around the front holds the cape on.
  g.add(ringAt(0.18, 0.014, M('#ffc300', GOLD), 0.012));
  for (const s of [-1, 1]) g.add(surf(mk(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), M('#ffc300', GOLD), [0, 0, 0], [Math.PI / 2, 0, 0]), 21, s * 128, 0.508));
  if (emblem) {
    const badge = group(
      mk(new THREE.CircleGeometry(0.13, 32), M('#ffd60a', { roughness: 0.3 })),
      mk(extrude(starShape(0.09), 0.015), M('#e63946', { roughness: 0.3 }), [0, 0, 0.005]),
    );
    g.add(surf(badge, -22, 0, 0.505));
  }
  g.userData.cape = pivot;
  return g;
}
function jacket(color, shirtColor = '#ffffff') {
  const top = 1.78; // theta where the jacket starts (just under the face)
  const coat = shell(0.512, top, Math.PI - top, M(color, { roughness: 0.6 }), { phiStart: FRONT + 0.3, phiLen: Math.PI * 2 - 0.6 });
  const shirt = shell(0.508, top, 0.75, M(shirtColor, { roughness: 0.7 }), { phiStart: FRONT - 0.32, phiLen: 0.64, segW: 12 });
  const g = group(coat, shirt);
  for (const s of [-1, 1]) {
    // Lapels: little dark wedges framing the shirt.
    const lapel = mk(new THREE.ConeGeometry(0.06, 0.2, 3), M(new THREE.Color(color).multiplyScalar(0.7).getStyle()), [0, 0, 0.01], [0, 0, s * 0.25], [1, 1, 0.3]);
    g.add(surf(group(lapel), -24, s * 15, 0.513));
  }
  return g;
}
function bowtie(color) {
  const mat = M(color, { roughness: 0.4 });
  const b = group(
    mk(new THREE.ConeGeometry(0.07, 0.13, 4), mat, [-0.065, 0, 0.02], [0, 0, -Math.PI / 2], [1, 1, 0.5]),
    mk(new THREE.ConeGeometry(0.07, 0.13, 4), mat, [0.065, 0, 0.02], [0, 0, Math.PI / 2], [1, 1, 0.5]),
    mk(new THREE.SphereGeometry(0.035, 10, 8), mat, [0, 0, 0.025]),
  );
  b.scale.setScalar(1.35);
  return surf(b, -16, 0, 0.5);
}
const ringAt = (y, tube, mat, extraR = 0) => mk(new THREE.TorusGeometry(Math.sqrt(0.25 - y * y) + extraR, tube, 12, 48), mat, [0, y, 0], [Math.PI / 2, 0, 0]);

const OUTFIT_BUILDERS = {
  bowtie: () => group(bowtie('#e63946')),
  suit() {
    const g = jacket('#3d5a80');
    const red = M('#e63946', { roughness: 0.4 });
    const tie = group(
      mk(new THREE.BoxGeometry(0.06, 0.05, 0.03), red, [0, 0, 0.01]),
      mk(new THREE.BoxGeometry(0.07, 0.17, 0.02), red, [0, -0.11, 0.0], [-0.25, 0, 0]),
      mk(new THREE.BoxGeometry(0.05, 0.05, 0.02), red, [0, -0.2, -0.02], [-0.3, 0, Math.PI / 4]),
    );
    g.add(surf(tie, -15, 0, 0.51));
    for (const y of [-45, -60]) g.add(surf(mk(new THREE.SphereGeometry(0.018, 8, 6), M('#ffd60a', GOLD)), y, 22, 0.514));
    return g;
  },
  tux() {
    const g = jacket('#151020');
    g.add(bowtie('#151020'));
    g.add(surf(mk(new THREE.SphereGeometry(0.035, 10, 8), M('#e63946')), -25, 30, 0.52));
    return g;
  },
  overalls() {
    const denim = M('#3a6ea5', { roughness: 0.85 });
    const g = group(shell(0.512, 1.95, Math.PI - 1.95, denim));
    g.add(shell(0.511, 1.35, 0.62, denim, { phiStart: FRONT - 0.42, phiLen: 0.84, segW: 12 }));
    for (const s of [-1, 1]) {
      g.add(shell(0.511, 0.75, 0.62, denim, { phiStart: FRONT + s * 0.33 - 0.055, phiLen: 0.11, segW: 3 }));
      g.add(surf(mk(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 14), M('#ffd60a', GOLD), [0, 0, 0], [Math.PI / 2, 0, 0]), 13, s * 19, 0.513));
    }
    g.add(shell(0.513, 1.55, 0.25, M('#2c5784', { roughness: 0.85 }), { phiStart: FRONT - 0.17, phiLen: 0.34, segW: 6 }));
    return g;
  },
  scarf() {
    const tex = stripeTex('scarf', '#2ec4b6', '#ffd60a', 14);
    const knit = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const ring = ringAt(-0.04, 0.06, knit, 0.015);
    ring.scale.z = 0.8;
    const tailTex = canvasTex('scarf-tail', 16, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffd60a' : '#2ec4b6'; g.fillRect(0, (i / 8) * h, w, h / 8 + 1); } });
    const tailMat = new THREE.MeshStandardMaterial({ map: tailTex, roughness: 0.95 });
    const t1 = mk(new THREE.BoxGeometry(0.12, 0.3, 0.04), tailMat, [0, -0.14, 0.02], [0.05, 0, 0.12]);
    const t2 = mk(new THREE.BoxGeometry(0.11, 0.24, 0.04), tailMat, [0.07, -0.1, 0.0], [0.05, 0, -0.2]);
    const fringe = [-0.04, 0, 0.04].map((x) => mk(new THREE.BoxGeometry(0.015, 0.05, 0.015), M('#ffd60a'), [x, -0.31, 0.02]));
    t1.add(...fringe.map((f) => { f.position.y = -0.17; return f; }));
    return group(ring, surf(group(t1, t2), -14, 34, 0.53));
  },
  cape: () => cape('#e63946', false),
  hero: () => cape('#3a6ea5', true),
  floatie() {
    const tex = stripeTex('floatie', '#ff4d6d', '#ffffff', 8);
    const ring = mk(new THREE.TorusGeometry(0.5, 0.13, 16, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25 }), [0, -0.22, 0], [Math.PI / 2, 0, 0]);
    return group(ring);
  },
  tutu() {
    const g = group();
    for (const [y, r0, r1, col] of [[-0.12, 0.49, 0.78, '#ff8fab'], [-0.19, 0.46, 0.72, '#ffc2d1']]) {
      const geo = new THREE.CylinderGeometry(r0, r1, 0.12, 64, 1, true);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) continue;
        const a = Math.atan2(pos.getZ(i), pos.getX(i)), k = 1 + Math.sin(a * 18) * 0.05;
        pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); pos.setY(i, pos.getY(i) + Math.cos(a * 18) * 0.02);
      }
      geo.computeVertexNormals();
      g.add(mk(geo, M(col, { side: THREE.DoubleSide, roughness: 0.8 }), [0, y, 0]));
    }
    return g;
  },
  chain() {
    const gold = M('#ffc300', GOLD);
    const ring = ringAt(-0.17, 0.02, gold, 0.012);
    ring.rotation.x = Math.PI / 2 + 0.25; ring.position.z = 0.03;
    const medal = group(
      mk(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 28), gold, [0, 0, 0], [Math.PI / 2, 0, 0]),
      mk(extrude(starShape(0.06), 0.01), M('#fff3b0', GOLD), [0, 0, 0.012]),
    );
    return group(ring, surf(medal, -42, 0, 0.52));
  },
  lei() {
    const cols = ['#ff4d6d', '#ffd60a', '#ffffff', '#ff9f1c', '#f15bb5'];
    const g = group();
    const N = 18, y = -0.14, r = Math.sqrt(0.25 - y * y) + 0.02;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const f = mk(new THREE.IcosahedronGeometry(0.055, 1), M(cols[i % cols.length], { roughness: 0.7, flatShading: true }), [Math.sin(a) * r, y - Math.cos(a) * 0.05, Math.cos(a) * r], [a, a, 0], [1, 0.7, 1]);
      g.add(f);
    }
    return g;
  },
  sash() {
    const red = M('#e63946', { roughness: 0.6 });
    const gold = M('#ffc300', GOLD);
    const sash = group(
      mk(new THREE.CylinderGeometry(0.508, 0.508, 0.14, 64, 1, true), M('#e63946', { roughness: 0.6, side: THREE.DoubleSide })),
      mk(new THREE.TorusGeometry(0.504, 0.01, 6, 64), gold, [0, 0.07, 0], [Math.PI / 2, 0, 0]),
      mk(new THREE.TorusGeometry(0.504, 0.01, 6, 64), gold, [0, -0.07, 0], [Math.PI / 2, 0, 0]),
    );
    sash.rotation.set(0.25, 0, 0.8);
    const band = sash, edge = null;
    const rosette = group(
      mk(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), M('#ffc300', GOLD), [0, 0, 0], [Math.PI / 2, 0, 0]),
      mk(new THREE.BoxGeometry(0.05, 0.14, 0.01), red, [-0.03, -0.1, -0.01], [0, 0, 0.3]),
      mk(new THREE.BoxGeometry(0.05, 0.14, 0.01), red, [0.03, -0.1, -0.01], [0, 0, -0.3]),
    );
    return group(band, edge, surf(rosette, -28, -22, 0.53));
  },
  bandana() {
    const tex = canvasTex('bandana', 256, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#d62839'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2, h); g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      for (let i = 0; i < 30; i++) { const x = Math.random() * w, y = Math.random() * h * 0.9; if (Math.abs(x - w / 2) < (1 - y / h) * w / 2 - 6) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
    });
    const patch = shell(0.513, 1.62, 0.85, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), { phiStart: FRONT - 0.85, phiLen: 1.7, segW: 20, segH: 10 });
    // SphereGeometry maps u left->right and v top->bottom over the slice, so the triangle points down.
    const band = ringAt(-0.1, 0.022, M('#d62839', { roughness: 0.8 }), 0.005);
    return group(patch, band);
  },
  backpack() {
    const orange = M('#ff9f1c', { roughness: 0.6 });
    const bag = mk(new THREE.BoxGeometry(0.46, 0.5, 0.24, 2, 2, 2), orange, [0, -0.03, -0.5]);
    const pocket = mk(new THREE.BoxGeometry(0.32, 0.2, 0.06), M('#e07b00', { roughness: 0.6 }), [0, -0.12, -0.63]);
    const flap = mk(new THREE.CylinderGeometry(0.12, 0.12, 0.46, 16, 1, false, 0, Math.PI), orange, [0, 0.22, -0.5], [0, 0, Math.PI / 2]);
    const g = group(bag, pocket, flap);
    for (const s of [-1, 1]) g.add(mk(new THREE.TorusGeometry(0.47, 0.022, 6, 32, Math.PI * 1.1), M('#7a4100'), [s * 0.17, 0, 0], [0, Math.PI / 2, -0.5]));
    return g;
  },
};

// ---------------------------------------------------------------- public
const finish = (g) => { g?.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };
export const buildHat = (id) => (HAT_BUILDERS[id] ? finish(HAT_BUILDERS[id]()) : null);
export const buildEyes = (id, color) => finish((EYE_BUILDERS[id] || EYE_BUILDERS.googly)(color));
export const buildOutfit = (id) => (OUTFIT_BUILDERS[id] ? finish(OUTFIT_BUILDERS[id]()) : null);
export const HAT_LINE = 0.41;
