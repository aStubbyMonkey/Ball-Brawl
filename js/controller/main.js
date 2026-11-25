// Phone controller: join form -> connect -> calibrate -> play.
import { CONFIG } from '../config.js';
import { COLORS, CATALOG, DEFAULT_LOOK, validItem, itemName } from '../cosmetics/catalog.js';
import { ClientNet } from '../net/clientNet.js';
import { Tilt, TouchStick } from './tilt.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem('bb-' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('bb-' + k, v); } catch {} },
};

const state = {
  room: (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4),
  name: store.get('name', ''),
  color: store.get('color', COLORS[Math.floor(Math.random() * COLORS.length)]),
  hat: validItem('hat', store.get('hat', DEFAULT_LOOK.hat)),
  eyes: validItem('eyes', store.get('eyes', DEFAULT_LOOK.eyes)),
  outfit: validItem('outfit', store.get('outfit', DEFAULT_LOOK.outfit)),
  skin: validItem('skin', store.get('skin', DEFAULT_LOOK.skin)),
  clientId: store.get('client-id', null),
  useTouch: false,
  tiltOk: false,
  phase: null,
  selectedGame: null,
  kicked: false,
};
if (!state.clientId) {
  state.clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('client-id', state.clientId);
}

const tilt = new Tilt();
const stick = new TouchStick($('stick'), $('stick-knob'));
const net = new ClientNet({ onMessage, onClose });

// ---------- screens ----------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  // The 3D preview only runs while you're on the join screen (saves battery while playing).
  if (id === 'screen-join') preview?.resume(); else preview?.pause();
}

// ---------- join form ----------
function renderForm() {
  $('room').value = state.room;
  $('name').value = state.name;
  const hasRoom = state.room.length === 4;
  $('room-field').classList.toggle('hidden', hasRoom);
  $('room-pill').classList.toggle('hidden', !hasRoom);
  $('room-pill-code').textContent = state.room;

  $('colors').innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === state.color ? ' sel' : '');
    b.style.background = c;
    b.ariaLabel = 'color ' + c;
    b.onclick = () => { state.color = c; renderForm(); updatePreview(); };
    $('colors').appendChild(b);
  }
  renderLookText();
}

// ---------- character customizer ----------
const look = () => ({ color: state.color, hat: state.hat, eyes: state.eyes, outfit: state.outfit, skin: state.skin });
let preview = null;
// Loaded lazily so the join form still works if 3D isn't available.
import('./preview.js')
  .then((m) => { preview = m.createPreview($('preview'), look()); })
  .catch((e) => { console.warn('3D preview unavailable', e); $('wardrobe').classList.add('no-3d'); });
function updatePreview() { preview?.set(look()); }

function renderLookText() {
  $('skin-name').textContent = itemName('skin', state.skin);
  $('look-summary').textContent = [itemName('hat', state.hat), itemName('eyes', state.eyes), itemName('outfit', state.outfit)].join(' · ');
}

let popT = null;
function cycle(kind, dir) {
  const list = CATALOG[kind].filter((x) => !x.locked);
  const i = list.findIndex((x) => x.id === state[kind]);
  const next = list[(i + dir + list.length) % list.length];
  state[kind] = next.id;
  renderLookText();
  updatePreview();
  buzz(8);
  // Show the item's name next to the row you tapped.
  const pop = $('pop-name');
  const row = document.querySelector(`.arrow-row[data-kind="${kind}"]`);
  pop.textContent = `${next.name}  ${list.indexOf(next) + 1}/${list.length}`;
  pop.style.top = row ? row.style.top : '90%';
  pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
  clearTimeout(popT); popT = setTimeout(() => pop.classList.remove('show'), 1300);
}
document.querySelectorAll('.arrow-row').forEach((row) => {
  row.querySelectorAll('.arrow').forEach((b) => { b.onclick = () => cycle(row.dataset.kind, +b.dataset.dir); });
});
$('skin-prev').onclick = () => cycle('skin', -1);
$('skin-next').onclick = () => cycle('skin', 1);
$('shuffle-btn').onclick = () => {
  const pickFrom = (k) => { const l = CATALOG[k].filter((x) => !x.locked); return l[Math.floor(Math.random() * l.length)].id; };
  state.hat = pickFrom('hat'); state.eyes = pickFrom('eyes'); state.outfit = pickFrom('outfit'); state.skin = pickFrom('skin');
  state.color = COLORS[Math.floor(Math.random() * COLORS.length)];
  renderForm(); updatePreview(); buzz(20);
};
$('room-change').onclick = () => { state.room = ''; renderForm(); $('room').focus(); };
$('room').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

