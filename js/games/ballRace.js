// BALL RACE: roll from the start arch to the finish arch. Boost pads, jump pads, spinning
// sweepers, bumpers and sliding blocks along the way. Fall off and you pop back at your
// last checkpoint. First across the line gets a slow-mo close-up!
//
// Tracks are just data (TRACKS below): a list of points the road runs through, plus
// things placed along it by piece number (`seg`) and how far along that piece (`t`, 0..1).
import * as THREE from 'three';
import { makeLava } from './helpers.js';
import { road, joint, decal, sweeper, bumper, pusher, arch, roadTexture, chevronTexture, checkerTexture } from './course.js';

const FINISH_GRACE = 12; // seconds the others get after the winner crosses

const TRACKS = [
  {
    id: 'meadow', name: 'Meadow Dash', theme: 'meadow', width: 5.5, killY: -14,
    colors: { road: '#ffd166', edge: '#ff8fab', wall: '#ffffff', side: '#a1887f' },
    points: [
      [0, 0, 10], [0, 0, -6], [7, 0, -16], [7, -2, -28], [-1, -2, -38], [-8, -2, -46],
      [-8, -2, -56], [-8, -3, -63], [-8, -3, -70], [0, -3, -80], [8, -3, -90], [8, -1.5, -100], [8, -1.5, -114],
    ],
    gaps: [6],          // piece 6 is a gap: jump it!
    wide: { 4: 8, 5: 8 }, // bumper meadow is wider
    pads: [
      { seg: 0, t: 0.55, kind: 'boost' }, { seg: 2, t: 0.4, kind: 'boost', x: -1.3 }, { seg: 2, t: 0.4, kind: 'boost', x: 1.3 },
      { seg: 5, t: 0.85, kind: 'jump' }, { seg: 8, t: 0.3, kind: 'boost' }, { seg: 11, t: 0.25, kind: 'boost' },
    ],
    bumpers: [{ seg: 4, t: 0.45, x: -2 }, { seg: 4, t: 0.65, x: 2.2 }, { seg: 4, t: 0.85, x: -0.4 }, { seg: 5, t: 0.3, x: 1.8 }, { seg: 5, t: 0.5, x: -2 }],
    sweepers: [{ seg: 9, t: 0.5, len: 2.6, speed: 2.2 }],
    pushers: [{ seg: 11, t: 0.65, period: 3 }],
  },
  {
    id: 'candy', name: 'Candy Canyon', theme: 'candy', width: 5, killY: -16,
    colors: { road: '#f78fc8', edge: '#5ec8e8', wall: '#ffffff', side: '#9d8df1' },
    points: [
      [0, 0, 10], [0, 0, -4], [-8, 0, -10], [-8, 1.5, -22], [2, 1.5, -28], [10, 1.5, -34], [10, 3, -46],
      [2, 3, -54], [-6, 3, -60], [-6, 1, -70], [-6, 1, -76], [-6, 1, -88], [4, 1, -96], [4, 1, -110],
    ],
    gaps: [10],
    pads: [
      { seg: 0, t: 0.5, kind: 'boost' }, { seg: 2, t: 0.2, kind: 'boost' }, { seg: 5, t: 0.15, kind: 'boost' },
      { seg: 9, t: 0.8, kind: 'jump' }, { seg: 12, t: 0.3, kind: 'boost', x: -1.2 }, { seg: 12, t: 0.3, kind: 'boost', x: 1.2 },
    ],
    pushers: [{ seg: 1, t: 0.6, period: 2.6 }, { seg: 4, t: 0.5, period: 2.2, phase: 1.5 }, { seg: 7, t: 0.5, period: 2.4 }, { seg: 11, t: 0.6, period: 2 }],
    sweepers: [{ seg: 3, t: 0.5, len: 2.4, speed: -2 }, { seg: 8, t: 0.45, len: 2.4, speed: 2.4 }],
    bumpers: [{ seg: 12, t: 0.7, x: 0 }],
  },
  {
    id: 'volcano', name: 'Lava Leap', theme: 'volcano', width: 5, lava: -7, killY: -6.5, walls: false,
    colors: { road: '#ffd6a5', edge: '#ff6b35', wall: '#6b4a5a', side: '#6b4a5a' },
    points: [
      [0, 0, 10], [0, 0, -2], [0, 0, -8], [0, 0, -16], [0, 0, -22], [6, 0, -30], [6, 0, -40],
      [6, 0, -46], [6, 0, -54], [-2, 0, -62], [-8, 0, -70], [-8, 0, -77], [-8, 0, -84], [-8, 0, -100],
    ],
    gaps: [2, 7, 11],
    wide: { 3: 6.5, 8: 6.5 },
    wallsOn: [5, 6, 9, 10],
    pads: [
      { seg: 1, t: 0.6, kind: 'jump' }, { seg: 6, t: 0.75, kind: 'jump' }, { seg: 10, t: 0.75, kind: 'jump' },
      { seg: 0, t: 0.45, kind: 'boost' }, { seg: 5, t: 0.25, kind: 'boost' }, { seg: 12, t: 0.2, kind: 'boost' },
    ],
    sweepers: [{ seg: 3, t: 0.5, len: 3, speed: 2 }, { seg: 8, t: 0.5, len: 3, speed: -2.3 }],
    bumpers: [{ seg: 9, t: 0.5, x: 0 }, { seg: 12, t: 0.55, x: -1.5 }, { seg: 12, t: 0.7, x: 1.5 }],
    pushers: [],
  },
];

