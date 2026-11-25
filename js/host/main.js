// TV / host entry point: players, phases (lobby -> intro -> playing -> results -> ...), and glue.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { COLORS, HATS } from '../shared/cosmetics.js';
import { HostNet } from '../net/hostNet.js';
import { Engine } from './engine.js';
import { Ball } from './ball.js';
import { Fx, WORDS, pick } from './fx.js';
import { Sfx } from './audio.js';
import { HostUI, placeLabel } from './ui.js';
import { Keyboard } from './keyboard.js';
import { GAMES, LOBBY, gameById } from '../games/index.js';

const engine = new Engine(document.getElementById('stage'));
const fx = new Fx(engine.scene);
const audio = new Sfx();

const players = new Map(); // id -> player
let joinCounter = 0;
const match = { round: 0, rounds: CONFIG.roundsPerMatch, selected: 'random', lastGame: null };
let phase = 'lobby'; // lobby | intro | playing | results | winner
let current = null;  // { def, ctx, inst }
let timers = [];

const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const playerList = () => [...players.values()].sort((a, b) => a.order - b.order);
const vip = () => playerList().find((p) => p.connected && !p.keyboard) || null;

// ---------------------------------------------------------------- UI + input
const ui = new HostUI({
  onPick(id) { match.selected = id; refreshLobby(); sendPhaseAll(); },
  onStart: () => startRound(),
  onAddKeyboard: () => addKeyboardPlayer(),
  onRounds(n) { match.rounds = Math.max(1, n | 0); refreshLobby(); },
  onSkip: () => advance(),
  onKick: (id, ban) => kickPlayer(id, ban),
});
const kb = new Keyboard((pid) => onAction(players.get(pid)));
const unlockAudio = () => { audio.unlock(); document.getElementById('sound-hint')?.remove(); };
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// ---------------------------------------------------------------- players
function cleanName(s) {
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12) || 'Ball';
}

function makePlayer({ id, name, color, hat, client = null, keyboard = false }) {
  const used = new Set(playerList().map((p) => p.color));
  if (!COLORS.includes(color) || used.has(color)) color = COLORS.find((c) => !used.has(c)) || COLORS[0];
  const p = {
    id, name: cleanName(name), color,
    hat: HATS.some((h) => h.id === hat) ? hat : 'none',
    client, keyboard, connected: true,
    score: 0, order: joinCounter++,
    input: { x: 0, y: 0 },
    status: null, removeTimer: null,
  };
  p.ball = new Ball(engine, p, onBallHit);
  players.set(id, p);
  return p;
}

function removePlayer(p) {
  if (!players.has(p.id)) return;
  current?.inst.onPlayerLeave?.(p);
  if (current) {
    const i = current.ctx.players.indexOf(p);
    if (i >= 0) current.ctx.players.splice(i, 1);
  }
  p.ball.dispose();
  players.delete(p.id);
  if (p.keyboard) kb.release(p.id);
  else net.forget(p.id);
  refreshLobby();
  sendPhaseAll();
}

function kickPlayer(id, ban) {
  const p = players.get(id);
  if (!p) return;
  if (!p.keyboard) net.kick(p.id, ban);
  ui.toast(ban ? `${p.name} was banned` : `${p.name} was removed`);
  removePlayer(p);
}

function addToLobby(p) {
  if (phase === 'lobby' && current && !current.ctx.players.includes(p)) {
    current.ctx.players.push(p);
    current.inst.onPlayerJoin?.(p);
  }
}

function addKeyboardPlayer() {
  const id = 'kb-' + Math.random().toString(36).slice(2, 7);
  const claim = kb.claim(id);
  if (!claim) { ui.toast('All keyboard slots are taken'); return; }
  if (players.size >= CONFIG.maxPlayers) { kb.release(id); ui.toast('Room is full'); return; }
  const p = makePlayer({ id, name: claim.layout.name.replace(/Keys \((.*)\)/, '$1'), color: null, hat: 'none', keyboard: true });
  p.kbSlot = claim.slot;
  ui.toast(`${claim.layout.name} player added. ${claim.layout.action} = boost`);
  if (phase !== 'lobby') p.status = { title: 'Hang tight!', text: "You'll join next round." };
  addToLobby(p);
  refreshLobby();
}

