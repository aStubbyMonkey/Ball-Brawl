// DOM overlays for the TV: lobby panels, HUD, announcements, results, winner.
/* global QRCode */

const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dot = (color) => `<span class="dot" style="background:${esc(color)}"></span>`;

export class HostUI {
  /** handlers: { onPick(id), onStart(), onAddKeyboard(), onRounds(n), onSkip() } */
  constructor(handlers) {
    this.h = handlers;
    this._announceTimer = null;
    $('start-btn').onclick = () => this.h.onStart();
    $('kb-btn').onclick = () => this.h.onAddKeyboard();
    $('rounds').onchange = (e) => this.h.onRounds(+e.target.value);
    $('results').onclick = () => this.h.onSkip();
    $('winner').onclick = () => this.h.onSkip();
  }

  setJoinInfo(code, url) {
    $('room-code').textContent = code;
    $('hud-code').textContent = code;
    $('join-url').textContent = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    const box = $('qr');
    box.innerHTML = '';
    try {
      new QRCode(box, { text: url, width: 220, height: 220, colorDark: '#1b1446', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    } catch (e) { box.textContent = 'QR unavailable'; }
  }

  setStatus(text) { $('net-status').textContent = text; }

  showLobby(on) {
    document.body.classList.toggle('in-lobby', on);
  }

  renderLobby({ players, games, selected, round, rounds, vipId, canStart }) {
    $('player-count').textContent = players.length ? `${players.length} player${players.length > 1 ? 's' : ''}` : 'Waiting for players…';
    $('players').innerHTML = players.map((p) => `
      <div class="pchip ${p.connected ? '' : 'away'}">
        ${dot(p.color)}<span>${esc(p.name)}</span>
        ${p.id === vipId ? '<b title="VIP picks the game">⭐</b>' : ''}
        ${p.score ? `<em>${p.score}</em>` : ''}
      </div>`).join('');

    const cards = [{ id: 'random', name: 'Surprise me', emoji: '🎲', tagline: 'Random game' }, ...games];
    const grid = $('games');
    grid.innerHTML = cards.map((g) => `
      <button class="gcard ${g.id === selected ? 'sel' : ''}" data-id="${esc(g.id)}">
        <span class="gemoji">${g.emoji || '🎮'}</span>
        <span class="gname">${esc(g.name)}</span>
        <span class="gtag">${esc(g.tagline || '')}</span>
      </button>`).join('');
    grid.querySelectorAll('.gcard').forEach((b) => { b.onclick = () => this.h.onPick(b.dataset.id); });

    $('round-info').textContent = round > 0 ? `Round ${round + 1} of ${rounds}` : `Match: ${rounds} rounds`;
    $('rounds').value = String(rounds);
    $('start-btn').disabled = !canStart;
  }

  // ---- HUD ----
  setHud(title) {
    $('hud-title').textContent = title || '';
    $('hud').classList.toggle('hidden', !title);
  }

  setTimer(sec) {
    const el = $('hud-timer');
    if (sec == null) { el.textContent = ''; return; }
    const s = Math.max(0, Math.ceil(sec));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('hurry', s <= 10);
  }

  setScores(rows) {
    const el = $('hud-scores');
    if (!rows) { el.innerHTML = ''; return; }
    const sorted = [...rows].sort((a, b) => (typeof b.value === 'number' && typeof a.value === 'number' ? b.value - a.value : 0));
    el.innerHTML = sorted.map((r) => `
      <div class="srow ${r.out ? 'out' : ''}">${dot(r.player.color)}<span>${esc(r.player.name)}</span><b>${esc(r.value)}</b></div>`).join('');
  }

  announce(big, small, ms = 1500) {
    const el = $('announce');
    el.innerHTML = `<div class="big">${esc(big)}</div>${small ? `<div class="small">${esc(small)}</div>` : ''}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._announceTimer);
    this._announceTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  showIntro(def) {
    $('intro-emoji').textContent = def.emoji || '🎮';
    $('intro-name').textContent = def.name;
    $('intro-how').textContent = def.howTo || '';
    $('intro').classList.remove('hidden');
  }
  setCountdown(n) {
    const el = $('intro-count');
    el.textContent = n;
    el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
  }
  hideIntro() { $('intro').classList.add('hidden'); }

  showResults(title, rows, footer) {
    $('results-title').textContent = title;
    $('results-rows').innerHTML = rows.map((r, i) => `
      <div class="rrow" style="animation-delay:${i * 0.12}s">
        <span class="place">${r.placeLabel}</span>${dot(r.player.color)}
        <span class="rname">${esc(r.player.name)}</span>
        <span class="gain">${r.gain ? '+' + r.gain : ''}</span>
        <span class="total">${r.player.score}</span>
      </div>`).join('');
    $('results-footer').textContent = footer || '';
    $('results').classList.remove('hidden');
  }
  hideResults() { $('results').classList.add('hidden'); }

  showWinner(winners, rows) {
    $('winner-name').innerHTML = winners.map((p) => `${dot(p.color)}${esc(p.name)}`).join(' &amp; ');
    $('winner-rows').innerHTML = rows.map((r) => `<div>${r.placeLabel} ${esc(r.player.name)}: <b>${r.player.score}</b></div>`).join('');
    $('winner').classList.remove('hidden');
  }
  hideWinner() { $('winner').classList.add('hidden'); }

  toast(text, ms = 2500) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), ms);
  }
}

export const placeLabel = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
