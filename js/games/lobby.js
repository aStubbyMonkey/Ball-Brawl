// The lobby is just a mini-game that never ends: roll around and bonk while people join.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeDisc, sync } from './helpers.js';

export default {
  id: 'lobby',
  name: 'Lobby',
  hidden: true, // not shown in the game picker
  actionLabel: 'BOOST!',
  howTo: 'Roll around while everyone joins!',

  create(ctx) {
    const R = 11;
    ctx.engine.setCamera({ pos: [0, 17, 17], look: [0, 0, 1] });
    makeDisc(ctx, R, { colors: ['#c7f9cc', '#80ed99'] });

    // Bumper rim so nobody falls out of the lobby.
    const rimMat = new THREE.MeshStandardMaterial({ color: '#ff6b9d', roughness: 0.4 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.3, 0.45, 12, 64), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.3; rim.castShadow = true;
    ctx.level.add(rim);
    const rimBody = new CANNON.Body({ type: CANNON.Body.STATIC, material: ctx.engine.mat.bouncy });
    const N = 36;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const q = new CANNON.Quaternion(); q.setFromEuler(0, -a, 0);
      rimBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 1, (Math.PI * (R + 0.5)) / N + 0.1)),
        new CANNON.Vec3(Math.cos(a) * (R + 0.5), 0.5, Math.sin(a) * (R + 0.5)), q);
    }
    ctx.level.addBody(rimBody);

    // A big squishy beach ball to push around.
    const beachGeo = new THREE.SphereGeometry(1.3, 32, 20);
    const beach = new THREE.Mesh(beachGeo, new THREE.MeshStandardMaterial({ map: beachTexture(), roughness: 0.4 }));
    beach.castShadow = true;
    const beachBody = new CANNON.Body({ mass: 0.4, shape: new CANNON.Sphere(1.3), material: ctx.engine.mat.ball, linearDamping: 0.3, angularDamping: 0.3 });
    beachBody.position.set(0, 3, -2);
    ctx.level.add(beach, beachBody);

    const drop = (p) => {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6;
      ctx.spawn(p, [Math.cos(a) * r, 4 + Math.random() * 2, Math.sin(a) * r]);
    };
    ctx.players.forEach(drop);

    return {
      onPlayerJoin(p) { drop(p); ctx.audio.join(); },
      onAction(p) { if (p.ball.dash(ctx.input(p).x, ctx.input(p).y)) ctx.audio.whoosh(); },
      update() {
        for (const p of ctx.players) if (p.ball.active && p.ball.position.y < -6) { drop(p); ctx.fx.poof(p.ball.position); }
        if (beachBody.position.y < -6) { beachBody.position.set(0, 5, 0); beachBody.velocity.setZero(); }
      },
      frame() { sync(beach, beachBody); },
    };
  },
};

function beachTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#ff4d6d', '#ffffff', '#4cc9f0', '#ffffff', '#ffd60a', '#ffffff'];
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * 512) / cols.length, 0, 512 / cols.length + 1, 256); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
