// MINI GOLF: everybody putts at the same time on one cute little hole.
// Tilt to aim (an arrow shows where), HOLD the button to charge, LET GO to putt.
// Fewest strokes wins. Balls bump into each other, so watch out!
//
// Holes are data (HOLES below): floor rectangles, walls, ramps, the cup, and toys.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { rankGroups } from './helpers.js';
import { feltTexture, flag, bumper, pusher, frame, orientedBox } from './course.js';

const MAX_STROKES = 8;
const TIME_LIMIT = 90;
const CUP_R = 0.55;

// Floors: [x1, z1, x2, z2, y=0]. Walls: [x1, z1, x2, z2]. Ramps: {from:[x,y,z], to:[x,y,z], w}.
const HOLES = [
  {
    id: 'windmill', name: 'Windmill Hill', theme: 'meadow', par: 3,
    tee: [0, 0, 7], cup: [0, 0, -7.5],
    floors: [[-2.2, -9, 2.2, 8.5]],
    walls: [[-2.2, -9, -2.2, 8.5], [2.2, -9, 2.2, 8.5], [-2.2, -9, 2.2, -9], [-2.2, 8.5, 2.2, 8.5],
      [-2.2, -1, -0.7, -1], [0.7, -1, 2.2, -1]],
    windmill: { z: -1 },
    cam: { pos: [0, 21, 9.5], look: [0, 0, 0.3] },
  },
  {
    id: 'bumpers', name: 'Candy Corner', theme: 'candy', par: 3,
    tee: [2, 0, 6.5], cup: [-2, 0, -7.5],
    floors: [[-3.5, -1, 3.5, 8], [-3.5, -9, -0.5, -1]],
    walls: [[-3.5, -9, -3.5, 8], [-3.5, -9, -0.5, -9], [-0.5, -9, -0.5, -1], [-0.5, -1, 3.5, -1], [3.5, -1, 3.5, 8], [-3.5, 8, 3.5, 8]],
    bumpers: [[1.3, 2.4], [-1.6, 4.2], [-2, -4.5]],
    pushers: [{ from: [-3.0, -3], to: [-1, -3], period: 2.6 }],
    cam: { pos: [0, 21, 9.5], look: [0, 0, 0.3] },
  },
  {
    id: 'ramp', name: 'Sky Steps', theme: 'skytower', par: 3,
    tee: [0, 0, 7.5], cup: [0, 1.2, -7.5],
    floors: [[-2, 3, 2, 9], [-3, -9.5, 3, -2.5, 1.2]],
    ramps: [{ from: [0, 0, 3], to: [0, 1.2, -2.5], w: 4 }],
    walls: [[-2, 3, -2, 9], [2, 3, 2, 9], [-2, 9, 2, 9],
      [-3, -9.5, 3, -9.5, 1.2], [-3, -9.5, -3, -2.5, 1.2], [3, -9.5, 3, -2.5, 1.2], [-3, -2.5, -2, -2.5, 1.2], [2, -2.5, 3, -2.5, 1.2]],
    rampWalls: true,
    pushers: [{ from: [-2.2, -5, 1.2], to: [2.2, -5, 1.2], period: 3.2 }],
    cam: { pos: [0, 21, 9.5], look: [0, 0.5, 0.3] },
  },
];

