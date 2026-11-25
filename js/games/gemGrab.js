// GEM GRAB: roll over gems to collect them. Gems keep popping back up, and there are more of
// them the more players there are. A big golden star is worth 5! Ram someone hard and they
// spill a couple of their gems. Most gems when time runs out wins.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeDisc, ringSpawns, rankGroups } from './helpers.js';
import { bumper } from './course.js';

const DURATION = 60;
const STAR_EVERY = 14;
const GEM_COLORS = ['#ff4d6d', '#4cc9f0', '#7bd389', '#ffd60a', '#c77dff', '#ff9f1c'];
const GEM_GEO = new THREE.OctahedronGeometry(0.42, 0); GEM_GEO.userData.shared = true;
const STAR_GEO = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.38 : 0.85; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 });
  g.center(); g.userData.shared = true; return g;
})();

export default {
  id: 'gem-grab',
  name: 'Gem Grab',
  emoji: '💎',
  theme: 'meadow',
  tagline: 'Grab the most gems! Bonk others to make them spill.',
  howTo: 'Tilt to roll over gems. Gold stars are worth 5! Ram into someone fast and they spill gems. Most gems wins!',
  actionLabel: null,
  minPlayers: 1,

  create(ctx) {
    const n = ctx.players.length;
    const R = Math.min(15, 10.5 + Math.max(0, n - 3) * 0.55);
    const s = R / 10;
    ctx.engine.setCamera({ pos: [0, 20 * s, 16 * s], look: [0, -0.5, 0.8 * s] });
    makeDisc(ctx, R, { colors: ['#caffbf', '#a0e7a0'], rim: '#ffd60a' });

    // A low fence all the way round: nobody falls off in this one, it's all about grabbing.
    const fenceMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const SEG = 48;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const len = (2 * Math.PI * R) / SEG + 0.05;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.8, 0.3), i % 2 ? fenceMat : new THREE.MeshStandardMaterial({ color: '#ff8fab', roughness: 0.4 }));
      mesh.position.set(Math.cos(a) * (R + 0.1), 0.4, Math.sin(a) * (R + 0.1));
      mesh.rotation.y = -a + Math.PI / 2; mesh.castShadow = true;
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: ctx.engine.mat.bouncy });
      body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, 0.6, 0.15)));
      body.position.set(mesh.position.x, 0.6, mesh.position.z);
      body.quaternion.setFromEuler(0, mesh.rotation.y, 0);
      ctx.level.add(mesh, body);
    }
    // A few bumpers to bounce around.
    const bumpers = [];
    const BN = n > 6 ? 5 : 3;
    for (let i = 0; i < BN; i++) {
      const a = (i / BN) * Math.PI * 2 + 0.4;
      bumpers.push(bumper(ctx, new THREE.Vector3(Math.cos(a) * R * 0.5, 0, Math.sin(a) * R * 0.5), { color: ['#4cc9f0', '#c77dff', '#ff9f1c'][i % 3], bounce: 5 }));
    }

    const spawns = ringSpawns(n, Math.min(R * 0.7, 3 + n * 0.5));
    ctx.players.forEach((p, i) => {
      p.ball.data = { gems: 0 };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    // ---- gems
    const TARGET = Math.min(40, 6 + n * 3); // how many gems are out at once
    const gems = [];
    const freeSpot = () => {
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (R - 1.2);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (bumpers.some((b) => Math.hypot(b.body.position.x - x, b.body.position.z - z) < 1.6)) continue;
        if (gems.some((g) => g.alive && Math.hypot(g.pos.x - x, g.pos.z - z) < 1.1)) continue;
        return new THREE.Vector3(x, 0, z);
      }
      return new THREE.Vector3((Math.random() - 0.5) * R, 0, (Math.random() - 0.5) * R);
    };
    const gemMats = GEM_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.2, flatShading: true }));
    const starMat = new THREE.MeshStandardMaterial({ color: '#ffd60a', emissive: '#ffb000', emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.4 });
    const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false });
    const shadowGeo = new THREE.CircleGeometry(0.4, 20);

    function addGem(pos, { star = false, vel = null } = {}) {
      const mesh = new THREE.Mesh(star ? STAR_GEO : GEM_GEO, star ? starMat : gemMats[Math.floor(Math.random() * gemMats.length)]);
      mesh.castShadow = true;
      const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.scale.setScalar(star ? 1.8 : 1);
      ctx.level.add(mesh); ctx.level.add(sh);
      const g = { mesh, sh, pos: pos.clone(), vel: vel ? vel.clone() : null, star, alive: true, t: 0, ph: Math.random() * 6, arm: vel ? 0.5 : 0, value: star ? 5 : 1 };
      if (!vel) g.pos.y = 0;
      gems.push(g);
      return g;
    }
    for (let i = 0; i < TARGET; i++) addGem(freeSpot());

    let timeLeft = DURATION, running = false, starT = STAR_EVERY * 0.6, refill = 0, done = false;
    const scores = () => ctx.setScores(ctx.players.map((p) => ({ player: p, value: `💎${p.ball.data.gems}` })));
    scores();
    ctx.setTimer(timeLeft);

    function collect(p, g) {
      g.alive = false;
      ctx.level.group.remove(g.mesh); ctx.level.group.remove(g.sh);
      p.ball.data.gems += g.value;
      const at = g.mesh.position;
      ctx.fx.burst(at, g.star ? '#ffd60a' : '#ffffff', { count: g.star ? 20 : 8, speed: 3, up: 3, size: 0.09, life: 0.5 });
      ctx.fx.popText(at, g.star ? '+5!' : '+1', g.star ? '#ffd60a' : '#ffffff', g.star ? 1.3 : 0.7);
      ctx.audio.pickup();
      ctx.feel(p, 'collect');
      p.ball.poke(0.2);
      scores();
    }

    function spill(p, count, dir) {
      const d = p.ball.data;
      count = Math.min(count, d.gems);
      if (!count) return;
      d.gems -= count;
      for (let i = 0; i < count; i++) {
        const a = Math.atan2(dir.z, dir.x) + (Math.random() - 0.5) * 2;
        const v = new THREE.Vector3(Math.cos(a) * (3 + Math.random() * 3), 6 + Math.random() * 3, Math.sin(a) * (3 + Math.random() * 3));
        addGem(new THREE.Vector3(p.ball.position.x, 1, p.ball.position.z), { vel: v });
      }
      ctx.fx.popText(p.ball.position, `-${count}`, '#ff4d6d', 1);
      scores();
    }

    return {
      start() { running = true; },

      update(dt) {
        // Collect + spilled gems flying.
        for (const g of gems) {
          if (!g.alive) continue;
          if (g.vel) {
            g.vel.y -= 22 * dt;
            g.pos.addScaledVector(g.vel, dt);
            const r = Math.hypot(g.pos.x, g.pos.z);
            if (r > R - 0.8) { g.pos.x *= (R - 0.8) / r; g.pos.z *= (R - 0.8) / r; g.vel.x *= -0.5; g.vel.z *= -0.5; }
            if (g.pos.y <= 0) { g.pos.y = 0; if (Math.abs(g.vel.y) < 2) g.vel = null; else { g.vel.y *= -0.4; g.vel.x *= 0.6; g.vel.z *= 0.6; } }
          }
          g.arm = Math.max(0, g.arm - dt);
          if (g.arm > 0) continue;
          for (const p of ctx.players) {
            const b = p.ball;
            if (!b.active) continue;
            const dx = b.position.x - g.pos.x, dz = b.position.z - g.pos.z, dy = b.position.y - (g.pos.y + 0.7);
            if (dx * dx + dz * dz + dy * dy < (g.star ? 1.4 : 0.95) ** 2) { if (running) collect(p, g); break; }
          }
        }
        for (let i = gems.length - 1; i >= 0; i--) if (!gems[i].alive) gems.splice(i, 1);

        // Keep balls in if they somehow get bounced over the fence.
        for (const p of ctx.players) if (p.ball.active && p.ball.position.y < -4) { ctx.spawn(p, [0, 3, 0]); ctx.fx.poof(p.ball.position); }

        if (!running) return;
        // Gems grow back.
        refill -= dt;
        if (refill <= 0 && gems.filter((g) => !g.star).length < TARGET) {
          refill = 0.6;
          const g = addGem(freeSpot());
          g.t = -0.4; // pops in
        }
        starT -= dt;
        if (starT <= 0) {
          starT = STAR_EVERY;
          const g = addGem(freeSpot(), { star: true });
          g.t = -0.4;
          ctx.announce('⭐ Gold star!', 'Worth 5 gems', 1200);
          ctx.audio.pop();
        }
        timeLeft -= dt;
        ctx.setTimer(timeLeft);
        if (timeLeft <= 0 && !done) {
          done = true; running = false;
          ctx.end(rankGroups(ctx.players, (p) => p.ball.data.gems));
        }
      },

      frame(dt) {
        const t = ctx.engine.time;
        for (const g of gems) {
          g.t += dt;
          const pop = g.t < 0 ? 0.01 : Math.min(1, g.t * 4) * (1 + Math.sin(Math.min(1, g.t * 4) * Math.PI) * 0.4);
          g.mesh.scale.setScalar(Math.max(0.01, pop) * (g.star ? 1 : 1));
          const bob = g.vel ? 0 : 0.7 + Math.sin(t * 3 + g.ph) * 0.15;
          g.mesh.position.set(g.pos.x, g.pos.y + bob, g.pos.z);
          g.mesh.rotation.y = t * (g.star ? 2.5 : 1.8) + g.ph;
          if (g.star) g.mesh.rotation.x = 0;
          g.sh.position.set(g.pos.x, 0.02, g.pos.z);
        }
        for (const b of bumpers) b.update(dt);
      },

      onHit(a, b, impact, k) {
        if (!running || impact < 6) return;
        // Whoever got knocked harder is the one that got rammed: they spill gems.
        const victim = k.toOther > k.toBall ? b : a, hitter = victim === a ? b : a;
        if (Math.max(k.toOther, k.toBall) < 5) return;
        const dir = new THREE.Vector3(victim.position.x - hitter.position.x, 0, victim.position.z - hitter.position.z).normalize();
        spill(victim.player, impact > 10 ? 3 : 2, dir);
      },
      onBodyHit(ball, body) { body.onBump?.(); },
    };
  },
};