$('join-btn').onclick = () => {
  state.kicked = false;
  state.room = $('room').value.trim().toUpperCase();
  state.name = $('name').value.trim().slice(0, 12) || 'Ball ' + Math.floor(Math.random() * 90 + 10);
  if (state.room.length !== 4) { $('join-error').textContent = 'Enter the 4-letter code from the TV.'; return; }
  $('join-error').textContent = '';
  store.set('name', state.name); store.set('color', state.color);
  for (const k of ['hat', 'eyes', 'outfit', 'skin']) store.set(k, state[k]);

  // All of these need the tap's "user gesture", so call them right here, before any await.
  const perm = Tilt.requestPermission();
  requestWakeLock();
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('portrait')).catch(() => {});
  }

  perm.then((ok) => {
    state.tiltOk = ok;
    if (ok) tilt.start();
    connect(true);
  });
};

async function connect(firstTime) {
  show('screen-connecting');
  $('connecting-text').textContent = `Connecting to room ${state.room}…`;
  try {
    await net.connect(state.room, {
      t: 'hello', clientId: state.clientId, name: state.name, color: state.color,
      hat: state.hat, eyes: state.eyes, outfit: state.outfit, skin: state.skin,
    });
  } catch (err) {
    showError(err.message);
    return;
  }
  history.replaceState(null, '', `?room=${state.room}`);
  if (firstTime && !state.useTouch) startCalibration();
  else show('screen-play');
}

// ---------- calibration ----------
function startCalibration() {
  show('screen-calibrate');
  if (!state.tiltOk) {
    $('calibrate-btn').textContent = 'Tilt blocked, use touch';
  }
}
$('calibrate-btn').onclick = () => {
  if (state.tiltOk && tilt.calibrate()) { setTouchMode(false); show('screen-play'); buzz(40); return; }
  // No readings yet: give the sensor a moment, then fall back.
  setTimeout(() => {
    if (tilt.calibrate()) setTouchMode(false);
    else setTouchMode(true);
    show('screen-play');
  }, 600);
};
$('use-touch-btn').onclick = () => { setTouchMode(true); show('screen-play'); };
$('recal-btn').onclick = () => {
  if (state.useTouch) { if (state.tiltOk && tilt.hasSensor) { setTouchMode(false); startCalibration(); } return; }
  if (tilt.calibrate()) { buzz(30); flash($('recal-btn'), '✓ Neutral set'); }
};

function setTouchMode(on) {
  state.useTouch = on;
  $('stick').classList.toggle('hidden', !on);
  $('tilt-viz').classList.toggle('hidden', on);
  $('recal-btn').textContent = on ? (state.tiltOk ? '↺ Use tilt' : 'Touch mode') : '⟲ Recalibrate';
}

function flash(el, text) {
  const old = el.textContent; el.textContent = text;
  setTimeout(() => { el.textContent = state.useTouch ? old : '⟲ Recalibrate'; }, 1000);
}

// ---------- playing ----------
const actionBtn = $('action-btn');
let holding = false;
actionBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  actionBtn.setPointerCapture?.(e.pointerId);
  holding = true;
  actionBtn.classList.add('pressed');
  net.send({ t: 'action' });
  buzz(15);
});
// Release matters too (e.g. mini golf: hold to charge, let go to putt).
const unpress = () => {
  actionBtn.classList.remove('pressed');
  if (holding) { holding = false; net.send({ t: 'action', up: true }); }
};
actionBtn.addEventListener('pointerup', unpress);
actionBtn.addEventListener('pointercancel', unpress);
actionBtn.addEventListener('contextmenu', (e) => e.preventDefault());

$('vip-start').onclick = () => net.send({ t: 'vip', cmd: 'start' });

function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 'welcome':
      state.color = msg.color || state.color;
      document.documentElement.style.setProperty('--me', state.color);
      $('me-name').textContent = state.name;
      break;
    case 'phase': renderPhase(msg); break;
    case 'buzz': buzz(msg.ms || 60); break;
    case 'fx': feedback(msg.kind); break;
    case 'kicked':
      state.kicked = true;
      net.close();
      showError(msg.ban ? "You've been banned from this room." : 'The host removed you from the room.', !msg.ban);
      break;
    case 'hostclosed':
      state.kicked = true; // don't auto-reconnect to a closed room
      net.close();
      showError('The TV closed the game. Thanks for playing! 👋', false);
      break;
  }
}