export default {
  id: 'mini-golf',
  name: 'Mini Golf',
  emoji: '⛳',
  theme: 'meadow',
  tagline: 'Everyone putts at once. Fewest strokes wins!',
  howTo: 'Tilt to AIM. HOLD the button to charge, LET GO to putt. You can putt again once your ball stops. Fewest strokes wins!',
  actionLabel: 'HOLD TO PUTT',
  minPlayers: 1,
  maps: HOLES.map((h) => ({ id: h.id, name: h.name, theme: h.theme })),

  create(ctx) {
    const H = HOLES.find((h) => h.id === ctx.map) || HOLES[0];
    ctx.engine.setCamera({ pos: H.cam.pos, look: H.cam.look });

    const felt = new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.85 });
    const edge = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
    const wallMat2 = new THREE.MeshStandardMaterial({ color: '#ff8fab', roughness: 0.4 });
    const bouncy = ctx.engine.mat.bouncy;
    const I = new THREE.Quaternion();

    for (const [x1, z1, x2, z2, y = 0] of H.floors) {
      const w = x2 - x1, d = z2 - z1;
      const top = felt.clone(); top.map = felt.map.clone(); top.map.repeat.set(w / 4, d / 4); top.map.needsUpdate = true;
      orientedBox(ctx, [w, 1, d], new THREE.Vector3((x1 + x2) / 2, y - 0.5, (z1 + z2) / 2), I, [edge, edge, top, edge, edge, edge], { cast: false });
    }
    let wi = 0;
    const wall = (x1, z1, x2, z2, y = 0) => {
      const len = Math.hypot(x2 - x1, z2 - z1) + 0.3;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(z2 - z1, x2 - x1));
      // Bouncy material gives that satisfying rebound off the rails.
      orientedBox(ctx, [len, 0.6, 0.3], new THREE.Vector3((x1 + x2) / 2, y + 0.3, (z1 + z2) / 2), q, wi++ % 2 ? wallMat2 : wallMat, { material: bouncy });
    };
    for (const w of H.walls) wall(...w);
    for (const r of H.ramps || []) {
      const F = frame(r.from, r.to);
      const top = felt.clone(); top.map = felt.map.clone(); top.map.repeat.set(r.w / 4, F.L / 4); top.map.needsUpdate = true;
      orientedBox(ctx, [r.w, 0.6, F.L + 0.1], F.at(F.L / 2, 0, -0.3), F.q, [edge, edge, top, edge, edge, edge], { cast: false });
      if (H.rampWalls) for (const side of [-1, 1]) orientedBox(ctx, [0.3, 0.9, F.L + 0.3], F.at(F.L / 2, side * (r.w / 2 + 0.15), 0.15), F.q, wallMat, { material: bouncy });
    }

    // ---- the cup + flag
    const cup = new THREE.Vector3(...H.cup);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: '#1b1b2a' }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(cup.x, cup.y + 0.015, cup.z);
    const lip = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.08, 32), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    lip.rotation.x = -Math.PI / 2; lip.position.set(cup.x, cup.y + 0.016, cup.z);
    ctx.level.add(hole); ctx.level.add(lip);
    const fl = flag(ctx, cup, '#ff4d6d');
    fl.group.position.x += CUP_R * 0.3;

    // ---- tee mat
    const tee = new THREE.Vector3(...H.tee);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.9 }));
    mat.rotation.x = -Math.PI / 2; mat.position.set(tee.x, tee.y + 0.01, tee.z);
    ctx.level.add(mat);

    // ---- toys
    const bumpers = (H.bumpers || []).map(([x, z]) => bumper(ctx, new THREE.Vector3(x, 0, z), { r: 0.5, color: '#ff4d6d', bounce: 0 }));
    const pushers = (H.pushers || []).map((o) => pusher(ctx, new THREE.Vector3(o.from[0], (o.from[2] ?? 0) + 0.4, o.from[1]), new THREE.Vector3(o.to[0], (o.to[2] ?? 0) + 0.4, o.to[1]), [1, 0.8, 0.8], o.period, { color: '#9b5de5', bounce: 0 }));
    let blades = null;
    if (H.windmill) {
      const z = H.windmill.z;
      const house = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 1.6), new THREE.MeshStandardMaterial({ color: '#ffe8a3', roughness: 0.7 }));
      body.position.set(0, 1.8, z - 0.3); body.castShadow = true;
      // Triangular prism roof (a 3-sided cylinder lying sideways, point up).
      const roofGeo = new THREE.CylinderGeometry(1.15, 1.15, 4.8, 3).rotateY(Math.PI / 2).rotateZ(Math.PI / 2);
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#ff4d6d', roughness: 0.6, flatShading: true }));
      roof.position.set(0, 3.55, z - 0.3); roof.castShadow = true;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), new THREE.MeshBasicMaterial({ color: '#2b2d42' }));
      door.position.set(0, 0.9, z + 0.51);
      house.add(body, roof, door);
      ctx.level.add(house);
      // Physical sides of the house below the tunnel roof (the tunnel is the 1.4-wide gap in the walls).
      orientedBox(ctx, [1.5, 0.6, 1.6], new THREE.Vector3(-1.45, 0.3, z - 0.3), I, new THREE.MeshStandardMaterial({ color: '#ffe8a3' }));
      orientedBox(ctx, [1.5, 0.6, 1.6], new THREE.Vector3(1.45, 0.3, z - 0.3), I, new THREE.MeshStandardMaterial({ color: '#ffe8a3' }));
      // Spinning blades in front: they sweep down across the tunnel mouth.
      const g = new THREE.Group();
      const bm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
      const hubY = 2.2, bz = z + 0.95;
      const bodyB = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: bouncy });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.1, 0.12), i % 2 ? bm : new THREE.MeshStandardMaterial({ color: '#4cc9f0', roughness: 0.4 }));
        arm.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0); arm.rotation.z = -a; arm.castShadow = true;
        g.add(arm);
        const sh = new CANNON.Box(new CANNON.Vec3(0.18, 1.05, 0.3));
        bodyB.addShape(sh, new CANNON.Vec3(Math.sin(a) * 1.05, Math.cos(a) * 1.05, 0), new CANNON.Quaternion().setFromEuler(0, 0, -a));
      }
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshStandardMaterial({ color: '#ffd60a' })));
      bodyB.position.set(0, hubY, bz);
      bodyB.angularVelocity.set(0, 0, -1.4);
      ctx.level.add(g, bodyB);
      blades = { g, body: bodyB };
    }

    // ---- players
    const n = ctx.players.length;
    const aimGeo = new THREE.ConeGeometry(0.16, 0.4, 12); aimGeo.rotateX(Math.PI / 2);
    ctx.players.forEach((p, i) => {
      const row = Math.floor(i / 4), col = i % 4, cols = Math.min(4, n - row * 4);
      const pos = [tee.x + (col - (cols - 1) / 2) * 0.75, tee.y + 0.6, tee.z + row * 0.75 - 0.3];
      p.ball.tuning.maxAccel = 0;       // no tilt-rolling in golf: tilt aims instead
      p.ball.tuning.bonkBoost = 0.2;
      p.ball.body.linearDamping = 0.55; // the grass slows you down
      // Aim arrow (dots + head) in the player's color.
      const arrow = new THREE.Group();
      const am = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.9, depthTest: false });
      const dots = [];
      for (let k = 0; k < 6; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), am); arrow.add(d); dots.push(d); }
      const head = new THREE.Mesh(aimGeo, am); arrow.add(head);
      arrow.renderOrder = 5; arrow.visible = false;
      ctx.level.add(arrow);
      // Power bar above the ball.
      const bar = new THREE.Group();
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.18), new THREE.MeshBasicMaterial({ color: '#2b2d42', depthTest: false, transparent: true }));
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.11), new THREE.MeshBasicMaterial({ color: '#7bd389', depthTest: false, transparent: true }));
      fill.position.z = 0.001; back.renderOrder = 6; fill.renderOrder = 7;
      bar.add(back, fill); bar.visible = false;
      ctx.level.add(bar);
      p.ball.data = { strokes: 0, sunk: false, sunkAt: 0, aim: Math.PI, charging: false, power: 0, dir: 1, last: pos.slice(), arrow, dots, head, bar, fill, still: 0 };
      ctx.spawn(p, pos, Math.PI);
    });

    let running = false, done = false, timeLeft = TIME_LIMIT, elapsed = 0;
    const scoreTxt = (d) => (d.sunk ? `⛳ ${d.strokes}` : `${d.strokes}`);
    const hud = () => ctx.setScores(ctx.players.map((p) => ({ player: p, value: scoreTxt(p.ball.data), out: p.ball.data.sunk })));
    hud();
    ctx.setTimer(timeLeft);

    const speedOf = (b) => Math.hypot(b.body.velocity.x, b.body.velocity.z);
    const canPutt = (p) => running && p.ball.active && !p.ball.data.sunk && p.ball.data.still > 0.15 && p.ball.data.strokes < MAX_STROKES;

    function putt(p) {
      const d = p.ball.data;
      d.charging = false;
      if (!canPutt(p)) return;
      const power = Math.max(0.08, d.power);
      const sp = 1.2 + power * 12.5;
      d.last = [p.ball.position.x, p.ball.position.y + 0.1, p.ball.position.z];
      p.ball.body.velocity.set(Math.sin(d.aim) * sp, 0, Math.cos(d.aim) * sp);
      p.ball.poke(0.3 + power * 0.4);
      d.strokes++; d.still = 0;
      ctx.audio.bonk(0.3 + power * 0.5);
      ctx.feel(p, power > 0.7 ? 'bighit' : 'hit');
      ctx.fx.burst(p.ball.position, '#ffffff', { count: 5, speed: 2, up: 1, size: 0.06, life: 0.3 });
      ctx.tell(p, `Stroke ${d.strokes}`, d.strokes >= MAX_STROKES ? 'Last one! Make it count!' : 'Tilt to aim, hold to charge, let go to putt.');
      hud();
    }

    function sink(p) {
      const d = p.ball.data;
      d.sunk = true; d.sunkAt = elapsed;
      const at = new THREE.Vector3(cup.x, cup.y + 0.3, cup.z);
      p.ball.deactivate();
      d.arrow.visible = false; d.bar.visible = false;
      const word = d.strokes === 1 ? 'HOLE IN ONE!' : d.strokes < H.par ? 'BIRDIE!' : d.strokes === H.par ? 'PAR!' : 'IN THE HOLE!';
      ctx.fx.popText(at, word, d.strokes === 1 ? '#ff4d6d' : '#ffd60a', d.strokes === 1 ? 1.6 : 1.2);
      ctx.fx.confetti(new THREE.Vector3(cup.x, cup.y + 5, cup.z), d.strokes === 1 ? 140 : 50);
      ctx.audio.fanfare();
      ctx.feel(p, 'sink');
      ctx.tell(p, `${word.replace('!', '')} ⛳`, `${d.strokes} stroke${d.strokes > 1 ? 's' : ''}! Watch the others.`);
      if (d.strokes === 1) ctx.engine.addShake(0.2);
      hud();
    }

    function finish() {
      if (done) return;
      done = true; running = false;
      for (const p of ctx.players) { p.ball.data.arrow.visible = false; p.ball.data.bar.visible = false; }
      // Fewer strokes is better; not sinking it counts as max + 2. Ties broken by who sank first.
      const score = (p) => { const d = p.ball.data; return -(d.sunk ? d.strokes : MAX_STROKES + 2); };
      ctx.end(rankGroups(ctx.players, score));
    }

    const v = new THREE.Vector3();
    return {
      start() { running = true; ctx.tellAll('Mini Golf', 'Tilt to aim, HOLD the button to charge, LET GO to putt!'); },

      update(dt) {
        if (blades) {
          blades.body.angularVelocity.set(0, 0, running ? -1.4 : 0);
        }
        for (const pu of pushers) pu.step(running ? ctx.engine.time : 0);
        if (running) { elapsed += dt; timeLeft -= dt; ctx.setTimer(timeLeft); }

        for (const p of ctx.players) {
          const b = p.ball, d = b.data;
          if (!b.active || d.sunk) continue;
          const sp = speedOf(b);
          // Friction makes it stop for good instead of creeping forever.
          if (sp < 0.35 && b._groundedCache) { b.body.velocity.x *= 0.8; b.body.velocity.z *= 0.8; }
          d.still = sp < 0.15 ? d.still + dt : 0;

          // Aim with tilt (keeps the last aim when the phone is level).
          const inp = ctx.input(p);
          if (Math.hypot(inp.x, inp.y) > 0.25) {
            const target = Math.atan2(inp.x, -inp.y);
            let dd = target - d.aim; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
            d.aim += dd * Math.min(1, dt * 10);
          }
          // Charging: power swings up and down while the button is held.
          if (d.charging) {
            d.power += d.dir * dt * 0.9;
            if (d.power >= 1) { d.power = 1; d.dir = -1; }
            if (d.power <= 0) { d.power = 0; d.dir = 1; }
          }

          // In the cup?
          const dx = b.position.x - cup.x, dz = b.position.z - cup.z;
          if (running && Math.hypot(dx, dz) < CUP_R && Math.abs(b.position.y - (cup.y + 0.5)) < 0.4 && sp < 7) { sink(p); continue; }
          // Went over the edge: back to where you putted from, +1 stroke.
          if (b.position.y < cup.y - 4 && b.position.y < -3) {
            ctx.fx.poof(b.position);
            d.strokes = Math.min(MAX_STROKES, d.strokes + 1);
            ctx.spawn(p, d.last, b.yaw);
            ctx.fx.popText(b.position, '+1', '#ff4d6d', 0.9);
            ctx.audio.pop();
            hud();
          }
        }

        if (running) {
          const left = ctx.players.filter((p) => p.connected && !p.ball.data.sunk);
          const stuck = left.every((p) => p.ball.data.strokes >= MAX_STROKES && p.ball.data.still > 1.2);
          if (!left.length || stuck || timeLeft <= 0) finish();
        }
      },

      frame(dt) {
        const t = ctx.engine.time;
        fl.update(t);
        if (blades) { blades.g.position.copy(blades.body.position); blades.g.quaternion.copy(blades.body.quaternion); }
        for (const b of bumpers) b.update(dt);
        for (const pu of pushers) pu.update();
        const cam = ctx.engine.camera;
        for (const p of ctx.players) {
          const b = p.ball, d = b.data;
          const show = running && b.active && !d.sunk;
          const ready = show && canPutt(p);
          d.arrow.visible = show;
          if (show) {
            const len = 0.9 + (d.charging ? d.power : 0.25) * 2.4;
            d.arrow.position.set(b.position.x, b.position.y - 0.35, b.position.z);
            d.arrow.rotation.y = d.aim;
            d.dots.forEach((dot, k) => { dot.position.set(0, 0, 0.6 + (k / 5) * (len - 0.6)); dot.visible = ready; });
            d.head.position.set(0, 0, len + 0.15);
            d.head.visible = ready;
            d.arrow.children[0].material.opacity = ready ? 0.95 : 0.3;
          }
          d.bar.visible = show && d.charging;
          if (d.bar.visible) {
            d.bar.position.set(b.position.x, b.position.y + 1.3, b.position.z);
            d.bar.quaternion.copy(cam.quaternion);
            d.fill.scale.x = Math.max(0.02, d.power);
            d.fill.position.x = -0.55 * (1 - d.power);
            d.fill.material.color.setHSL(0.33 - d.power * 0.33, 0.8, 0.55);
          }
        }
      },

      onAction(p) {
        const d = p.ball.data;
        if (!canPutt(p)) return;
        d.charging = true; d.power = 0; d.dir = 1;
      },
      onActionUp(p) { if (p.ball.data.charging) putt(p); },
      onBodyHit(ball, body) { body.onBump?.(); },
    };
  },
};
