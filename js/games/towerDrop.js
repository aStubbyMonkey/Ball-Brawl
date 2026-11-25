// TOWER DROP: five stacked tile floors over lava. Every tile you roll over flashes
// and falls away a moment later, so you drop through the holes to the floor below.
// Fall off the bottom floor and you're out. Last ball standing wins.
// The camera zooms in and out to keep every ball in view.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makeLava, ringSpawns } from './helpers.js';

const TILE = 1.6;
const GAP = 0.06;
const LAYERS = 5;
const SPACING = 4.5;      // vertical distance between floors
const FUSE = 0.55;        // seconds between touching a tile and it falling
const SOLO_TIME = 90;
const LAYER_COLORS = [
  ['#ffadad', '#ffd6a5'], ['#fdffb6', '#caffbf'], ['#9bf6ff', '#a0c4ff'],
  ['#bdb2ff', '#ffc6ff'], ['#ffd6e0', '#c1fba4'],
];

export default {
  id: 'tower-drop',
  name: 'Tower Drop',
  emoji: '🏗️',
  tagline: 'Floors vanish under you. Drop, drop, drop!',
  howTo: 'Tilt to roll. Every tile you touch falls away, so keep moving! Drop through the holes to the floor below. Fall off the last floor and you are out. Last ball standing wins!',
  actionLabel: 'BOOST!',
  minPlayers: 1,

  create(ctx) {
    const n = ctx.players.length;
    const RADIUS = Math.min(10.5, 6.5 + n * 0.45);
    const topY = (layer) => (LAYERS - 1 - layer) * SPACING; // layer 0 = top floor
    const lava = makeLava(ctx, -4);

    // ---- build the floors ----
    const geo = new THREE.BoxGeometry(TILE - GAP, 0.5, TILE - GAP);
    const tiles = new Map(); // "layer:i:j" -> tile
    const layerTiles = [...Array(LAYERS)].map(() => []);
    const cells = Math.ceil(RADIUS / TILE);
    for (let L = 0; L < LAYERS; L++) {
      const y = topY(L);
      const r = RADIUS - L * 0.4; // slightly smaller toward the bottom
      for (let i = -cells; i <= cells; i++) for (let j = -cells; j <= cells; j++) {
        const x = i * TILE, z = j * TILE;
        if (Math.hypot(x, z) > r) continue;
        const color = new THREE.Color(LAYER_COLORS[L % LAYER_COLORS.length][(i + j + 100) % 2]);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y - 0.25, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: ctx.engine.mat.ground });
        body.addShape(new CANNON.Box(new CANNON.Vec3(TILE / 2, 0.25, TILE / 2)));
        body.position.set(x, y - 0.25, z);
        ctx.level.add(mesh, body);
        const tile = { mesh, body, mat, color, layer: L, state: 'solid', t: 0, vy: 0, spin: new THREE.Vector3() };
        tiles.set(`${L}:${i}:${j}`, tile);
        layerTiles[L].push(tile);
      }
    }

    // ---- players start on the top floor ----
    const spawns = ringSpawns(n, Math.min(RADIUS - 2, 1.5 + n * 0.45), topY(0) + 1);
    ctx.players.forEach((p, i) => {
      p.ball.data = { out: false, layer: 0 };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    // Camera frames all balls that are still in, zooming as they spread out or drop.
    const alivePositions = () => ctx.players.filter((p) => p.ball.active && !p.ball.data.out).map((p) => p.ball.position);
    ctx.engine.setCamera({ pos: [0, topY(0) + 22, 18], look: [0, topY(0), 0], instant: true });
    ctx.engine.follow(alivePositions, { min: 13, max: 34, pad: 3, dir: [0, 0.8, 0.6], speed: 0.25 });

    const solo = n === 1;
    let running = false, finished = false, elapsed = 0;
    const outOrder = [];
    const scores = () => ctx.setScores(ctx.players.map((p) => ({
      player: p, value: p.ball.data.out ? '💧' : `Floor ${Math.min(LAYERS, p.ball.data.layer + 1)}`, out: p.ball.data.out,
    })));
    scores();
    ctx.setTimer(solo ? SOLO_TIME : null);

    function tileUnder(ball) {
      const p = ball.position;
      const feet = p.y - ball.radius;
      const L = Math.round((topY(0) - feet) / SPACING);
      if (L < 0 || L >= LAYERS || Math.abs(feet - topY(L)) > 0.35) return null;
      return tiles.get(`${L}:${Math.round(p.x / TILE)}:${Math.round(p.z / TILE)}`) || null;
    }

    function safeSpot() {
      for (let L = 0; L < LAYERS; L++) {
        const solid = layerTiles[L].filter((t) => t.state === 'solid');
        if (solid.length) { const t = solid[Math.floor(Math.random() * solid.length)]; return [t.body.position.x, topY(L) + 2, t.body.position.z]; }
      }
      return [0, topY(LAYERS - 1) + 2, 0];
    }

    function knockOut(p) {
      if (finished) { ctx.spawn(p, safeSpot()); return; } // celebrating: pop back up
      const d = p.ball.data;
      d.out = true;
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

    let lastFade = -1;
    function fadeUpperFloors() {
      // Floors above the highest ball turn see-through so you can watch the action below.
      const ys = alivePositions().map((p) => p.y);
      const highest = ys.length ? Math.max(...ys) : topY(0);
      const firstVisible = Math.max(0, Math.min(LAYERS - 1, Math.floor((topY(0) - highest + 1.5) / SPACING)));
      if (firstVisible === lastFade) return;
      lastFade = firstVisible;
      for (let L = 0; L < LAYERS; L++) {
        const faded = L < firstVisible;
        for (const t of layerTiles[L]) {
          if (t.state === 'falling' || t.state === 'gone') continue;
          t.mat.opacity = faded ? 0.12 : 1;
          t.mat.depthWrite = !faded;
          t.mesh.castShadow = !faded;
        }
      }
    }

    return {
      start() { running = true; },

      onAction(p) {
        if (p.ball.data.out) return;
        const i = ctx.input(p);
        if (p.ball.dash(i.x, i.y)) ctx.audio.whoosh();
      },

      update(dt) {
        for (const p of ctx.players) {
          const b = p.ball;
          if (!b.active || b.data.out) continue;
          if (b.position.y < lava.y + 0.5) { knockOut(p); continue; }
          const t = tileUnder(b);
          if (t) {
            if (t.layer !== b.data.layer) { b.data.layer = t.layer; scores(); if (running) ctx.fx.popText(b.position, 'DROP!', '#9bf6ff', 0.8); }
            // Tiles only start crumbling once the round is on.
            if (running && t.state === 'solid') { t.state = 'warn'; t.t = FUSE; }
          }
        }
        if (!running) return;
        elapsed += dt;
        if (solo) {
          ctx.setTimer(SOLO_TIME - elapsed);
          if (elapsed >= SOLO_TIME || ctx.players[0].ball.data.out) finish();
        } else if (ctx.players.filter((p) => !p.ball.data.out).length <= 1) finish();
      },

      frame(dt) {
        lava.update(dt);
        fadeUpperFloors();
        for (const tile of layerTiles.flat()) {
          if (tile.state === 'warn') {
            tile.t -= dt;
            tile.mat.color.set(Math.sin(tile.t * 40) > 0 ? '#ffffff' : '#ff4d6d');
            tile.mesh.position.y = tile.body.position.y + (Math.random() - 0.5) * 0.05;
            if (tile.t <= 0) {
              tile.state = 'falling';
              tile.mat.color.copy(tile.color).multiplyScalar(0.7);
              ctx.level.removeBody(tile.body);
              tile.spin.set(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(5);
              if (Math.random() < 0.3) ctx.audio.crumble();
            }
          } else if (tile.state === 'falling') {
            tile.vy -= 25 * dt;
            tile.mesh.position.y += tile.vy * dt;
            tile.mesh.rotation.x += tile.spin.x * dt;
            tile.mesh.rotation.z += tile.spin.z * dt;
            tile.mat.opacity = Math.max(0, tile.mat.opacity - dt * 1.5);
            if (tile.mesh.position.y < lava.y - 2 || tile.mat.opacity <= 0) { tile.state = 'gone'; tile.mesh.visible = false; }
          }
        }
      },

      onPlayerLeave(p) { if (!p.ball.data.out) knockOut(p); },
    };
  },
};
