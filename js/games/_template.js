// MINI-GAME TEMPLATE. Copy this file, rename it, and register it in games/index.js.
//
// A mini-game is a plain object with some info plus create(ctx), which builds the level
// and returns hooks. Every hook is optional.
//
// ctx gives you:
//   ctx.engine        Engine (ctx.engine.time, setCamera, addShake, mat.{ground,ball,bouncy,ice})
//   ctx.level         level.add(mesh, body) / addBody / removeBody. All auto-removed when the round ends
//   ctx.players       players in this round; each has .name .color .ball (see host/ball.js)
//   ctx.spawn(p, [x,y,z], yaw)   place/activate a player's ball
//   ctx.input(p)      current tilt {x, y}
//   ctx.fx            burst / splash / poof / confetti / popText
//   ctx.audio         bonk / splash / pickup / whoosh / beep / fanfare ...
//   ctx.tell(p, title, text)     update that player's phone screen
//   ctx.buzz(p, ms)   vibrate their phone (Android)
//   ctx.announce(big, small, ms) big text on the TV
//   ctx.setTimer(seconds|null)   HUD timer
//   ctx.setScores([{player, value, out}] | null)   HUD scoreboard for this round
//   ctx.end(groups)   finish the round. groups = [[1st place players], [2nd], ...]
//
// The main loop applies tilt to every active ball for you (tweak p.ball.tuning to change feel).
import * as THREE from 'three';
import { makeDisc, ringSpawns, rankGroups } from './helpers.js';

export default {
  id: 'my-game',
  name: 'My Game',
  emoji: '🎈',
  tagline: 'One line shown in the picker',
  howTo: 'Shown on the phones and TV during the countdown.',
  actionLabel: 'BOOST!', // phone button text, or null to hide it
  minPlayers: 1,

  create(ctx) {
    ctx.engine.setCamera({ pos: [0, 18, 15], look: [0, 0, 0] });
    makeDisc(ctx, 8);

    const spawns = ringSpawns(ctx.players.length, 4);
    ctx.players.forEach((p, i) => {
      p.ball.data = { points: 0 };
      ctx.spawn(p, spawns[i].pos, spawns[i].yaw);
    });

    let timeLeft = 30, running = false;

    return {
      start() { running = true; },                  // countdown finished
      update(dt) {                                  // fixed 60Hz step
        if (!running) return;
        timeLeft -= dt;
        ctx.setTimer(timeLeft);
        if (timeLeft <= 0) { running = false; ctx.end(rankGroups(ctx.players, (p) => p.ball.data.points)); }
      },
      frame(dt) {},                                 // per rendered frame (animations)
      onAction(p) { const i = ctx.input(p); p.ball.dash(i.x, i.y); },
      onHit(ballA, ballB, impact) {},               // two balls collided
      onPlayerLeave(p) {},
      dispose() {},                                 // anything not in ctx.level
    };
  },
};