export default {
  id: 'ball-race',
  name: 'Ball Race',
  emoji: '🏁',
  theme: 'meadow', // replaced by the track's own theme
  tagline: 'Race to the finish! Boost pads, jumps and wacky obstacles.',
  howTo: 'Tilt to roll. Hit the blue arrows to BOOST, the yellow pads to JUMP. Fall off and you pop back at the last checkpoint. First to the finish wins!',
  actionLabel: null,
  minPlayers: 1,
  maps: TRACKS.map((t) => ({ id: t.id, name: t.name, theme: t.theme })),

  create(ctx) {
    const T = TRACKS.find((t) => t.id === ctx.map) || TRACKS[0];
    const W = (i) => (T.wide && T.wide[i]) || T.width;
    const gaps = new Set(T.gaps || []);
    const wallsAt = (i) => (T.walls === false ? (T.wallsOn || []).includes(i) : true);

    const top = new THREE.MeshStandardMaterial({ map: roadTexture(T.colors.road, T.colors.edge), roughness: 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: T.colors.side, roughness: 0.9 });
    const wallMat = new THREE.MeshStandardMaterial({ color: T.colors.wall, roughness: 0.4 });
    const walls = { h: 0.7, mat: wallMat };
    const lava = T.lava !== undefined ? makeLava(ctx, T.lava, { area: 70 }) : null;
    if (lava) lava.mesh.position.z = -45;

    // ---- build the road
    const segs = [];
    let total = 0;
    for (let i = 0; i < T.points.length - 1; i++) {
      const w = W(i);
      let F;
      if (gaps.has(i)) {
        F = road(ctx, T.points[i], T.points[i + 1], w, { top, side, thick: 0.01 }); // invisible-ish placeholder for the frame
        F.mesh.visible = false; ctx.level.removeBody(F.body);
      } else {
        F = road(ctx, T.points[i], T.points[i + 1], w, { top, side, walls: wallsAt(i) ? walls : false });
      }
      F.gap = gaps.has(i); F.start = total; F.w = w;
      total += F.L;
      segs.push(F);
    }
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].gap || segs[i - 1].gap) continue;
      joint(ctx, T.points[i], Math.max(W(i - 1), W(i)), segs[i - 1].f, segs[i].f, { top, side, walls: wallsAt(i) && wallsAt(i - 1) ? walls : false });
    }
    // Rounded ends so the start and finish don't look chopped off.
    joint(ctx, T.points[0], W(0), segs[0].f, segs[0].f, { top, side });
    joint(ctx, T.points[T.points.length - 1], W(segs.length - 1), segs[segs.length - 1].f, segs[segs.length - 1].f, { top, side });

    // ---- start + finish
    const first = segs[0], last = segs[segs.length - 1];
    arch(ctx, first, 3.5, first.w, { color: '#4cc9f0', text: 'BALL RACE' });
    const finishS = last.L - 2;
    arch(ctx, last, finishS, last.w, { color: '#ff4d6d' });
    const chk = checkerTexture(8); chk.repeat.set(last.w / 1.2, 1);
    decal(ctx, last, finishS, 0, last.w, 1.2, new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6 }));
    const finishAt = last.start + finishS;

    // ---- pads
    const boostTex = chevronTexture('#4cc9f0'), jumpTex = chevronTexture('#ffd60a');
    const pads = (T.pads || []).map((p) => {
      const F = segs[p.seg], w = p.kind === 'jump' ? F.w - 0.6 : 2, l = p.kind === 'jump' ? 2 : 2.6;
      const tex = (p.kind === 'jump' ? jumpTex : boostTex).clone();
      tex.repeat.set(1, l / 2.6);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      decal(ctx, F, p.t * F.L, p.x || 0, w, l, mat);
      return { ...p, F, s: p.t * F.L, w, l, tex };
    });

    // ---- obstacles
    const sweepers = (T.sweepers || []).map((o) => sweeper(ctx, segs[o.seg].at(o.t * segs[o.seg].L), o.len, o.speed));
    sweepers.forEach((s) => { s.speed = s.body.angularVelocity.y; s.body.angularVelocity.set(0, 0, 0); });
    const bumpers = (T.bumpers || []).map((o) => bumper(ctx, segs[o.seg].at(o.t * segs[o.seg].L, o.x || 0), { color: '#ff4d6d' }));
    const pushers = (T.pushers || []).map((o) => {
      const F = segs[o.seg], s = o.t * F.L, half = F.w / 2 - 1;
      return pusher(ctx, F.at(s, -half, 0.5), F.at(s, half, 0.5), [1.6, 1, 1.4], o.period, { phase: o.phase || 0, color: '#9b5de5' });
    });

    // ---- players on a starting grid
    const n = ctx.players.length, cols = Math.min(4, n);
    ctx.players.forEach((p, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const x = (col - (Math.min(cols, n - row * cols) - 1) / 2) * 1.25;
      const pos = first.at(1.4 + row * -1.3 + 0.5, x, 0.6);
      pos.z += 0; // grid sits just behind the start arch
      p.ball.data = { seg: 0, prog: 0, finished: false, place: 0, padCD: 0, check: pos.toArray() };
      p.ball.tuning.maxSpeed = 9;
      p.ball.tuning.maxAccel = 24;
      p.ball.tuning.airControl = 0.45;
      ctx.spawn(p, pos.toArray(), Math.PI);
    });
    ctx.engine.setCamera({ pos: first.at(-6, 0, 12).toArray(), look: first.at(6).toArray() });

    let running = false, finishedCount = 0, graceLeft = null, done = false, drama = false;
    const order = [];
    const placeName = (k) => ['1st', '2nd', '3rd'][k] || `${k + 1}th`;

    const standings = () => [...ctx.players].sort((a, b) => {
      const A = a.ball.data, B = b.ball.data;
      if (A.finished || B.finished) return (B.finished - A.finished) || (A.place - B.place);
      return B.prog - A.prog;
    });
    let hudT = 0;
    const hud = () => {
      const s = standings();
      ctx.setScores(s.map((p, k) => ({ player: p, value: p.ball.data.finished ? `🏁 ${placeName(p.ball.data.place)}` : placeName(k) })));
    };
    hud();

    // Camera: frames the leader, whoever's close behind, and a peek at the road ahead.
    const pointAt = (prog) => {
      prog = Math.max(0, Math.min(total, prog));
      const F = segs.find((f) => prog <= f.start + f.L) || last;
      return F.at(prog - F.start);
    };
    ctx.engine.follow(() => {
      const active = ctx.players.filter((p) => p.ball.active && !p.ball.data.finished);
      const lead = Math.max(0, ...active.map((p) => p.ball.data.prog));
      const pts = active.filter((p) => p.ball.data.prog > lead - 24).map((p) => p.ball.position);
      if (!pts.length) return ctx.players.filter((p) => p.ball.active).map((p) => p.ball.position);
      pts.push(pointAt(lead + 7));
      return pts;
    }, { min: 12, max: 30, pad: 2, dir: [0, 0.82, 0.58], smooth: 0.75 });

    function locate(b) {
      const d = b.data;
      let best = d.seg, bestD = Infinity, bestL = null;
      for (let i = Math.max(0, d.seg - 1); i <= Math.min(segs.length - 1, d.seg + 2); i++) {
        const F = segs[i], L = F.toLocal(b.position);
        const s = Math.max(0, Math.min(F.L, L.s));
        const off = Math.hypot(L.x, L.h - 0.5) + Math.abs(L.s - s);
        if (off < bestD) { bestD = off; best = i; bestL = L; }
      }
      d.seg = best;
      const F = segs[best];
      d.local = bestL;
      d.prog = Math.max(d.prog * 0 + F.start + Math.max(0, Math.min(F.L, bestL.s)), 0);
      if (!F.gap && bestL.h > 0 && bestL.h < 1.5 && Math.abs(bestL.x) < F.w / 2) {
        // Grounded on solid road: that's the new checkpoint (snapped to the middle).
        d.check = F.at(Math.max(0.5, Math.min(F.L - 0.5, bestL.s)), 0, 1).toArray();
      }
    }

    function respawn(p) {
      const d = p.ball.data;
      ctx.fx.poof(p.ball.position);
      if (lava && p.ball.position.y < lava.y + 1) { ctx.fx.splash(p.ball.position); ctx.audio.splash(); } else ctx.audio.pop();
      ctx.feel(p, 'hit');
      ctx.spawn(p, d.check, p.ball.yaw);
      p.ball.stagger(0.3);
      ctx.fx.poof(p.ball.position);
    }

    function finish(p) {
      const d = p.ball.data;
      d.finished = true; d.place = finishedCount++;
      order.push(p);
      ctx.fx.confetti(new THREE.Vector3(p.ball.position.x, p.ball.position.y + 6, p.ball.position.z), d.place === 0 ? 120 : 40);
      ctx.audio[d.place === 0 ? 'fanfare' : 'pickup']();
      ctx.fx.popText(p.ball.position, d.place === 0 ? 'WINNER!' : placeName(d.place), d.place === 0 ? '#ffd60a' : '#ffffff', 1.4);
      ctx.feel(p, d.place === 0 ? 'win' : 'collect');
      ctx.tell(p, `You finished ${placeName(d.place)}!`, d.place === 0 ? '🏆 Fastest ball!' : 'Nice rolling!');
      if (d.place === 0) {
        ctx.announce(`${p.name} wins the race!`, n > 1 ? `${FINISH_GRACE} seconds for everyone else!` : null, 2200);
        graceLeft = FINISH_GRACE;
      }
      hud();
    }

    function end() {
      if (done) return;
      done = true; running = false;
      const rest = ctx.players.filter((p) => !p.ball.data.finished).sort((a, b) => b.ball.data.prog - a.ball.data.prog);
      ctx.end([...order.map((p) => [p]), ...rest.map((p) => [p])]);
    }

    return {
      start() { running = true; },

      update(dt) {
        const t = ctx.engine.time;
        if (running) for (const s of sweepers) s.body.angularVelocity.set(0, s.speed, 0);
        for (const pu of pushers) pu.step(running ? t : 0);
        for (const p of ctx.players) {
          const b = p.ball;
          if (!b.active) continue;
          const d = b.data;
          locate(b);
          d.padCD = Math.max(0, d.padCD - dt);
          if (b.position.y < T.killY || (segs[d.seg] && b.position.y < Math.min(segs[d.seg].a.y, segs[d.seg].b.y) - 7)) { respawn(p); continue; }
          if (d.finished) continue;

          // Pads.
          if (d.padCD <= 0) {
            for (const pad of pads) {
              const L = pad.F.toLocal(b.position);
              if (Math.abs(L.s - pad.s) < pad.l / 2 + 0.3 && Math.abs(L.x - (pad.x || 0)) < pad.w / 2 + 0.2 && L.h < 1.3 && L.h > -0.3) {
                const f = pad.F.f, v = b.body.velocity;
                const along = Math.max(v.x * f.x + v.z * f.z, 0);
                if (pad.kind === 'boost') {
                  const sp = Math.max(17, along + 4);
                  b.launch(f.x * sp + pad.F.r.x * (v.x * pad.F.r.x + v.z * pad.F.r.z) * 0.4, v.y + f.y * sp, f.z * sp + pad.F.r.z * (v.x * pad.F.r.x + v.z * pad.F.r.z) * 0.4, 0.7);
                  ctx.audio.whoosh(); ctx.feel(p, 'boost');
                  ctx.fx.burst(b.position, '#4cc9f0', { count: 10, speed: 4, up: 1, size: 0.1, life: 0.4 });
                  if (Math.random() < 0.5) ctx.fx.popText(b.position, 'ZOOM!', '#4cc9f0', 0.9);
                } else {
                  const sp = Math.max(13, along);
                  b.launch(f.x * sp, 9, f.z * sp, 1.2);
                  ctx.audio.boing(); ctx.feel(p, 'boost');
                  ctx.fx.popText(b.position, 'WHEEE!', '#ffd60a', 1);
                }
                d.padCD = 0.6;
                break;
              }
            }
          }
          if (running && d.prog >= finishAt) finish(p);
        }

        if (!running) return;
        // Slow-mo close-up just before the winner crosses the line.
        if (!drama && n > 1 && finishedCount === 0) {
          const lead = standings()[0], b = lead.ball, v = b.body.velocity;
          const left = finishAt - lead.ball.data.prog, sp = Math.hypot(v.x, v.z);
          if (b.active && left < 5 && left / Math.max(sp, 0.1) < 0.7) { drama = true; ctx.dramatic(lead); }
        }
        if (graceLeft !== null) {
          graceLeft -= dt;
          ctx.setTimer(graceLeft);
          if (graceLeft <= 0 || finishedCount >= n) end();
        }
        hudT -= dt;
        if (hudT <= 0) { hudT = 0.25; hud(); }
      },

      frame(dt) {
        lava?.update(dt);
        for (const s of sweepers) s.update();
        for (const b of bumpers) b.update(dt);
        for (const pu of pushers) pu.update();
        for (const pad of pads) pad.tex.offset.y -= dt * 1.6;
      },

      onBodyHit(ball, body) { body.onBump?.(); },
      onPlayerLeave(p) {
        if (running && ctx.players.filter((o) => o !== p && o.connected).every((o) => o.ball.data.finished)) end();
      },
      dispose() { ctx.engine.follow(null); },
    };
  },
};
