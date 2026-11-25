// Reusable level-building bits for mini-games. Grab what you need, ignore the rest.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export { makeLava } from './lava.js';

const ANISO = 8;
const noiseSpeckle = (g, w, h, n, alpha) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 0.8})`;
    const s = 1 + Math.random() * 2.5;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
};

/** Colorful round platform with top at y=0. Returns { mesh, body }. */
export function makeDisc(ctx, radius, { thickness = 1, colors = ['#ffe8a3', '#ffd166'], material, rim = '#ffffff' } = {}) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rings = Math.max(6, Math.round(radius * 0.7));
  for (let i = rings; i > 0; i--) {
    const r = (i / rings) * (S / 2);
    g.fillStyle = colors[i % colors.length];
    g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2); g.fill();
    // Soft inner shadow line on every ring edge = a little depth.
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 6;
    g.beginPath(); g.arc(S / 2, S / 2, r - 3, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(S / 2, S / 2, r - 9, 0, Math.PI * 2); g.stroke();
  }
  // A cheerful star in the middle.
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = (i % 2 ? 0.45 : 1) * S * 0.045; g.lineTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr); }
  g.fill();
  noiseSpeckle(g, S, S, 9000, 0.035);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISO;
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  const side = new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.95 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, thickness, 96), [side, top, side]);
  mesh.position.y = -thickness / 2;
  mesh.receiveShadow = true;
  ctx.level.add(mesh);
  // Rounded lip around the edge.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius - 0.08, 0.12, 10, 128), new THREE.MeshStandardMaterial({ color: rim, roughness: 0.4 }));
  lip.rotation.x = Math.PI / 2; lip.position.y = -0.04; lip.receiveShadow = true;
  ctx.level.add(lip);
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: material || ctx.engine.mat.ground });
  body.addShape(new CANNON.Cylinder(radius, radius, thickness, 32));
  body.position.set(0, -thickness / 2, 0);
  ctx.level.add(null, body);
  return { mesh, body };
}

let _rock = null;
/** Layered-rock texture for platform sides (shared). */
export function rockTexture() {
  if (_rock) return _rock;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  const bands = ['#8d6e63', '#7b5e55', '#a1887f', '#6d4c41', '#8d6e63'];
  let y = 0;
  while (y < 128) { const h = 10 + Math.random() * 22; g.fillStyle = bands[Math.floor(Math.random() * bands.length)]; g.fillRect(0, y, 512, h + 1); y += h; }
  noiseSpeckle(g, 512, 128, 2500, 0.08);
  _rock = new THREE.CanvasTexture(c);
  _rock.colorSpace = THREE.SRGBColorSpace; _rock.wrapS = THREE.RepeatWrapping; _rock.repeat.set(6, 1);
  _rock.userData.shared = true;
  return _rock;
}

let _tileTex = null;
/** Soft bevel + grain texture for tiles; tinted by each tile's material color (shared). */
export function tileTexture() {
  if (_tileTex) return _tileTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.16)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 8; g.strokeRect(14, 14, S - 28, S - 28);
  g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 4; g.strokeRect(24, 24, S - 48, S - 48);
  noiseSpeckle(g, S, S, 1800, 0.05);
  _tileTex = new THREE.CanvasTexture(c);
  _tileTex.colorSpace = THREE.SRGBColorSpace; _tileTex.anisotropy = ANISO;
  _tileTex.userData.shared = true;
  return _tileTex;
}

/** Rounded tile geometry (shared within a level). */
export function tileGeometry(size, height) {
  return new RoundedBoxGeometry(size, height, size, 3, Math.min(0.14, height * 0.3));
}

/** Static box helper (mesh + body). pos = center. */
export function makeBox(ctx, size, pos, { color = '#7bd389', material, castShadow = true, mass = 0 } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  mesh.position.set(...pos);
  mesh.castShadow = castShadow; mesh.receiveShadow = true;
  const body = new CANNON.Body({ mass, type: mass ? CANNON.Body.DYNAMIC : CANNON.Body.STATIC, material: material || ctx.engine.mat.ground });
  body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
  body.position.set(...pos);
  ctx.level.add(mesh, body);
  return { mesh, body };
}

/** n evenly spaced spawn points on a circle, facing the center. */
export function ringSpawns(n, radius, y = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2 + Math.PI / 2;
    out.push({ pos: [Math.cos(a) * radius, y, Math.sin(a) * radius], yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
  }
  return out;
}

/** Sort players by score (desc) into tie groups: [[best...], [next...], ...] */
export function rankGroups(players, scoreOf) {
  const sorted = [...players].sort((a, b) => scoreOf(b) - scoreOf(a));
  const groups = [];
  let last = null;
  for (const p of sorted) {
    const s = scoreOf(p);
    if (last !== null && s === last) groups[groups.length - 1].push(p);
    else groups.push([p]);
    last = s;
  }
  return groups;
}

/** Copy a physics body's pose onto a mesh. Pass ctx.engine to get smooth interpolation. */
export const sync = (mesh, body, engine) => {
  if (engine) { engine.lerpPos(body, mesh.position); engine.lerpQuat(body, mesh.quaternion); return; }
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
};
