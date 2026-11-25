// Building blocks for track-style levels (Ball Race, Mini Golf): sloped road pieces, walls,
// boost/jump pads, spinning sweepers, bumpers, sliding pushers, arches and flags.
// Everything is added to ctx.level, so it's cleaned up automatically when the round ends.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

const speckle = (g, w, h, n, a) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
};
const canvasTex = (w, h, paint) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

/** Road surface: base color, darker edge bands, dashed middle line. v runs along the road. */
export function roadTexture(base = '#ffd166', edge = '#ff8fab', line = '#ffffff') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, h / 2); // soft alternating bands
    g.fillStyle = edge; g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(22, 0, 5, h); g.fillRect(w - 27, 0, 5, h);
    g.fillStyle = line; g.fillRect(w / 2 - 5, h * 0.15, 10, h * 0.35);
    speckle(g, w, h, 1500, 0.05);
  });
}

/** Mowed-grass putting green with stripes. */
export function feltTexture(a = '#5ccf6f', b = '#4fbf62') {
  return canvasTex(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(0, (i * h) / 8, w, h / 8 + 1); }
    speckle(g, w, h, 3000, 0.06);
  });
}

/** Checkerboard (finish lines, flags). */
export function checkerTexture(n = 8, a = '#ffffff', b = '#222233') {
  return canvasTex(128, 128, (g, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
  });
}

/** Glowing chevrons for boost pads (scroll .offset.y to animate). */
export function chevronTexture(color = '#4cc9f0') {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = 'rgba(20,30,60,0.85)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      const y = 40 + k * 128;
      g.beginPath(); g.moveTo(22, y + 50); g.lineTo(w / 2, y); g.lineTo(w - 22, y + 50); g.stroke();
    }
  });
}

/**
 * A frame for a straight piece from A to B (top-surface points). Gives
 * forward f, right r, up u, length L, and toLocal(p) -> {s (along), x (sideways), h (height)}.
 */
export function frame(A, B) {
  const a = new THREE.Vector3(...A), b = new THREE.Vector3(...B);
  const f = b.clone().sub(a); const L = f.length(); f.normalize();
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(r, u, f.clone().negate()));
  return {
    a, b, f, r, u, L, q,
    at(s, x = 0, h = 0) { return a.clone().addScaledVector(f, s).addScaledVector(r, x).addScaledVector(u, h); },
    toLocal(p) { const d = new THREE.Vector3(p.x - a.x, p.y - a.y, p.z - a.z); return { s: d.dot(f), x: d.dot(r), h: d.dot(u) }; },
  };
}

const cq = (q) => new CANNON.Quaternion(q.x, q.y, q.z, q.w);

/** Static box oriented by quaternion q, centered at c (THREE vectors). */
export function orientedBox(ctx, size, c, q, mats, { material, cast = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mats);
  mesh.position.copy(c); mesh.quaternion.copy(q);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: material || ctx.engine.mat.ground });
  body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.position.set(c.x, c.y, c.z); body.quaternion.copy(cq(q));
  ctx.level.add(mesh, body);
  return { mesh, body };
}

/**
 * A road piece from A to B with the given width. Returns the frame plus { mesh, body }.
 * opts: { thick, top (material), side (material), walls: {h, mat} | false, material }
 */
export function road(ctx, A, B, width, opts = {}) {
  const F = frame(A, B);
  const thick = opts.thick ?? 0.8;
  const top = opts.top.clone();
  if (top.map) { top.map = top.map.clone(); top.map.repeat.set(1, F.L / width); top.map.needsUpdate = true; }
  const mats = [opts.side, opts.side, top, opts.side, opts.side, opts.side];
  const c = F.at(F.L / 2, 0, -thick / 2);
  const piece = orientedBox(ctx, [width, thick, F.L + 0.02], c, F.q, mats, { material: opts.material, cast: false });
  if (opts.walls) {
    const wh = opts.walls.h ?? 0.7;
    for (const side of [-1, 1]) {
      if (opts.walls.only && opts.walls.only !== side) continue;
      orientedBox(ctx, [0.3, wh + thick, F.L + 0.02], F.at(F.L / 2, side * (width / 2 + 0.15), (wh - thick) / 2), F.q, opts.walls.mat,
        { material: opts.walls.material });
    }
  }
  return { ...F, ...piece, width };
}

/** Round piece that fills the gap where two road pieces meet at an angle, plus posts on the outer corner. */
export function joint(ctx, P, width, inF, outF, opts = {}) {
  const thick = opts.thick ?? 0.8, R = width / 2;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, thick, 40), [opts.side, opts.top, opts.side]);
  mesh.position.set(P[0], P[1] - thick / 2, P[2]); mesh.receiveShadow = true;
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: opts.material || ctx.engine.mat.ground });
  body.addShape(new CANNON.Cylinder(R, R, thick, 20));
  body.position.set(P[0], P[1] - thick / 2, P[2]);
  ctx.level.add(mesh, body);
  if (!opts.walls) return;
  // Posts around the outside of the bend keep balls from flying off the corner.
  const wh = opts.walls.h ?? 0.7, N = 18, PR = R + 0.15;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const q = new THREE.Vector3(Math.cos(a) * PR, 0, Math.sin(a) * PR);
    const fi = new THREE.Vector3(inF.x, 0, inF.z).normalize(), fo = new THREE.Vector3(outF.x, 0, outF.z).normalize();
    if (q.dot(fi) < -0.1 || q.dot(fo) > 0.1) continue; // that's where the road is
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, wh + 0.2, 10), opts.walls.mat);
    m.position.set(P[0] + q.x, P[1] + wh / 2 - 0.1, P[2] + q.z); m.castShadow = true;
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: opts.walls.material || ctx.engine.mat.ground });
    b.addShape(new CANNON.Cylinder(0.2, 0.2, wh + 0.2, 8));
    b.position.set(m.position.x, m.position.y, m.position.z);
    ctx.level.add(m, b);
  }
}

