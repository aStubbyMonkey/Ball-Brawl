// Reusable level-building bits for mini-games. Grab what you need, ignore the rest.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/** Bubbling lava sea. Returns { update(dt), y }. */
export function makeLava(ctx, y = -3) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5400'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, yy = Math.random() * 256, r = 6 + Math.random() * 26;
    const grd = g.createRadialGradient(x, yy, 0, x, yy, r);
    grd.addColorStop(0, Math.random() < 0.5 ? '#ffd000' : '#ff9e00');
    grd.addColorStop(1, 'rgba(255,84,0,0)');
    g.fillStyle = grd;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      g.save(); g.translate(dx, dy); g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff5a00, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  ctx.level.add(mesh);
  let t = 0, bubbleT = 0;
  return {
    y,
    update(dt) {
      t += dt;
      tex.offset.set(Math.sin(t * 0.1) * 0.3, t * 0.02);
      mat.emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.15;
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 0.15;
        const a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 14;
        ctx.fx.burst({ x: Math.cos(a) * r, y: y + 0.1, z: Math.sin(a) * r }, '#ffb000', { count: 3, speed: 0.6, up: 2.5, size: 0.12, life: 0.7 });
      }
    },
  };
}

/** Colorful round platform with top at y=0. Returns { mesh, body }. */
export function makeDisc(ctx, radius, { thickness = 1, colors = ['#ffe8a3', '#ffd166'], material } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rings = 8;
  for (let i = rings; i > 0; i--) {
    g.fillStyle = colors[i % colors.length];
    g.beginPath(); g.arc(256, 256, (i / rings) * 256, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const side = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, thickness, 64), [side, top, side]);
  mesh.position.y = -thickness / 2;
  mesh.receiveShadow = true;
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: material || ctx.engine.mat.ground });
  body.addShape(new CANNON.Cylinder(radius, radius, thickness, 32));
  body.position.set(0, -thickness / 2, 0);
  ctx.level.add(mesh, body);
  return { mesh, body };
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

export const sync = (mesh, body) => {
  mesh.position.set(body.position.x, body.position.y, body.position.z);
  mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
};