// ---------------------------------------------------------------- network
const net = new HostNet({
  onJoin(client, isReconnect, hello) {
    let p = players.get(client.id);
    if (p) {
      const wasAway = !p.connected;
      p.client = client;
      p.connected = true;
      clearTimeout(p.removeTimer);
      if (wasAway) {
        ui.toast(`${p.name} is back!`);
        if (phase === 'lobby' && current && !p.ball.active) current.inst.onPlayerJoin?.(p);
        else if (current && current.ctx.players.includes(p)) current.inst.onPlayerReturn?.(p);
      }
    } else {
      if (players.size >= CONFIG.maxPlayers) {
        client.send({ t: 'phase', phase: 'full', title: 'Room is full', text: 'Wait for the next match!' });
        return;
      }
      p = makePlayer({ id: client.id, name: hello.name, color: hello.color, hat: hello.hat, client });
      ui.toast(`${p.name} joined!`);
      if (phase !== 'lobby') p.status = { title: 'Hang tight!', text: "You'll join next round." };
      addToLobby(p);
    }
    client.send({ t: 'welcome', playerId: p.id, color: p.color });
    refreshLobby();
    sendPhaseAll(); // VIP may have changed
  },
  onLeave(client) {
    const p = players.get(client.id);
    if (!p) return;
    p.connected = false;
    p.input = { x: 0, y: 0 };
    ui.toast(`${p.name} disconnected`);
    if (current && current.ctx.players.includes(p)) {
      current.inst.onPlayerLeave?.(p);
      if (p.ball.active) { fx.poof(p.ball.position); p.ball.deactivate(); }
    }
    if (phase === 'lobby') scheduleRemoval(p);
    refreshLobby();
    sendPhaseAll();
  },
  onBye(client) {
    // Left on purpose (Leave button / closed the tab): remove right away.
    const p = players.get(client.id);
    if (!p) return;
    ui.toast(`${p.name} left`);
    if (p.ball.active) fx.poof(p.ball.position);
    removePlayer(p);
  },
  onMessage(client, msg) {
    const p = players.get(client.id);
    if (!p) return;
    if (msg.t === 'action') onAction(p);
    else if (msg.t === 'vip' && p === vip() && phase === 'lobby') {
      if (msg.cmd === 'pick' && (msg.game === 'random' || gameById(msg.game))) { match.selected = msg.game; refreshLobby(); sendPhaseAll(); }
      if (msg.cmd === 'start') startRound();
    }
  },
  onInput(client, x, y) {
    const p = players.get(client.id);
    if (p) { p.input.x = x; p.input.y = y; }
  },
});

function scheduleRemoval(p) {
  clearTimeout(p.removeTimer);
  p.removeTimer = setTimeout(() => { if (!p.connected && phase === 'lobby') removePlayer(p); }, CONFIG.lobbyDisconnectGraceMs);
}

function onAction(p) {
  if (!p || !current || !current.ctx.players.includes(p)) return;
  if (phase === 'lobby' || phase === 'playing') current.inst.onAction?.(p);
}

// ---------------------------------------------------------------- phone status
function setStatus(p, title, text) { p.status = { title, text }; sendPhase(p); }

function sendPhase(p) {
  if (!p.client || !p.connected) return;
  const isVip = phase === 'lobby' && vip() === p;
  let { title, text } = p.status || {};
  if (phase === 'lobby') {
    title = "You're in!";
    text = isVip ? '' : `Roll around while ${vip() ? vip().name : 'the host'} picks a game.`;
  }
  const playing = current && current.ctx.players.includes(p);
  p.client.send({
    t: 'phase', phase, title, text,
    action: playing && phase !== 'results' && phase !== 'winner' ? current.def.actionLabel || null : null,
    vip: isVip,
    games: isVip ? [{ id: 'random', name: '🎲 Random' }, ...GAMES.map((g) => ({ id: g.id, name: `${g.emoji || ''} ${g.name}` }))] : undefined,
    selected: match.selected,
  });
}
const sendPhaseAll = () => players.forEach(sendPhase);

function refreshLobby() {
  ui.renderLobby({
    players: playerList(), games: GAMES, selected: match.selected,
    round: match.round, rounds: match.rounds, vipId: vip()?.id,
    canStart: phase === 'lobby' && players.size > 0,
  });
}