function renderPhase(m) {
  state.phase = m.phase;
  $('status-title').textContent = m.title || '';
  $('status-text').textContent = m.text || '';
  actionBtn.textContent = m.action || '';
  actionBtn.classList.toggle('hidden', !m.action);

  const vip = $('vip');
  vip.classList.toggle('hidden', !m.vip);
  if (m.vip && Array.isArray(m.games)) {
    const box = $('vip-games');
    box.innerHTML = '';
    for (const g of m.games) {
      const b = document.createElement('button');
      b.textContent = g.name;
      b.className = g.id === m.selected ? 'sel' : '';
      b.onclick = () => net.send({ t: 'vip', cmd: 'pick', game: g.id });
      box.appendChild(b);
    }
  }
}

function showError(text, canRetry = true) {
  $('error-text').textContent = text;
  $('retry-btn').classList.toggle('hidden', !canRetry);
  $('retry-btn').textContent = state.kicked ? 'Join again' : 'Reconnect';
  show('screen-error');
}

// Connection dropped (network blip, phone locked, etc.): try once automatically.
let autoRetrying = false;
function onClose() {
  if (state.kicked) return;
  if (!autoRetrying && document.visibilityState === 'visible') {
    autoRetrying = true;
    connect(false).finally(() => { autoRetrying = false; });
    return;
  }
  showError('Lost connection to the TV.');
}
$('retry-btn').onclick = () => {
  if (!state.room) { show('screen-join'); return; }
  state.kicked = false;
  requestWakeLock();
  connect(false);
};
$('back-btn').onclick = () => { net.close(); show('screen-join'); renderForm(); };
$('leave-btn').onclick = () => {
  if (!confirm('Leave the game?')) return;
  state.kicked = true;
  net.leave();
  state.phase = null;
  show('screen-join'); renderForm();
  state.kicked = false;
};
// Closing the tab / navigating away: tell the TV right away so our ball disappears.
window.addEventListener('pagehide', () => { if (net.connected) net.leave(); });
// Came back from the browser's back/forward cache: rejoin silently.
window.addEventListener('pageshow', (e) => { if (e.persisted && state.phase && !net.connected && !state.kicked) connect(false); });

// Send input at a steady rate. The fast channel is unreliable, so constant
// re-sends double as loss recovery.
setInterval(() => {
  if (!net.connected) return;
  const v = state.useTouch ? stick.read() : tilt.read();
  net.sendInput(v.x, v.y);
}, 1000 / CONFIG.inputSendHz);

// Tilt visualizer + connection info
(function vizLoop() {
  if (!state.useTouch) {
    const x = tilt.x, y = tilt.y;
    $('tilt-dot').style.transform = `translate(${x * 105}%, ${-y * 105}%)`;
  }
  $('net-info').textContent = net.connected ? (net.fastInput ? 'fast link ⚡' : 'standard link') : '';
  requestAnimationFrame(vizLoop);
})();

// ---------- helpers ----------
function buzz(ms) { try { navigator.vibrate?.(ms); } catch {} }

// Game feedback: a vibration pattern (Android) + a colored flash on screen (works everywhere,
// so iPhones, which can't vibrate from a web page, still feel the hits).
const FEEL = {
  hit: { buzz: [30], color: '#ffffff', a: 0.35 },
  bighit: { buzz: [70, 30, 50], color: '#ff4d6d', a: 0.6, shake: true },
  out: { buzz: [260, 90, 260], color: '#ff7b00', a: 0.75, shake: true },
  win: { buzz: [80, 60, 80, 60, 220], color: '#ffd60a', a: 0.7 },
  collect: { buzz: [14], color: '#ffd60a', a: 0.3 },
  boost: { buzz: [45], color: '#4cc9f0', a: 0.4 },
  sink: { buzz: [60, 40, 140], color: '#7bd389', a: 0.6 },
  tick: { buzz: [18], color: '#ffffff', a: 0.15 },
  go: { buzz: [110], color: '#7bd389', a: 0.45 },
};
let flashT = null;
function feedback(kind) {
  const f = FEEL[kind];
  if (!f) return;
  buzz(f.buzz);
  const el = $('hit-flash');
  el.style.setProperty('--flash', f.color);
  el.style.setProperty('--alpha', f.a);
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  if (f.shake) { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }
  clearTimeout(flashT); flashT = setTimeout(() => document.body.classList.remove('shake'), 400);
}

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.phase) requestWakeLock();
});

renderForm();
