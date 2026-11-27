// BALL RACE: roll from the start arch to the finish arch. Boost pads, jump pads, spinning
// sweepers, bumpers and sliding blocks along the way.
//
// Fair-play rules built in:
//  - Fall off and you respawn at the START of the piece you were on (never next to a gap or obstacle).
//  - Miss the same jump twice and you get carried over it.
//  - No progress for 8 seconds (stuck somewhere)? You get popped forward to the next piece.
//  - Every obstacle leaves a free lane, and nothing is placed near the start of a piece.
//
// Tracks are data (TRACKS below): points the road runs through, plus things placed along it
// by piece number (`seg`) and how far along that piece (`t`, 0..1). `gaps` are pieces with no road.
import * as THREE from 'three';
import { makeLava } from './helpers.js';
import { road, joint, decal, sweeper, bumper, pusher, arch, roadTexture, chevronTexture, checkerTexture } from './course.js';

const FINISH_GRACE = 15; // seconds the others get after the winner crosses
const STUCK_TIME = 8;
const W = 7;             // normal road width
const LAND = 9;          // landing pieces after a jump are extra wide

const TRACKS = [
  {
    id: 'meadow', name: 'Meadow Dash', theme: 'meadow', killY: -14,
    colors: { road: '#ffd166', edge: '#ff8fab', wall: '#ffffff', side: '#a1887f' },
    points: [
      [0, 0, 10], [0, 0, -10], [8, 0, -24], [8, -2, -40], [0, -2, -54], [0, -2, -66], [0, -3, -71],
      [0, -3, -84], [-8, -3, -98], [-8, -3, -114], [0, -3, -126], [0, -3, -142],
    ],
    gaps: [5], wide: { 6: LAND },
    pads: [
      { seg: 0, t: 0.5, kind: 'boost' }, { seg: 4, t: 0.8, kind: 'jump' },
      { seg: 7, t: 0.45, kind: 'boost', x: -1.6 }, { seg: 7, t: 0.45, kind: 'boost', x: 1.6 }, { seg: 10, t: 0.3, kind: 'boost' },
    ],
    bumpers: [{ seg: 2, t: 0.35, x: -2 }, { seg: 2, t: 0.75, x: 2 }],
    sweepers: [{ seg: 3, t: 0.55, len: 2.4, speed: 1.4 }],
    pushers: [{ seg: 8, t: 0.55, side: -1, period: 3.4 }],
  },
  {
    id: 'candy', name: 'Candy Canyon', theme: 'candy', killY: -16,
    colors: { road: '#f78fc8', edge: '#5ec8e8', wall: '#ffffff', side: '#9d8df1' },
    points: [
      [0, 0, 10], [0, 0, -8], [-8, 0, -20], [-8, 2, -36], [-8, 2, -48], [8, 2, -60], [8, 2, -72],
      [8, 1, -77], [8, 1, -90], [0, 1, -102], [0, 1, -114], [0, 1, -130],
    ],
    gaps: [6], wide: { 7: LAND },
    pads: [
      { seg: 0, t: 0.5, kind: 'boost' }, { seg: 2, t: 0.3, kind: 'boost' }, { seg: 5, t: 0.8, kind: 'jump' },
      { seg: 10, t: 0.3, kind: 'boost' },
    ],
    bumpers: [{ seg: 1, t: 0.55, x: -2.2 }, { seg: 1, t: 0.55, x: 2.2 }, { seg: 8, t: 0.4, x: -2 }, { seg: 8, t: 0.75, x: 2 }],
    sweepers: [{ seg: 3, t: 0.55, len: 2.4, speed: -1.4 }, { seg: 9, t: 0.55, len: 2.4, speed: 1.6 }],
    pushers: [{ seg: 4, t: 0.55, side: 1, period: 3 }],
  },
  {
    // No volcano mountains here: they'd sit right in front of the camera.
    id: 'volcano', name: 'Lava Leap', theme: 'volcano', env: { volcanoes: 0, pillars: 6 }, lava: -7, killY: -6.5,
    colors: { road: '#ffd6a5', edge: '#ff6b35', wall: '#6b4a5a', side: '#6b4a5a' },
    points: [
      [0, 0, 10], [0, 0, -8], [0, 0, -20], [0, -0.5, -25], [0, -0.5, -40], [8, -0.5, -52], [8, -0.5, -64],
      [8, -1, -69], [8, -1, -82], [-4, -1, -92], [-4, -1, -104], [-4, -1.5, -109], [-4, -1.5, -124], [-4, -1.5, -138],
    ],
    gaps: [2, 6, 10], wide: { 3: LAND, 7: LAND, 11: LAND },
    pads: [
      { seg: 0, t: 0.45, kind: 'boost' }, { seg: 1, t: 0.75, kind: 'jump' }, { seg: 4, t: 0.35, kind: 'boost' },
      { seg: 5, t: 0.75, kind: 'jump' }, { seg: 9, t: 0.75, kind: 'jump' }, { seg: 11, t: 0.35, kind: 'boost' },
    ],
    bumpers: [{ seg: 7, t: 0.45, x: -2.2 }, { seg: 7, t: 0.8, x: 2.2 }],
    sweepers: [{ seg: 3, t: 0.6, len: 2.8, speed: 1.3 }, { seg: 12, t: 0.5, len: 2.4, speed: -1.5 }],
    pushers: [],
  },
];