// ---------------------------------------------------------------- game loading
function makeCtx(def, level, participants) {
  const ctx = {
    def, engine, level, fx, audio, THREE, CANNON,
    players: participants,
    spawn(p, pos, yaw) { p.ball.spawn(pos, yaw); return p.ball; },
    input: (p) => p.input,
    tell: (p, title, text) => setStatus(p, title, text),
    tellAll: (title, text) => participants.forEach((p) => setStatus(p, title, text)),
    buzz: (p, ms) => p.client?.send({ t: 'buzz', ms }),
    announce: (big, small, ms) => ui.announce(big, small, ms),
    setTimer: (s) => ui.setTimer(s),
    setScores: (rows) => ui.setScores(rows),
    end: (groups) => { if (current && current.ctx === ctx) endRound(groups); },
  };
  return ctx;
}

function loadGame(def, participants) {
  unloadGame();
  for (const p of participants) { p.ball.tuning = { ...CONFIG.ball }; p.ball.data = {}; }
  const level = engine.createLevel();
  const ctx = makeCtx(def, level, participants);
  current = { def, ctx, inst: {} };
  current.inst = def.create(ctx) || {};
}

function unloadGame() {
  if (!current) return;
  try { current.inst.dispose?.(); } catch (e) { console.error(e); }
  current.ctx.level.dispose();
  for (const p of players.values()) p.ball.deactivate();
  current = null;
  ui.setScores(null);
  ui.setTimer(null);
}

// ---------------------------------------------------------------- phases
function enterLobby() {
  clearTimers();
  engine.timeScale = 1;
  phase = 'lobby';
  ui.hideResults(); ui.hideWinner(); ui.hideIntro();
  ui.setHud(null);
  ui.showLobby(true);
  engine.follow(null);
  loadGame(LOBBY, playerList());
  for (const p of players.values()) { p.status = null; if (!p.connected) scheduleRemoval(p); }
  refreshLobby();
  sendPhaseAll();
}

function pickGame() {
  if (match.selected !== 'random') return gameById(match.selected) || GAMES[0];
  const pool = GAMES.filter((g) => g.id !== match.lastGame);
  return (pool.length ? pool : GAMES)[Math.floor(Math.random() * (pool.length || GAMES.length))];
}

function startRound() {
  if (phase !== 'lobby') return;
  const participants = playerList().filter((p) => p.connected);
  if (!participants.length) { ui.toast('Need at least one player! Scan the QR code to join.'); return; }
  const def = pickGame();
  if (participants.length < (def.minPlayers || 1)) { ui.toast(`${def.name} needs ${def.minPlayers} players`); return; }
  match.lastGame = def.id;

  clearTimers();
  phase = 'intro';
  ui.showLobby(false);
  ui.setHud(def.name);
  engine.follow(null);
  loadGame(def, participants);
  for (const p of players.values()) {
    p.status = participants.includes(p) ? { title: def.name, text: def.howTo } : { title: 'Hang tight!', text: "You'll join next round." };
  }
  sendPhaseAll();
  ui.showIntro(def);
  ui.setCountdown('');

  let n = 3;
  const tick = () => {
    if (n > 0) { ui.setCountdown(n); audio.beep(); n--; later(800, tick); return; }
    ui.setCountdown('GO!');
    audio.beep(true);
    phase = 'playing';
    current.inst.start?.();
    sendPhaseAll();
    later(700, () => ui.hideIntro());
  };
  later(2600, tick); // time to read the instructions first
}

