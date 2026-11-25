# Ball Brawl 🔴

A tilt-your-phone party game. The TV/laptop is the arena, and every player is a ball controlled by tilting their phone.
It's plain HTML/JS with no build step: Three.js for rendering, cannon-es for physics, and PeerJS (WebRTC) for peer-to-peer networking.

## Play

1. Open `index.html` on the big screen (your GitHub Pages URL).
2. Players scan the QR code (or open `join.html` and type the room code), pick a name and color, then dress up
   their ball with the arrows next to its hat, eyes and body (plus a pattern). Drag the ball to spin it.
3. Players tap **Join**, which also asks for tilt permission on iPhone, then hold the phone comfortably and tap to set neutral.
4. The VIP (first phone to join, marked ⭐) or the TV picks a game (and a track/course for Ball Race and
   Mini Golf), picks the match length (**3/5/7/10 rounds** or **First to 3/5 wins**) and hits **Start**.

No phones handy? Click **⌨ Add keyboard player** on the TV (WASD / Arrows / IJKL; Space / Enter / U is the
button, used by Mini Golf: hold to charge, let go to putt), or open `index.html?kb=2`.

### The games

| Game | What you do |
| --- | --- |
| Bump Arena | Ram others into the lava. The faster ball wins the bonk. Most knockouts wins. |
| Last Ball Rolling | The floor crumbles from the edges. Last ball standing wins. |
| Tower Drop | Tiles vanish when touched; drop floor to floor. Last ball standing wins. |
| Ball Race | 3 tracks (Meadow Dash, Candy Canyon, Lava Leap) with boost pads, jump pads and obstacles. |
| Gem Grab | Collect the most gems (more gems with more players). Gold stars are worth 5; big hits make people spill. |
| Mini Golf | Everyone putts at once on one of 3 holes. Tilt to aim, hold to charge, let go. Fewest strokes wins. |

There's no boost button: speed is your weapon. Phones vibrate (Android) and flash (all phones) when you get hit,
fall, collect, boost or win.

## Deploy (GitHub Pages)

Push the folder to a repo → Settings → Pages → deploy from branch `main`, root folder. Done.
HTTPS is required for phone tilt sensors, and GitHub Pages provides it.

**Local testing:** run any static server (`npx serve .` or `python -m http.server`) and open `http://localhost:…`.
Phones on your Wi-Fi can't use tilt over plain `http://` (browsers block sensors), but they fall back to an on-screen
touch stick. For real tilt testing, use the Pages URL or an HTTPS tunnel.

## Code map

```
index.html / join.html     TV page / phone page
js/config.js               all tunables (ball feel, points, rounds, network)
js/cosmetics/catalog.js    colors, hats, eyes, outfits, patterns (the list both phone and TV use)
js/cosmetics/parts.js      3D builders for every hat / eyes / outfit
js/cosmetics/skins.js      ball patterns (painted textures)
js/cosmetics/avatar.js     a dressed-up ball (used by the TV and the phone preview)
js/net/                    PeerJS wrappers: hostNet (TV), clientNet (phone), protocol (message shapes)
js/controller/             phone: tilt.js (sensor → stick, calibration, touch fallback), main.js (screens),
                           preview.js (3D character preview on the join screen)
js/host/main.js            TV state machine: lobby → intro → playing → results → winner
js/host/engine.js          Three.js scene, cannon world, fixed-step loop, camera, level containers
js/host/ball.js            player ball: physics, rolling mesh, outfit, label, trail, launch(), coyote time
js/host/{fx,audio,ui,keyboard}.js   particles, synth SFX, DOM overlays, test keyboard input
js/games/index.js          ← the game list (add/remove games here)
js/games/_template.js      ← copy this to make a new mini-game (documents the whole ctx API)
js/games/helpers.js        platforms, tiles, boxes, spawn rings, ranking helpers
js/games/course.js         track pieces: sloped roads, corner joints, pads, sweepers, bumpers, pushers, arches, flags
js/games/lava.js           the animated lava sea (shader, embers, bubbles)
js/games/env.js            level themes: sky, clouds, birds, wind streaks, floating motes, scenery
js/games/lobby.js          the lobby is just a mini-game that never ends
js/games/bumpArena.js      knock others into lava, most KOs wins
js/games/lastBallRolling.js  crumbling tile floor, last ball standing
js/games/towerDrop.js      5 stacked floors, tiles vanish when touched, follow camera
js/games/ballRace.js       3 race tracks (tracks are data at the top of the file)
js/games/gemGrab.js        collect gems, scaled to the player count
js/games/miniGolf.js       3 mini golf holes (holes are data at the top of the file)
img/thumbs/                pictures on the TV game picker (<game-id>.jpg and <game-id>-<map-id>.jpg)
```

