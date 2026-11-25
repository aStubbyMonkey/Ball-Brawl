// Ball patterns, painted on a canvas and wrapped around the sphere (equirectangular).
// Every pattern is tinted by the player's color. Add one: write a painter below + list it in catalog.js.
import * as THREE from 'three';

const W = 1024, H = 512;
const cache = new Map();

const mix = (hex, to, t) => '#' + new THREE.Color(hex).lerp(new THREE.Color(to), t).getHexString();

function star(g, x, y, r, points = 5, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
  g.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  g.fill();
}
/** Draw at x and its wrapped copies so shapes cross the seam cleanly. */
const wrap = (fn, x, ...rest) => { for (const dx of [-W, 0, W]) fn(x + dx, ...rest); };

const painters = {
  plain(g, c) {
    // A soft band so even "plain" balls show a hint of rolling.
    g.fillStyle = mix(c, '#ffffff', 0.12); g.fillRect(0, H * 0.47, W, H * 0.06);
  },
  dots(g, c) {
    g.fillStyle = mix(c, '#ffffff', 0.55); g.fillRect(0, H * 0.44, W, H * 0.12);
    g.fillStyle = '#ffffffdd';
    for (let row = 0; row < 4; row++) {
      const y = [0.2, 0.34, 0.66, 0.8][row] * H;
      const n = row === 0 || row === 3 ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const x = ((i + (row % 2) * 0.5) / n) * W;
        wrap((xx) => { g.beginPath(); g.ellipse(xx, y, 30 / Math.sin((y / H) * Math.PI), 30, 0, 0, Math.PI * 2); g.fill(); }, x);
      }
    }
  },
  stripes(g, c) {
    const light = mix(c, '#ffffff', 0.6);
    for (let i = 0; i < 9; i++) if (i % 2) { g.fillStyle = light; g.fillRect(0, (i / 9) * H, W, H / 9); }
  },
  candy(g, c) {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      const x = (i / 12) * W;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 40, 0); g.lineTo(x + 40 + 260, H); g.lineTo(x + 260, H); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x - W, 0); g.lineTo(x - W + 40, 0); g.lineTo(x - W + 300, H); g.lineTo(x - W + 260, H); g.closePath(); g.fill();
    }
  },
  beach(g, c) {
    const cols = [c, '#ffffff', mix(c, '#ffd60a', 0.6), '#ffffff', mix(c, '#4cc9f0', 0.6), '#ffffff'];
    cols.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * W) / cols.length, 0, W / cols.length + 1, H); });
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H * 0.07); g.fillRect(0, H * 0.93, W, H * 0.07);
  },
  eight(g, c) {
    // Big white circle with an 8 on the "front".
    const x = W * 0.25, y = H * 0.5;
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, 120, 105, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1446'; g.font = '700 150px Fredoka, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('8', x, y + 8);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(W * 0.75, y, 40, 36, 0, 0, Math.PI * 2); g.fill();
  },
  checker(g, c) {
    const light = mix(c, '#ffffff', 0.65), n = 16, m = 8;
    g.fillStyle = light;
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if ((i + j) % 2) g.fillRect((i / n) * W, (j / m) * H, W / n + 1, H / m + 1);
  },
  zigzag(g, c) {
    g.strokeStyle = mix(c, '#ffffff', 0.65); g.lineWidth = 34; g.lineJoin = 'miter';
    for (const y of [0.28, 0.5, 0.72]) {
      g.beginPath();
      for (let i = 0; i <= 16; i++) g.lineTo((i / 16) * W, y * H + (i % 2 ? -36 : 36));
      g.stroke();
    }
  },
  stars(g, c) {
    g.fillStyle = mix(c, '#fff5b0', 0.75);
    wrap((x) => star(g, x, H * 0.5, 95), W * 0.25);
    g.fillStyle = '#ffffffcc';
    const spots = [[0.55, 0.3, 40], [0.7, 0.65, 34], [0.88, 0.38, 44], [0.05, 0.7, 30], [0.42, 0.72, 28], [0.95, 0.75, 26], [0.6, 0.5, 22]];
    for (const [x, y, r] of spots) wrap((xx) => star(g, xx, y * H, r), x * W);
  },
  hearts(g, c) {
    g.fillStyle = mix(c, '#ffffff', 0.7);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
      const x = ((i + (row % 2) * 0.5) / 7) * W, y = (0.28 + row * 0.22) * H;
      wrap((xx) => heart(g, xx, y, 46), x);
    }
  },
  spots(g, c) {
    const dark = mix(c, '#1b1446', 0.55);
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = dark;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = (0.15 + rnd() * 0.7) * H, r = 18 + rnd() * 36;
      wrap((xx) => { g.beginPath(); g.ellipse(xx, y, r * 1.3, r, rnd() * 3, 0, Math.PI * 2); g.fill(); }, x);
    }
  },
  camo(g, c) {
    const shades = [mix(c, '#1b1446', 0.35), mix(c, '#ffffff', 0.25), mix(c, '#3d5a1e', 0.45)];
    let seed = 3; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = shades[i % 3];
      const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 50;
      wrap((xx) => {
        g.beginPath();
        for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5); g.lineTo(xx + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
        g.closePath(); g.fill();
      }, x);
    }
  },
  galaxy(g, c) {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#120a3a'); grd.addColorStop(0.5, mix(c, '#120a3a', 0.35)); grd.addColorStop(1, '#120a3a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    let seed = 11; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 9; i++) {
      const x = rnd() * W, y = (0.2 + rnd() * 0.6) * H, r = 60 + rnd() * 90;
      const neb = g.createRadialGradient(x, y, 0, x, y, r);
      neb.addColorStop(0, mix(c, '#ffffff', 0.3) + '88'); neb.addColorStop(1, '#00000000');
      g.fillStyle = neb; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 240; i++) {
      g.fillStyle = rnd() < 0.8 ? '#ffffff' : '#ffe680';
      g.globalAlpha = 0.4 + rnd() * 0.6;
      const s = rnd() < 0.92 ? 1.5 + rnd() * 2 : 5;
      g.fillRect(rnd() * W, rnd() * H, s, s);
    }
    g.globalAlpha = 1;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) wrap((xx) => star(g, xx, (0.25 + rnd() * 0.5) * H, 12, 4, 0.3), rnd() * W);
  },
};

/** Cached CanvasTexture for (color, skin). Shared by every ball with that look; don't dispose it. */
export function skinTexture(color, skin, anisotropy = 8) {
  const key = color + '|' + skin;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  (painters[skin] || painters.dots)(g, color);
  // Gentle top-light / bottom-shade baked in for a rounder, toy-like look.
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)'); shade.addColorStop(0.5, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.10)');
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  cache.set(key, t);
  return t;
}