function endRound(groups) {
  if (phase !== 'playing') return;
  phase = 'results';
  clearTimers();
  // Normalize: [[a],[b,c]] or [a,b,c] -> groups of still-present players.
  groups = (groups || []).map((g) => (Array.isArray(g) ? g : [g]).filter((p) => players.has(p.id))).filter((g) => g.length);

  const rows = [];
  let place = 0;
  for (const g of groups) {
    const pts = CONFIG.placementPoints[place] ?? 0;
    for (const p of g) {
      p.score += pts;
      rows.push({ player: p, placeLabel: placeLabel(place), gain: pts });
      setStatus(p, place === 0 ? 'You won the round! 🎉' : `You placed #${place + 1}`, pts ? `+${pts} points · ${p.score} total` : `${p.score} points total`);
      if (place === 0) p.client?.send({ t: 'buzz', ms: 200 });
    }
    place += g.length;
  }

  const winners = groups[0] || [];
  zoomOn(winners);
  ui.announce(winners.length ? `${winners.map((p) => p.name).join(' & ')} wins!` : 'Round over!', null, 1800);
  audio.fanfare();
  fx.confetti(new THREE.Vector3(0, 10, 0), 90);
  engine.timeScale = 0.35; // dramatic slow-mo
  later(1300, () => { engine.timeScale = 1; });

  match.round++;
  const last = match.round >= match.rounds;
  later(1800, () => ui.showResults(`${current.def.name}: results`, rows,
    last ? 'Final round done! Crowning the champion…' : `Round ${match.round} of ${match.rounds} · Tap to continue`));
  later(8500, advance);
  sendPhaseAll();
}

function advance() {
  if (phase === 'results') {
    if (match.round >= match.rounds) showWinner();
    else enterLobby();
  } else if (phase === 'winner') {
    for (const p of players.values()) p.score = 0;
    match.round = 0;
    enterLobby();
  }
}

function showWinner() {
  clearTimers();
  phase = 'winner';
  ui.hideResults();
  const sorted = playerList().sort((a, b) => b.score - a.score);
  const top = sorted.length ? sorted[0].score : 0;
  const winners = sorted.filter((p) => p.score === top);
  let place = 0;
  const rows = sorted.map((p, i) => {
    if (i > 0 && p.score < sorted[i - 1].score) place = i;
    return { player: p, placeLabel: placeLabel(place) };
  });
  ui.showWinner(winners, rows);
  // Everyone goes to the lobby arena; the camera zooms on the champion(s), who can roll around.
  ui.setHud(null);
  loadGame(LOBBY, playerList().filter((p) => p.connected));
  winners.forEach((p, i) => p.ball.spawn([(i - (winners.length - 1) / 2) * 1.5, 3, 0]));
  zoomOn(winners);
  audio.fanfare();
  fx.confetti(new THREE.Vector3(0, 12, 0), 220);
  later(1500, () => fx.confetti(new THREE.Vector3(0, 12, 0), 150));
  for (const p of players.values()) {
    const r = rows.find((x) => x.player === p);
    setStatus(p, winners.includes(p) ? '🏆 CHAMPION! 🏆' : `You finished ${r ? r.placeLabel : ''}`, `${p.score} points. GG!`);
  }
  later(14000, advance);
}

/** Camera follows these players closely (winner celebration). */
function zoomOn(list) {
  const targets = list.filter((p) => players.has(p.id));
  if (!targets.length) return;
  engine.follow(() => targets.filter((p) => p.ball.active).map((p) => p.ball.position), { min: 6, max: 14, pad: 1, dir: [0.35, 0.55, 0.75], speed: 0.2 });
}

