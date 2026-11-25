# Ball Brawl 🔴

A tilt-your-phone party game. The TV/laptop is the arena, and every player is a ball controlled by tilting their phone.
It's plain HTML/JS with no build step: Three.js for rendering, cannon-es for physics, and PeerJS (WebRTC) for peer-to-peer networking.

## Play

1. Open `index.html` on the big screen (your GitHub Pages URL).
2. Players scan the QR code (or open `join.html` and type the room code), then pick a name, color and hat.
3. Players tap **Join**, which also asks for tilt permission on iPhone, then hold the phone comfortably and tap to set neutral.
4. The VIP (first phone to join, marked ⭐) or the TV picks a game and hits **Start**.

No phones handy? Click **⌨ Add keyboard player** on the TV (WASD / Arrows / IJKL; Space / Enter / U to boost),
or open `index.html?kb=2`.

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
js/shared/cosmetics.js     colors + hats catalog (phone and TV)
js/net/                    PeerJS wrappers: hostNet (TV), clientNet (phone), protocol (message shapes)
js/controller/             phone: tilt.js (sensor → stick, calibration, touch fallback), main.js (screens)
js/host/main.js            TV state machine: lobby → intro → playing → results → winner
js/host/engine.js          Three.js scene, cannon world, fixed-step loop, camera, level containers
js/host/ball.js            player ball: physics, rolling mesh, googly eyes, hat, label, trail, dash
js/host/{fx,audio,ui,hats,keyboard}.js   particles, synth SFX, DOM overlays, hat models, test keyboard input
js/games/index.js          ← the game list (add/remove games here)
js/games/_template.js      ← copy this to make a new mini-game (documents the whole ctx API)
js/games/helpers.js        lava, platforms, boxes, spawn rings, ranking helpers
js/games/lobby.js          the lobby is just a mini-game that never ends
js/games/bumpArena.js      knock others into lava, most KOs wins
js/games/lastBallRolling.js  crumbling tile floor, last ball standing
```

### Adding a mini-game

1. Copy `js/games/_template.js` to `js/games/myGame.js` and change `id`/`name`.
2. Build your level in `create(ctx)` with `ctx.level.add(mesh, body)` (it's cleaned up automatically).
3. Call `ctx.end([[winners], [second], ...])` when the round is over.
4. Import it in `js/games/index.js` and add it to `GAMES`.

Main applies tilt to every ball automatically. Change the feel per game with `p.ball.tuning.force`, `.maxSpeed`, etc.

### Networking notes

- The TV registers a PeerJS id `ballbrawl-v1-<CODE>` on the free public PeerJS server (used only for the handshake).
- Each phone opens one WebRTC connection: a reliable JSON channel for events, plus a **negotiated unordered,
  zero-retransmit channel** for tilt (`"x,y"` at 60 Hz), so a lost packet never stalls input.
- Phones reconnect with a stored client id, so a dropped player keeps their score.
- Strict networks (some corporate/school Wi-Fi) may need a TURN server: add it under `CONFIG.peerOptions.config.iceServers`.

## Ideas / TODO

- Ball Race (drifty obstacle course), Collect-a-thon (glowing orbs)
- Unlockable hats/skins (`locked` flag already exists in `cosmetics.js`)
- Music, per-game camera follow, team modes
