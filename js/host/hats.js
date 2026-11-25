// 3D hat builders. Add a new hat: add an entry in shared/cosmetics.js HATS and a builder here.
import * as THREE from 'three';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...extra });
const shadow = (m) => { m.castShadow = true; return m; };

const builders = {
  party() {
    const g = new THREE.Group();
    const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 20), std(0xff4fa3)));
    cone.position.y = 0.2;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), std(0xffe066));
    pom.position.y = 0.47;
    g.add(cone, pom);
    g.rotation.z = 0.2;
    return g;
  },
  tophat() {
    const g = new THREE.Group();
    const brim = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 24), std(0x222222)));
    const top = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 24), std(0x222222)));
    top.position.y = 0.2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.07, 24), std(0xe63946));
    band.position.y = 0.06;
    g.add(brim, top, band);
    return g;
  },
  crown() {
    const g = new THREE.Group();
    const gold = std(0xffc300, { metalness: 0.7, roughness: 0.25 });
    const ring = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 20, 1, true), gold));
    ring.material.side = THREE.DoubleSide;
    ring.position.y = 0.06;
    g.add(ring);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), gold);
      spike.position.set(Math.sin(a) * 0.23, 0.2, Math.cos(a) * 0.23);
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std(0xff006e));
      gem.position.set(Math.sin(a) * 0.255, 0.07, Math.cos(a) * 0.255);
      g.add(spike, gem);
    }
    return g;
  },
  propeller() {
    const g = new THREE.Group();
    const cap = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x4cc9f0)));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16), std(0x333333));
    stem.position.y = 0.32;
    const spin = new THREE.Group();
    spin.position.y = 0.4;
    for (const [c, r] of [[0xff4d6d, 0], [0xffd60a, Math.PI]]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, 0.08), std(c));
      blade.position.x = 0.17; const p = new THREE.Group(); p.rotation.y = r; p.add(blade); spin.add(p);
    }
    g.add(cap, stem, spin);
    g.userData.spin = spin;
    return g;
  },
  bow() {
    const g = new THREE.Group();
    const m = std(0xff5fa2);
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), m);
    l.rotation.z = Math.PI / 2; l.position.x = -0.11;
    const r = l.clone(); r.rotation.z = -Math.PI / 2; r.position.x = 0.11;
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), m);
    g.add(l, r, knot);
    g.position.z = -0.1;
    g.rotation.x = -0.3;
    const wrap = new THREE.Group(); wrap.add(g);
    return wrap;
  },
};

export function buildHat(id) {
  const b = builders[id];
  return b ? b() : null;
}