// ---------------------------------------------------------------- physics events
function onBallHit(ball, otherBody, impact, normal) {
  if (!current) return;
  const other = otherBody.ball;
  if (other) {
    if (ball.body.id > other.body.id || impact < 0.8) return; // handle each pair once
    const I = Math.min(impact, 14) * ball.tuning.bonkBoost;
    ball.body.applyImpulse(new CANNON.Vec3(-normal.x * I, 0.12 * I, -normal.z * I));
    other.body.applyImpulse(new CANNON.Vec3(normal.x * I, 0.12 * I, normal.z * I));
    const k = Math.min(1, impact / 10);
    if (impact > 2) { ball.stagger(0.15 + k * 0.35); other.stagger(0.15 + k * 0.35); }
    if (impact > 1.5) {
      ball.poke(k * 0.6); other.poke(k * 0.6);
      const mid = new THREE.Vector3().addVectors(ball.position, other.position).multiplyScalar(0.5);
      fx.burst(mid, '#ffffff', { count: 4 + Math.round(k * 8), speed: 3 + k * 4, up: 2, size: 0.08, life: 0.4 });
      if (impact > 10) {
        // Huge head-on hit: KABOOM!
        fx.explosion(mid);
        fx.popText(mid, pick(WORDS.boom), '#ff4d6d', 1.5);
        audio.boom();
        engine.addShake(0.4);
      } else if (impact > 6) {
        audio.bonk(k);
        fx.popText(mid, pick(WORDS.big), '#ffd60a', 1.2);
        engine.addShake(0.15 * k);
      } else if (impact > 3) {
        audio.bonk(k);
        fx.popText(mid, pick(WORDS.bonk), '#ffffff', 0.8);
      } else audio.bonk(k);
      if (impact > 3) { ball.player.client?.send({ t: 'buzz', ms: 30 + k * 60 }); other.player.client?.send({ t: 'buzz', ms: 30 + k * 60 }); }
    }
    current.inst.onHit?.(ball, other, impact);
  } else if (otherBody.bounce) {
    // Bumpers / spinners: a body with .bounce = N launches you away with impulse N.
    const I = otherBody.bounce * ball.tuning.mass;
    ball.body.velocity.set(ball.body.velocity.x * 0.3, Math.max(0, ball.body.velocity.y), ball.body.velocity.z * 0.3);
    ball.body.applyImpulse(new CANNON.Vec3(-normal.x * I, I * 0.22, -normal.z * I));
    ball.stagger(0.6);
    ball.poke(0.5);
    audio.boing();
    fx.popText(ball.position, pick(WORDS.boing), '#4cc9f0', 1);
    fx.burst(ball.position, '#4cc9f0', { count: 10, speed: 5, up: 2, size: 0.1, life: 0.4 });
    engine.addShake(0.1);
    ball.player.client?.send({ t: 'buzz', ms: 60 });
    current.inst.onBodyHit?.(ball, otherBody, impact);
  } else if (otherBody.material === engine.mat.bouncy && impact > 1.5) {
    audio.bonk(Math.min(1, impact / 10));
    ball.poke(0.3);
  } else if (impact > 6) {
    audio.thud(Math.min(1, impact / 15));
    ball.poke(Math.min(0.4, impact / 25));
  }
}

// ---------------------------------------------------------------- main loop
function onFixed(dt) {
  for (const p of players.values()) if (p.keyboard) { const v = kb.read(p.kbSlot); p.input.x = v.x; p.input.y = v.y; }
  if (!current) return;
  const canMove = phase !== 'intro';
  for (const p of current.ctx.players) {
    const b = p.ball;
    if (!b.active) continue;
    b.step(dt);
    if (canMove && p.connected) b.applyInput(p.input.x, p.input.y, dt);
  }
  try { current.inst.update?.(dt); } catch (e) { console.error('[game update]', e); }
}

function onFrame(dt) {
  for (const p of players.values()) p.ball.frame(dt);
  try { current?.inst.frame?.(dt); } catch (e) { console.error('[game frame]', e); }
  fx.update(dt);
}

// ---------------------------------------------------------------- boot
enterLobby();
engine.start(onFixed, onFrame);

// ?kb=2 adds keyboard players on load (handy for testing).
const kbCount = +new URLSearchParams(location.search).get('kb') || 0;
for (let i = 0; i < kbCount; i++) addKeyboardPlayer();

(async () => {
  ui.setStatus('Opening room…');
  try {
    let saved = null;
    try { saved = sessionStorage.getItem('bb-room'); } catch {}
    const code = await net.open(saved);
    try { sessionStorage.setItem('bb-room', code); } catch {}
    const url = new URL(`join.html?room=${code}`, location.href).href;
    ui.setJoinInfo(code, url);
    ui.setStatus(location.protocol === 'https:' || location.hostname === 'localhost' ? '' : '⚠ Phones need HTTPS for tilt. Use the GitHub Pages URL.');
  } catch (e) {
    console.error(e);
    ui.setStatus(`Couldn't open a room (${e.type || e.message}). Check your internet and refresh.`);
  }
})();

// Closing the TV tab: tell phones the game is over and drop off the network.
window.addEventListener('pagehide', () => net.shutdown());

// Expose for console tinkering: window.bb.players, window.bb.engine ...
window.bb = { engine, players, match, fx, audio, get current() { return current; }, startRound, addKeyboardPlayer, kick: kickPlayer };