export default {
  id: 'ball-race',
  name: 'Ball Race',
  emoji: '🏁',
  theme: 'meadow', // replaced by the track's own theme
  tagline: 'Race to the finish! Boost pads, jumps and wacky obstacles.',
  howTo: 'Tilt to roll. Blue arrows BOOST you, yellow pads make you JUMP. Fall off and you pop back. First to the finish wins!',
  actionLabel: null,
  minPlayers: 1,
  phoneCam: { up: 7, back: 8 },
  maps: TRACKS.map((t) => ({ id: t.id, name: t.name, theme: t.theme, env: t.env })),
  TRACKS, // exported for the track tester

  create(ctx) {
    const T = TRACKS.find((t) => t.id === ctx.map) || TRACKS[0];
    const widthOf = (i) => (T.wide && T.wide[i]) || W;
    const gaps = new Set(T.gaps || []);

    const top = new THREE.MeshStandardMaterial({ map: roadTexture(T.colors.road, T.colors.edge), roughness: 0.6 });
    const side = new THREE.MeshStandardMaterial({ color: T.colors.side, roughness: 0.9 });
    const walls = { h: 0.8, mat: new THREE.MeshStandardMaterial({ color: T.colors.wall, roughness: 0.4 }) };
    const lava = T.lava !== undefined ? makeLava(ctx, T.lava, { area: 90 }) : null;
    if (lava) lava.mesh.position.z = -60;

    // ---- build the road
    const segs = [];
    let total = 0;
    for (let i = 0; i < T.points.length - 1; i++) {
      const w = widthOf(i);
      let F;
      if (gaps.has(i)) {
        F = road(ctx, T.points[i], T.points[i + 1], w, { top, side, thick: 0.01 }); // just for its frame
        F.mesh.visible = false; ctx.level.removeBody(F.body);
      } else {
        F = road(ctx, T.points[i], T.points[i + 1], w, { top, side, walls });
      }
      F.gap = gaps.has(i); F.start = total; F.w = w; F.i = i;
      total += F.L;
      segs.push(F);
    }
    // Round corner pieces where the road turns. (Never turn right at the top of a hill: the flat
    // corner piece would stick up out of the slope like a step.) Straight slope changes need none.
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].gap || segs[i - 1].gap) continue;
      const a = segs[i - 1].f, b = segs[i].f;
      if (Math.abs(Math.atan2(a.x, a.z) - Math.atan2(b.x, b.z)) < 0.05) continue;
      joint(ctx, T.points[i], Math.max(widthOf(i - 1), widthOf(i)), segs[i - 1].f, segs[i].f, { top, side, walls });
    }
    joint(ctx, T.points[0], widthOf(0), segs[0].f, segs[0].f, { top, side });
    const last = segs[segs.length - 1], first = segs[0];
    joint(ctx, T.points[T.points.length - 1], last.w, last.f, last.f, { top, side });

    // ---- start + finish
    arch(ctx, first, 3.5, first.w, { color: '#4cc9f0', text: 'BALL RACE' });
    const finishS = last.L - 2.5;
    arch(ctx, last, finishS, last.w, { color: '#ff4d6d' });
    const chk = checkerTexture(8); chk.repeat.set(last.w / 1.2, 1);
    decal(ctx, last, finishS, 0, last.w, 1.2, new THREE.MeshStandardMaterial({ map: chk, roughness: 0.6 }));
    const finishAt = last.start + finishS;

    // ---- pads
    const boostTex = chevronTexture('#4cc9f0'), jumpTex = chevronTexture('#ffd60a');
    const pads = (T.pads || []).map((p) => {
      const F = segs[p.seg], jump = p.kind === 'jump';
      const w = jump ? F.w - 0.4 : 2.2, l = jump ? 2.4 : 2.6;
      const tex = (jump ? jumpTex : boostTex).clone();
      tex.repeat.set(jump ? 3 : 1, l / 2.6);
      decal(ctx, F, p.t * F.L, p.x || 0, w, l, new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      return { ...p, F, s: p.t * F.L, w, l, tex };
    });

    // ---- obstacles
    const sweepers = (T.sweepers || []).map((o) => {
      const s = sweeper(ctx, segs[o.seg].at(o.t * segs[o.seg].L), o.len, 0, { bounce: 4 });
      s.speed = o.speed; return s;
    });
    const bumpers = (T.bumpers || []).map((o) => bumper(ctx, segs[o.seg].at(o.t * segs[o.seg].L, o.x || 0), { color: '#ff4d6d', bounce: 4 }));
    const pushers = (T.pushers || []).map((o) => {
      // Slides across ONE half of the road; the other half is always clear, and it never
      // closes the gap to the wall all the way (no squishing balls).
      const F = segs[o.seg], s = o.t * F.L, sd = o.side || -1;
      return pusher(ctx, F.at(s, sd * (F.w / 2 - 2.2), 0.5), F.at(s, sd * 0.5, 0.5), [1.6, 1, 1.4], o.period, { color: '#9b5de5', bounce: 3 });
    });

    // ---- players on a starting grid
    const n = ctx.players.length, cols = Math.min(4, n);
    ctx.players.forEach((p, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const x = (col - (Math.min(cols, n - row * cols) - 1) / 2) * 1.4;
      const pos = first.at(2 - row * 1.4, x, 0.6);
      p.ball.data = { seg: 0, prog: 0, best: 0, bestAt: 0, finished: false, place: 0, padCD: 0, fails: {} };
      p.ball.tuning.maxSpeed = 9;
      p.ball.tuning.maxAccel = 24;
      p.ball.tuning.airControl = 0.45;
      ctx.spawn(p, pos.toArray(), Math.PI);
    });
    ctx.engine.setCamera({ pos: first.at(-7, 0, 13).toArray(), look: first.at(6).toArray() });

    let running = false, finishedCount = 0, graceLeft = null, done = false, drama = false, clock = 0;
    const order = [];
    const placeName = (k) => ['1st', '2nd', '3rd'][k] || `${k + 1}th`;

    const standings = () => [...ctx.players].sort((a, b) => {
      const A = a.ball.data, B = b.ball.data;
      if (A.finished || B.finished) return (B.finished - A.finished) || (A.place - B.place);
      return B.prog - A.prog;
    });
    let hudT = 0;
    const hud = () => {
      ctx.setScores(standings().map((p, k) => ({ player: p, value: p.ball.data.finished ? `🏁 ${placeName(p.ball.data.place)}` : placeName(k) })));
    };
    hud();

    const pointAt = (prog) => {
      prog = Math.max(0, Math.min(total, prog));
      const F = segs.find((f) => prog <= f.start + f.L) || last;
      return F.at(prog - F.start);
    };
    // TV camera: frames EVERYONE still racing, plus a peek at the road ahead of the leader.
    // (Each phone has its own close-up ball cam, so the TV can afford to stay wide.)
    ctx.engine.follow(() => {
      const racing = ctx.players.filter((p) => p.ball.active && !p.ball.data.finished);
      const list = racing.length ? racing : ctx.players.filter((p) => p.ball.active);
      if (!list.length) return [];
      const pts = list.map((p) => p.ball.position);
      if (racing.length) pts.push(pointAt(Math.max(...racing.map((p) => p.ball.data.prog)) + 6));
      return pts;
    }, { min: 13, max: 50, pad: 3, dir: [0, 0.8, 0.6], smooth: 0.9 });

    function locate(b) {
      const d = b.data;
      let best = d.seg, bestD = Infinity, bestL = null;
      for (let i = Math.max(0, d.seg - 1); i <= Math.min(segs.length - 1, d.seg + 2); i++) {
        const F = segs[i], L = F.toLocal(b.position);
        const s = Math.max(0, Math.min(F.L, L.s));
        const off = Math.hypot(L.x * 0.5, L.h - 0.5) + Math.abs(L.s - s);
        if (off < bestD) { bestD = off; best = i; bestL = L; }
      }
      d.seg = best;
      const F = segs[best];
      d.prog = F.start + Math.max(0, Math.min(F.L, bestL.s));
      if (d.prog > d.best + 1) { d.best = d.prog; d.bestAt = clock; }
    }

    // A safe spot: the start of a solid piece, in the middle of the road.
    const safeAt = (i) => {
      while (i > 0 && segs[i].gap) i--;
      return segs[i].at(Math.min(1.5, segs[i].L / 3), 0, 1);
    };
    const nextSolid = (i) => { i++; while (i < segs.length - 1 && segs[i].gap) i++; return Math.min(i, segs.length - 1); };

    function respawn(p, where, msg = null) {
      ctx.fx.poof(p.ball.position);
      ctx.spawn(p, where.toArray(), p.ball.yaw);
      p.ball.data.bestAt = clock;
      ctx.fx.poof(p.ball.position);
      if (msg) ctx.fx.popText(p.ball.position, msg, '#ffffff', 0.8);
    }

    function fell(p) {
      const b = p.ball, d = b.data;
      if (lava && b.position.y < lava.y + 1) { ctx.fx.splash(b.position); ctx.audio.splash(); } else ctx.audio.pop();
      ctx.feel(p, 'hit');
      let i = d.seg;
      // Fell into a gap (or just before it)? Count misses; after two, carry them across.
      const gapIdx = segs[i].gap ? i : (segs[i + 1]?.gap && d.prog > segs[i].start + segs[i].L * 0.6 ? i + 1 : -1);
      if (gapIdx >= 0) {
        d.fails[gapIdx] = (d.fails[gapIdx] || 0) + 1;
        if (d.fails[gapIdx] >= 2) { d.fails[gapIdx] = 0; d.seg = nextSolid(gapIdx); respawn(p, safeAt(d.seg), 'Lift!'); return; }
        i = gapIdx - 1;
      }
      d.seg = i;
      respawn(p, safeAt(i));
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

    function pads_(p) {
      const b = p.ball, d = b.data;
      if (d.padCD > 0) return;
      for (const pad of pads) {
        const L = pad.F.toLocal(b.position);
        if (Math.abs(L.s - pad.s) > pad.l / 2 + 0.3 || Math.abs(L.x - (pad.x || 0)) > pad.w / 2 + 0.2 || L.h > 1.3 || L.h < -0.3) continue;
        const f = pad.F.f, r = pad.F.r, v = b.body.velocity;
        const along = Math.max(v.x * f.x + v.z * f.z, 0), side = (v.x * r.x + v.z * r.z) * 0.3;
        if (pad.kind === 'boost') {
          const sp = Math.max(16, along + 4);
          b.launch(f.x * sp + r.x * side, v.y + f.y * sp, f.z * sp + r.z * side, 0.6);
          ctx.audio.whoosh(); ctx.feel(p, 'boost');
          ctx.fx.burst(b.position, '#4cc9f0', { count: 10, speed: 4, up: 1, size: 0.1, life: 0.4 });
        } else {
          // Jumps aim straight down the road, so everyone clears the gap.
          const sp = Math.max(13, Math.min(along, 17));
          b.launch(f.x * sp, 9, f.z * sp, 1.2);
          ctx.audio.boing(); ctx.feel(p, 'boost');
          ctx.fx.popText(b.position, 'WHEEE!', '#ffd60a', 1);
        }
        d.padCD = 0.6;
        return;
      }
    }

    return {
      start() { running = true; },
      debug: { segs, total, finishAt, pointAt },

      update(dt) {
        const t = ctx.engine.time;
        if (running) clock += dt;
        for (const s of sweepers) s.body.angularVelocity.set(0, running ? s.speed : 0, 0);
        for (const pu of pushers) pu.step(running ? t : 0);
        for (const p of ctx.players) {
          const b = p.ball;
          if (!b.active) continue;
          const d = b.data;
          locate(b);
          d.padCD = Math.max(0, d.padCD - dt);
          const F = segs[d.seg];
          if (b.position.y < T.killY || b.position.y < Math.min(F.a.y, F.b.y) - 6) { fell(p); continue; }
          if (d.finished) continue;
          pads_(p);
          if (running && d.prog >= finishAt) { finish(p); continue; }
          // Stuck for ages (wedged somewhere, or just lost)? Pop forward.
          if (running && clock - d.bestAt > STUCK_TIME) {
            d.seg = nextSolid(d.seg);
            respawn(p, safeAt(d.seg), 'Unstuck!');
            ctx.tell(p, 'Popped you forward!', 'Keep rolling!');
          }
        }

        if (!running) return;
        // Slow-mo close-up just before the winner crosses the line.
        if (!drama && n > 1 && finishedCount === 0) {
          const lead = standings()[0], b = lead.ball, v = b.body.velocity;
          const left = finishAt - lead.ball.data.prog, sp = Math.hypot(v.x, v.z);
          if (b.active && left < 5 && left / Math.max(sp, 0.1) < 0.6) { drama = true; ctx.dramatic(lead); }
        }
        if (graceLeft !== null) {
          graceLeft -= dt;
          ctx.setTimer(graceLeft);
          if (graceLeft <= 0 || finishedCount >= ctx.players.filter((p) => p.connected).length) end();
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
      onPlayerLeave() {
        if (running && ctx.players.filter((o) => o.connected).every((o) => o.ball.data.finished)) end();
      },
      dispose() { ctx.engine.follow(null); },
    };
  },
};