### Moderating

Hover a player chip in the lobby: **✕** kicks them (they can rejoin), **⛔** bans them from this room.
Phones that close the tab or press **Leave** disappear right away. Phones that just go silent
(locked screen, lost Wi-Fi) are hidden after 4 seconds and removed after 10 unless they come back.
Closing the TV tab ends the room for everyone, since nothing runs on a server.

### Adding a mini-game

1. Copy `js/games/_template.js` to `js/games/myGame.js` and change `id`/`name`.
2. Build your level in `create(ctx)` with `ctx.level.add(mesh, body)` (it's cleaned up automatically).
3. Call `ctx.end([[winners], [second], ...])` when the round is over.
4. Import it in `js/games/index.js` and add it to `GAMES`.

Main applies tilt to every ball automatically. Change the feel per game with `p.ball.tuning.maxSpeed`, `.accel`, etc.
Want a bumper that launches balls? Give any physics body a `bounce` value (e.g. `body.bounce = 12`).
`ctx.engine.follow(() => positions)` makes the camera auto-frame a set of balls.
Pick a look with `theme: 'meadow' | 'volcano' | 'candy' | 'skytower'` (or add one in `env.js`).
Several maps? Add `maps: [{ id, name, theme }]` to the game and read `ctx.map` in `create()`; the TV shows a map picker.
Use the phone button with `actionLabel`, `onAction(p)` (pressed) and `onActionUp(p)` (released).
Phone feedback: `ctx.feel(p, 'hit' | 'bighit' | 'out' | 'win' | 'collect' | 'boost' | 'sink')`.
Thumbnail: drop a 16:9 picture at `img/thumbs/<id>.jpg` (the emoji shows if it's missing).

**Slow-mo finishes:** return `contenders()` (players still in), `lavaY` and `floorBottom` (the underside of the
lowest floor) from `create()`. When a fall would decide the round, the TV sweeps the ball's whole body along its
flight path; only if it's below every floor and nothing at all is in the way of the lava does it slow time, zoom in
on the faller, then swing to the winner.
For races, call `ctx.dramatic(player)` when someone is about to cross the line.

**Adding a cosmetic:** add `{ id, name }` to the list in `js/cosmetics/catalog.js`, then a builder with the same
id in `js/cosmetics/parts.js` (or a painter in `skins.js` for a pattern).

### Networking notes

- The TV registers a PeerJS id `ballbrawl-v1-<CODE>` on the free public PeerJS server (used only for the handshake).
- Each phone opens one WebRTC connection: a reliable JSON channel for events, plus a **negotiated unordered,
  zero-retransmit channel** for tilt (`"x,y"` at 60 Hz), so a lost packet never stalls input.
- Phones reconnect with a stored client id, so a dropped player keeps their score.
- Strict networks (some corporate/school Wi-Fi) may need a TURN server: add it under `CONFIG.peerOptions.config.iceServers`.

## Screenshots

`screenshots/` has sheets of every hat, eyes, outfit and pattern. They aren't used by the game, so you don't need to upload them.

## Ideas / TODO

- Music (your own tracks: one loop per theme)
- Croquet (reuses the Mini Golf aiming)
- Team modes
