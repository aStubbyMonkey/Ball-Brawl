// BUMP ARENA: knock other balls off the platform into the lava. You respawn,
// and whoever bumped you last scores a point. Most knockouts wins.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeDisc, makeLava, ringSpawns, rankGroups, sync } from './helpers.js';

const DURATION = 60;
const CREDIT_WINDOW = 4;   // seconds a bump counts for a knockout
const SPINNER_BOUNCE = 13; // launch impulse when the spinner hits you
const BUMPER_BOUNCE = 10;  // launch impulse from the pinball bumpers

export default {
  id: 'bump-arena',
  name: 'Bump Arena',
  emoji: '💥',
  tagline: 'Bump other balls into the lava!',
  howTo: 'Tilt to roll. Tap BOOST to dash. Knock others into the lava. Spinners and bumpers launch you! Every knockout is a point.',
  actionLabel: 'BOOST!',
  minPlayers: 1,

  create(ctx) {
    // Arena grows with the crowd: 12 for up to 4 players, up to 16 for a full room.
    const n = ctx.players.length;
    const RADIUS = Math.min(16, 12 + Math.max(0, n - 4) * 0.6);
    const s = RADIUS / 9;
    ctx.engine.setCamera({ pos: [0, 19 * s, 15 * s], look: [0, -1, 0.5 * s] });
    const lava = makeLava(ctx, -3.5);
    makeDisc(ctx, RADIUS, { colors: ['#ffe8a3', '#ffb3c6'] });

    // Spinning bumper in the middle, a kinematic body, so physics shoves balls around.
    const ARM = RADIUS * 0.34;
    const spinner = new THREE.Group();
    const hubMat = new THREE.MeshStandardMaterial({ color: '#9b5de5', roughness: 0.3, emissive: '#3a1a6b' });
    const armMat = new THREE.MeshStandardMaterial({ color: '#4cc9f0', roughness: 0.3, emissive: '#0b3a52' });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 24), hubMat);
    hub.position.y = 0.5; hub.castShadow = true;
    spinner.add(hub);
    const spinBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ctx.engine.mat.bouncy });
    spinBody.bounce = SPINNER_BOUNCE;
    spinBody.addShape(new CANNON.Cylinder(1.1, 1.1, 1, 16), new CANNON.Vec3(0, 0.5, 0));
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM, 0.5, 0.5), armMat);
      arm.position.set(side * (1 + ARM / 2), 0.35, 0); arm.castShadow = true;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), hubMat);
      tip.position.set(side * (1 + ARM), 0.4, 0); tip.castShadow = true;
      spinner.add(arm, tip);
      spinBody.addShape(new CANNON.Box(new CANNON.Vec3(ARM / 2, 0.25, 0.25)), new CANNON.Vec3(side * (1 + ARM / 2), 0.35, 0));
      spinBody.addShape(new CANNON.Sphere(0.45), new CANNON.Vec3(side * (1 + ARM), 0.4, 0));
    }
    ctx.level.add(spinner, spinBody);

    // Pinball bumpers that pop you away (and light up when hit).
    const bumpers = [];
    const BN = 4;
    for (let i = 0; i < BN; i++) {
      const a = (i / BN) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(a) * RADIUS * 0.62, z = Math.sin(a) * RADIUS * 0.62;
      const mat = new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.3, emissive: '#000000' });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 1.1, 24), mat);
      mesh.position.set(x, 0.55, z); mesh.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.3 }));
      cap.position.set(x, 1.1, z);
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: ctx.engine.mat.bouncy });
      body.addShape(new CANNON.Cylinder(0.85, 0.85, 1.1, 16));
      body.position.set(x, 0.55, z);
      body.bounce = BUMPER_BOUNCE;
      ctx.level.add(mesh, body);
      ctx.level.add(cap);
      bumpers.push({ body, mesh, mat, glow: 0 });
    }

    const spawns = ringSpawns(n, RADIUS * 0.45);
    ctx.players.forEach((p, i) => {
      p.ball.data = { kos: 0, falls: 0, lastHitBy: null, lastHitAt: -99, respawnAt: null };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    let timeLeft = DURATION;
    let running = false;
    const scores = () => ctx.setScores(ctx.players.map((p) => ({ player: p, value: p.ball.data.kos, out: !p.connected })));
    scores();
    ctx.setTimer(timeLeft);

    function randomSafeSpot() {
      for (let k = 0; k < 16; k++) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * (RADIUS * 0.45);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const clearOfBalls = ctx.players.every((o) => !o.ball.active || Math.hypot(o.ball.position.x - x, o.ball.position.z - z) > 1.5);
        const clearOfBumpers = bumpers.every((b) => Math.hypot(b.body.position.x - x, b.body.position.z - z) > 1.8);
        if (clearOfBalls && clearOfBumpers && r > ARM + 1.8) return [x, 5, z];
      }
      return [0, 6, RADIUS * 0.8];
    }

    function fell(p) {
      const d = p.ball.data;
      ctx.fx.splash(p.ball.position);
      ctx.audio.splash();
      ctx.engine.addShake(0.25);
      p.ball.deactivate();
      d.falls++;
      ctx.buzz(p, 300);
      const credit = d.lastHitBy && ctx.engine.time - d.lastHitAt < CREDIT_WINDOW ? d.lastHitBy : null;
      if (credit && credit !== p) {
        credit.ball.data.kos++;
        ctx.announce(`${credit.name} bonked ${p.name}!`, null, 1400);
        ctx.tell(credit, 'Knockout! +1', 'Keep bumping!');
        ctx.buzz(credit, 80);
      } else {
        ctx.announce(`${p.name} took a dip!`, null, 1200);
      }
      ctx.tell(p, 'Splash! 🔥', 'Respawning…');
      d.respawnAt = ctx.engine.time + 2;
      d.lastHitBy = null;
      scores();
    }

    return {
      start() { running = true; },

      onAction(p) {
        if (!running) return;
        const i = ctx.input(p);
        if (p.ball.dash(i.x, i.y)) ctx.audio.whoosh();
      },

      onHit(a, b) {
        const t = ctx.engine.time;
        a.data.lastHitBy = b.player; a.data.lastHitAt = t;
        b.data.lastHitBy = a.player; b.data.lastHitAt = t;
      },

      onBodyHit(ball, body) {
        const bp = bumpers.find((b) => b.body === body);
        if (bp) bp.glow = 1;
      },

      update(dt) {
        // Spinner speeds up over the round.
        const progress = 1 - timeLeft / DURATION;
        spinBody.angularVelocity.set(0, 0.7 + progress * 1.4, 0);

        for (const p of ctx.players) {
          const b = p.ball, d = b.data;
          if (b.active && b.position.y < lava.y + 0.5) fell(p);
          if (!b.active && d.respawnAt !== null && ctx.engine.time >= d.respawnAt && p.connected) {
            d.respawnAt = null;
            const spot = randomSafeSpot();
            ctx.spawn(p, spot);
            ctx.fx.poof(new THREE.Vector3(spot[0], 1, spot[2]));
            ctx.tell(p, 'Back in!', 'Get bumping!');
          }
        }

        if (!running) return;
        timeLeft -= dt;
        ctx.setTimer(timeLeft);
        if (timeLeft <= 0) {
          running = false;
          ctx.end(rankGroups(ctx.players, (p) => p.ball.data.kos * 1000 - p.ball.data.falls));
        }
      },

      frame(dt) {
        lava.update(dt);
        sync(spinner, spinBody);
        for (const b of bumpers) {
          b.glow = Math.max(0, b.glow - dt * 3);
          b.mat.emissive.setRGB(b.glow, b.glow * 0.8, b.glow * 0.3);
          const sc = 1 + b.glow * 0.25;
          b.mesh.scale.set(sc, 1, sc);
        }
      },

      onPlayerLeave(p) { p.ball.data.respawnAt = null; scores(); },
      onPlayerReturn(p) { if (!p.ball.active) p.ball.data.respawnAt = ctx.engine.time + 0.5; scores(); },
    };
  },
};
