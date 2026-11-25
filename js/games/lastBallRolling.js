// LAST BALL ROLLING: a tiled platform crumbles from the outside in. Fall and you're out.
// Last ball standing wins.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeLava, ringSpawns } from './helpers.js';

const TILE = 1.6;
const GAP = 0.06;
const MIN_TILES = 4;
const SOLO_TIME = 75; // with one player, survive this long to "win"

export default {
  id: 'last-ball-rolling',
  name: 'Last Ball Rolling',
  emoji: '👑',
  tagline: 'The floor is crumbling. Be the last ball standing!',
  howTo: 'Tilt to roll. The floor falls away from the edges. Flashing tiles are about to drop. Last one on wins!',
  actionLabel: 'BOOST!',
  minPlayers: 1,

  create(ctx) {
    const START_RADIUS = Math.min(12.5, 9.5 + Math.max(0, ctx.players.length - 4) * 0.45);
    const cs = START_RADIUS / 9.5;
    ctx.engine.setCamera({ pos: [0, 20 * cs, 15 * cs], look: [0, -1, 0.5] });
    const lava = makeLava(ctx, -3.5);

    // Build a circle of square tiles.
    const geo = new THREE.BoxGeometry(TILE - GAP, 0.6, TILE - GAP);
    const palette = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];
    const tiles = [];
    const n = Math.ceil(START_RADIUS / TILE);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
      const x = i * TILE, z = j * TILE, d = Math.hypot(x, z);
      if (d > START_RADIUS) continue;
      const color = new THREE.Color(palette[(i + j + 100) % palette.length]);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, -0.3, z);
      mesh.receiveShadow = true; mesh.castShadow = true;
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: ctx.engine.mat.ground });
      body.addShape(new CANNON.Box(new CANNON.Vec3(TILE / 2, 0.3, TILE / 2)));
      body.position.set(x, -0.3, z);
      ctx.level.add(mesh, body);
      // Outer tiles drop first; a little randomness makes holes appear inside too.
      const order = -d + (Math.random() < 0.12 ? -Math.random() * 6 : Math.random() * 1.2);
      tiles.push({ mesh, body, mat, color, order, state: 'solid', t: 0, vy: 0, spin: new THREE.Vector3() });
    }
    tiles.sort((a, b) => a.order - b.order); // first = drops first
    let nextTile = 0;

    const spawns = ringSpawns(ctx.players.length, Math.min(5.5, 2 + ctx.players.length * 0.5));
    ctx.players.forEach((p, i) => {
      p.ball.data = { out: false, outAt: 0 };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    const solo = ctx.players.length === 1;
    let running = false;
    let finished = false;
    let elapsed = 0;
    let dropTimer = 3; // grace period
    const outOrder = []; // first eliminated first
    const scores = () => ctx.setScores(ctx.players.map((p) => ({ player: p, value: p.ball.data.out ? '💧' : '😀', out: p.ball.data.out })));
    scores();
    ctx.setTimer(solo ? SOLO_TIME : null);

    function crumble(count) {
      const solidLeft = tiles.length - nextTile;
      for (let k = 0; k < count && solidLeft - k > MIN_TILES; k++) {
        const tile = tiles[nextTile++];
        tile.state = 'warn'; tile.t = 1.4;
      }
    }

    function safeTile() {
      const solid = tiles.filter((t) => t.state === 'solid');
      const t = solid[solid.length - 1] || tiles[tiles.length - 1];
      return [t.body.position.x, 3, t.body.position.z];
    }

    function knockOut(p) {
      const d = p.ball.data;
      if (finished) { ctx.spawn(p, safeTile()); return; } // celebrating: just pop back up
      d.out = true; d.outAt = elapsed;
      outOrder.push(p);
      ctx.fx.splash(p.ball.position);
      ctx.audio.splash();
      ctx.engine.addShake(0.25);
      p.ball.deactivate();
      ctx.buzz(p, 400);
      ctx.tell(p, "You're out!", 'Cheer on the others! 📣');
      const left = ctx.players.filter((o) => !o.ball.data.out).length;
      ctx.announce(`${p.name} is out!`, left > 1 ? `${left} balls left` : null, 1400);
      scores();
    }

    function finish() {
      running = false;
      finished = true;
      const alive = ctx.players.filter((p) => !p.ball.data.out);
      const groups = [];
      if (alive.length) groups.push(alive);
      for (let i = outOrder.length - 1; i >= 0; i--) groups.push([outOrder[i]]);
      ctx.end(groups);
    }

    return {
      start() { running = true; },

      onAction(p) {
        if (!running || p.ball.data.out) return;
        const i = ctx.input(p);
        if (p.ball.dash(i.x, i.y)) ctx.audio.whoosh();
      },

      update(dt) {
        for (const p of ctx.players) {
          if (!p.ball.data.out && p.ball.active && p.ball.position.y < lava.y + 0.5) knockOut(p);
        }
        if (!running) return;
        elapsed += dt;

        // Crumble faster as time goes on.
        dropTimer -= dt;
        if (dropTimer <= 0) {
          dropTimer = Math.max(0.35, 1.6 - elapsed * 0.03);
          crumble(elapsed > 25 ? 3 : 2);
        }

        if (solo) {
          ctx.setTimer(SOLO_TIME - elapsed);
          if (elapsed >= SOLO_TIME || ctx.players[0].ball.data.out) finish();
        } else {
          const alive = ctx.players.filter((p) => !p.ball.data.out);
          if (alive.length <= 1) finish();
        }
      },

      frame(dt) {
        lava.update(dt);
        for (const tile of tiles) {
          if (tile.state === 'warn') {
            tile.t -= dt;
            const flash = Math.sin(tile.t * 30) > 0;
            tile.mat.color.set(flash ? '#ff4d6d' : tile.color);
            tile.mesh.position.x = tile.body.position.x + (Math.random() - 0.5) * 0.06;
            tile.mesh.position.z = tile.body.position.z + (Math.random() - 0.5) * 0.06;
            if (tile.t <= 0) {
              tile.state = 'falling';
              tile.mat.color.copy(tile.color).multiplyScalar(0.7);
              ctx.level.removeBody(tile.body);
              tile.spin.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(4);
              ctx.audio.crumble();
            }
          } else if (tile.state === 'falling') {
            tile.vy -= 25 * dt;
            tile.mesh.position.y += tile.vy * dt;
            tile.mesh.rotation.x += tile.spin.x * dt;
            tile.mesh.rotation.z += tile.spin.z * dt;
            if (tile.mesh.position.y < lava.y - 2) { tile.state = 'gone'; tile.mesh.visible = false; }
          }
        }
      },

      onPlayerLeave(p) {
        if (!p.ball.data.out) knockOut(p);
      },
    };
  },
};
