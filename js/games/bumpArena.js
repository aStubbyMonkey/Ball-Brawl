// BUMP ARENA: knock other balls off the platform into the lava. You respawn,
// and whoever bumped you last scores a point. Most knockouts wins.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeDisc, makeLava, ringSpawns, rankGroups, sync } from './helpers.js';

const DURATION = 60;
const RADIUS = 9;
const CREDIT_WINDOW = 4; // seconds a bump counts for a knockout

export default {
  id: 'bump-arena',
  name: 'Bump Arena',
  emoji: '💥',
  tagline: 'Bump other balls into the lava!',
  howTo: 'Tilt to roll. Tap BOOST to dash. Knock others into the lava. Every knockout is a point!',
  actionLabel: 'BOOST!',
  minPlayers: 1,

  create(ctx) {
    ctx.engine.setCamera({ pos: [0, 19, 15], look: [0, -1, 0.5] });
    const lava = makeLava(ctx, -3.5);
    makeDisc(ctx, RADIUS, { colors: ['#ffe8a3', '#ffb3c6'] });

    // Spinning bumper in the middle, a kinematic body, so physics shoves balls around.
    const spinner = new THREE.Group();
    const hubMat = new THREE.MeshStandardMaterial({ color: '#9b5de5', roughness: 0.3 });
    const armMat = new THREE.MeshStandardMaterial({ color: '#4cc9f0', roughness: 0.3 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1, 24), hubMat);
    hub.position.y = 0.5; hub.castShadow = true;
    spinner.add(hub);
    const spinBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: ctx.engine.mat.bouncy });
    spinBody.addShape(new CANNON.Cylinder(0.9, 0.9, 1, 16), new CANNON.Vec3(0, 0.5, 0));
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.45, 0.45), armMat);
      arm.position.set(s * 2.2, 0.35, 0); arm.castShadow = true;
      spinner.add(arm);
      spinBody.addShape(new CANNON.Box(new CANNON.Vec3(1.6, 0.225, 0.225)), new CANNON.Vec3(s * 2.2, 0.35, 0));
    }
    ctx.level.add(spinner, spinBody);

    const spawns = ringSpawns(ctx.players.length, RADIUS * 0.62);
    ctx.players.forEach((p, i) => {
      p.ball.data = { kos: 0, falls: 0, lastHitBy: null, lastHitAt: -99, respawnAt: null };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    let timeLeft = DURATION;
    let running = false;
    const scores = () => ctx.setScores(ctx.players.map((p) => ({ player: p, value: p.ball.data.kos })));
    scores();
    ctx.setTimer(timeLeft);

    function randomSafeSpot() {
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * (RADIUS - 5.5);
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (ctx.players.every((o) => !o.ball.active || Math.hypot(o.ball.position.x - x, o.ball.position.z - z) > 1.5)) return [x, 5, z];
      }
      return [0, 6, RADIUS * 0.6];
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

      update(dt) {
        // Spinner speeds up over the round.
        const progress = 1 - timeLeft / DURATION;
        spinBody.angularVelocity.set(0, 0.6 + progress * 1.6, 0);

        for (const p of ctx.players) {
          const b = p.ball, d = b.data;
          if (b.active && b.position.y < lava.y + 0.5) fell(p);
          if (!b.active && d.respawnAt !== null && ctx.engine.time >= d.respawnAt) {
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
      },

      onPlayerLeave() { scores(); },
    };
  },
};