/** Flat decal lying on a piece (pads, finish line). */
export function decal(ctx, F, s, x, w, l, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.position.copy(F.at(s, x, 0.03));
  m.quaternion.copy(F.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
  ctx.level.add(m);
  return m;
}

/**
 * Spinning bar around a post at point c (THREE.Vector3). len = arm length from center.
 * Returns { body, mesh, update() } — call update in frame() to sync the mesh.
 */
export function sweeper(ctx, c, len, speed, { color = '#ff4d6d', post = '#ffd60a', both = true, bounce = 7, y = 0.45 } = {}) {
  const g = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: post, roughness: 0.35 });
  const am = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
  const postM = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 1.2, 20), pm); postM.position.y = 0.6; postM.castShadow = true;
  g.add(postM);
  const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ctx.engine.mat.bouncy });
  body.addShape(new CANNON.Cylinder(0.5, 0.5, 1.2, 12), new CANNON.Vec3(0, 0.6, 0));
  for (const side of both ? [-1, 1] : [1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 12), am);
    arm.rotation.z = Math.PI / 2; arm.position.set(side * len / 2, y, 0); arm.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), pm); tip.position.set(side * len, y, 0);
    g.add(arm, tip);
    body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 0.22, 0.22)), new CANNON.Vec3(side * len / 2, y, 0));
  }
  body.position.set(c.x, c.y, c.z);
  body.bounce = bounce;
  body.angularVelocity.set(0, speed, 0);
  ctx.level.add(g, body);
  return { body, mesh: g, update() { g.position.copy(body.position); g.quaternion.copy(body.quaternion); } };
}

/** Pinball bumper (static) at c. */
export function bumper(ctx, c, { r = 0.75, color = '#ff4d6d', bounce = 6, material } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, emissive: '#000000' });
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 1, 24), mat); m.position.y = 0.5; m.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }));
  cap.position.y = 1;
  g.add(m, cap); g.position.copy(c);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: material || ctx.engine.mat.bouncy });
  body.addShape(new CANNON.Cylinder(r * 1.1, r * 1.1, 1, 16));
  body.position.set(c.x, c.y + 0.5, c.z);
  if (bounce) body.bounce = bounce;
  ctx.level.add(g, body);
  const B = { body, mesh: g, mat, glow: 0, hit() { B.glow = 1; }, update(dt) { B.glow = Math.max(0, B.glow - dt * 3); mat.emissive.setRGB(B.glow, B.glow * 0.8, B.glow * 0.3); g.scale.setScalar(1 + B.glow * 0.15); } };
  body.onBump = () => B.hit();
  return B;
}

/**
 * A block that slides back and forth (kinematic, so it shoves balls).
 * from/to: THREE.Vector3 centers. period: seconds for a full trip.
 */
export function pusher(ctx, from, to, size, period, { color = '#9b5de5', phase = 0, bounce = 4 } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
  mesh.castShadow = true;
  const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ctx.engine.mat.bouncy });
  body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.bounce = bounce;
  ctx.level.add(mesh, body);
  const mid = from.clone().add(to).multiplyScalar(0.5), half = to.clone().sub(from).multiplyScalar(0.5);
  const w = (Math.PI * 2) / period;
  const P = {
    body, mesh,
    step(t) { // call every fixed step with game time
      const k = Math.sin(t * w + phase), dk = Math.cos(t * w + phase) * w;
      body.position.set(mid.x + half.x * k, mid.y + half.y * k, mid.z + half.z * k);
      body.velocity.set(half.x * dk, half.y * dk, half.z * dk);
    },
    update() { mesh.position.copy(body.position); },
  };
  P.step(0);
  return P;
}

/** Start/finish arch with a checkered banner, standing across a piece at distance s. */
export function arch(ctx, F, s, width, { color = '#ff4d6d', text = null } = {}) {
  const g = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 12), pm);
    post.position.set(side * (width / 2 + 0.45), 1.8, 0); post.castShadow = true;
    g.add(post);
  }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.8, 0.15),
    [pm, pm, pm, pm, new THREE.MeshStandardMaterial({ map: text ? textTexture(text) : checkerTexture(10), roughness: 0.5 }), new THREE.MeshStandardMaterial({ map: text ? textTexture(text) : checkerTexture(10) })]);
  banner.position.y = 3.6; banner.castShadow = true;
  g.add(banner);
  g.position.copy(F.at(s));
  g.quaternion.setFromAxisAngle(UP, Math.atan2(-F.f.x, -F.f.z));
  ctx.level.add(g);
  return g;
}

function textTexture(text) {
  return canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2d42'; g.font = '900 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Little waving flag on a pole at c (for golf cups). Returns { update(t) }. */
export function flag(ctx, c, color = '#ff4d6d') {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  pole.position.y = 1.2; pole.castShadow = true;
  const geo = new THREE.PlaneGeometry(0.9, 0.55, 8, 2);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }));
  cloth.position.set(0.47, 2.1, 0); cloth.castShadow = true;
  g.add(pole, cloth); g.position.copy(c);
  ctx.level.add(g);
  const base = geo.attributes.position.array.slice();
  return {
    group: g,
    update(t) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) p[i + 2] = Math.sin(t * 6 + base[i] * 5) * 0.08 * (base[i] + 0.45);
      geo.attributes.position.needsUpdate = true;
    },
  };
}
