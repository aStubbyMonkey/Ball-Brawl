// Keyboard "players" on the TV computer, for testing without phones.
const LAYOUTS = [
  { name: 'Keys (WASD)', up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'Space' },
  { name: 'Keys (Arrows)', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Enter' },
  { name: 'Keys (IJKL)', up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', action: 'KeyU' },
];

export class Keyboard {
  constructor(onAction) {
    this.down = new Set();
    this.slots = []; // index -> playerId
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (this.down.has(e.code)) return;
      this.down.add(e.code);
      this.slots.forEach((pid, i) => { if (pid && LAYOUTS[i].action === e.code) onAction(pid); });
      if (LAYOUTS.some((l) => Object.values(l).includes(e.code))) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  /** Returns { slot, layout } or null if all keyboard slots are taken. */
  claim(playerId) {
    const i = this.slots.findIndex((s) => !s);
    const slot = i >= 0 ? i : this.slots.length;
    if (slot >= LAYOUTS.length) return null;
    this.slots[slot] = playerId;
    return { slot, layout: LAYOUTS[slot] };
  }
  release(playerId) { const i = this.slots.indexOf(playerId); if (i >= 0) this.slots[i] = null; }

  read(slot) {
    const L = LAYOUTS[slot], d = this.down;
    let x = (d.has(L.right) ? 1 : 0) - (d.has(L.left) ? 1 : 0);
    let y = (d.has(L.up) ? 1 : 0) - (d.has(L.down) ? 1 : 0);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y };
  }
}
