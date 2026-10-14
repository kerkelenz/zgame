/**
 * Procedural placeholder artwork, drawn once on a canvas and cached as data URLs.
 * Ported from the Stellar Dominion prototype. To use real art, set an override:
 *     Art.overrides['metalMine'] = 'https://.../mine.png'
 *     Art.overrides['planet:<planetId>'] = 'data:image/png;base64,...'
 */
import { artFile } from './artFiles';

type Kind = 'building' | 'tech' | 'ship' | 'defense';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const ICON_HUE: Record<Kind, number> = { building: 32, tech: 265, ship: 205, defense: 350 };
const RES_HUE: Record<string, number> = {
  metalMine: 215, metalStorage: 215, crystalMine: 195, crystalStorage: 195, deuteriumSynthesizer: 155, deuteriumTank: 155, solarPlant: 48, fusionReactor: 20,
};

const cache = new Map<string, string>();
export const Art = {
  overrides: {} as Record<string, string>,
  icon(kind: Kind, id: string, name: string): string {
    if (this.overrides[id]) return this.overrides[id];
    const file = artFile(id);
    if (file) return file;
    const hit = cache.get(id);
    if (hit) return hit;
    const url = drawIcon(kind, id, name);
    cache.set(id, url);
    return url;
  },
  planet(id: string, tempMax: number, isMoon: boolean): string {
    const k = 'planet:' + id;
    if (this.overrides[k]) return this.overrides[k];
    const hit = cache.get(k);
    if (hit) return hit;
    const url = drawPlanet(hashStr(id), tempMax, isMoon);
    cache.set(k, url);
    return url;
  },
};

const iconCode = (name: string) => {
  const w = name.split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
};

function canvas(size: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  return cv;
}

function drawIcon(kind: Kind, id: string, name: string): string {
  const size = 128, cv = canvas(size);
  const g = cv.getContext('2d');
  if (!g) return '';
  const rng = mulberry32(hashStr(id));
  const hue = RES_HUE[id] ?? ICON_HUE[kind] + (rng() * 40 - 20);
  const bg = g.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, `hsl(${hue} 35% 16%)`); bg.addColorStop(1, `hsl(${hue + 30} 40% 6%)`);
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.5})`; g.fillRect(rng() * size, rng() * size, 1, 1); }
  g.save(); g.translate(size / 2, size / 2);
  if (kind === 'ship') drawShipShape(g, rng, hue, id);
  else if (kind === 'defense') drawDefenseShape(g, rng, hue, id);
  else if (kind === 'tech') drawResearchShape(g, rng, hue);
  else drawBuildingShape(g, rng, hue, id);
  g.restore();
  g.font = '600 15px "IBM Plex Mono", monospace';
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(6, size - 24, 30, 18);
  g.fillStyle = `hsl(${hue} 80% 80%)`; g.fillText(iconCode(name), 9, size - 10);
  return cv.toDataURL();
}

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

function drawBuildingShape(g: Ctx, rng: Rng, hue: number, id: string) {
  g.fillStyle = `hsl(${hue} 15% 22%)`;
  g.beginPath(); g.ellipse(0, 30, 50, 14, 0, 0, Math.PI * 2); g.fill();
  const blocks = 2 + ((rng() * 3) | 0);
  for (let i = 0; i < blocks; i++) {
    const w = 16 + rng() * 20, h = 20 + rng() * 42, x = -40 + i * (80 / blocks) + rng() * 6;
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, `hsl(${hue} 25% 55%)`); grad.addColorStop(1, `hsl(${hue} 25% 30%)`);
    g.fillStyle = grad; g.fillRect(x, 30 - h, w, h);
    g.fillStyle = `hsl(${hue} 90% 70%)`;
    for (let y = 30 - h + 6; y < 24; y += 8) if (rng() < 0.6) g.fillRect(x + 4, y, w - 8, 2);
  }
  if (id.includes('Mine') || id === 'deuteriumSynthesizer') {
    g.strokeStyle = `hsl(${hue} 60% 75%)`; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-8, 28); g.lineTo(0, -38); g.lineTo(8, 28); g.moveTo(-5, 0); g.lineTo(5, 0); g.stroke();
  } else if (id === 'solarPlant') {
    g.fillStyle = 'hsl(215 70% 45%)';
    for (let i = -1; i <= 1; i++) { g.save(); g.translate(i * 30, -26); g.rotate(-0.3); g.fillRect(-12, -7, 24, 14); g.restore(); }
  } else {
    g.fillStyle = `hsla(${hue} 80% 70% / .8)`;
    g.beginPath(); g.arc(rng() * 20 - 10, 0, 14 + rng() * 6, Math.PI, 0); g.fill();
  }
}

function drawShipShape(g: Ctx, rng: Rng, hue: number, id: string) {
  const big = ({ deathstar: 1.25, battleship: 1.1, destroyer: 1.15, battlecruiser: 1.1, bomber: 1.05, largeCargo: 1, recycler: 1 } as Record<string, number>)[id] || 0.85;
  if (id === 'deathstar') {
    const r = 44, gr = g.createRadialGradient(-12, -12, 4, 0, 0, r);
    gr.addColorStop(0, `hsl(${hue} 20% 70%)`); gr.addColorStop(1, `hsl(${hue} 30% 18%)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(14, -14, 10, 0, Math.PI * 2); g.fill();
    return;
  }
  if (id === 'crawler') {
    g.fillStyle = 'hsl(30 15% 28%)'; g.fillRect(-40, 14, 80, 16); g.fillStyle = 'hsl(35 70% 50%)'; g.fillRect(-28, -14, 56, 28);
    g.fillStyle = 'hsl(35 30% 25%)'; g.fillRect(-4, -40, 8, 28); g.beginPath(); g.moveTo(-14, -40); g.lineTo(14, -40); g.lineTo(0, -52); g.fill();
    return;
  }
  if (id === 'solarSatellite') {
    g.fillStyle = 'hsl(215 70% 45%)'; g.fillRect(-48, -10, 36, 20); g.fillRect(12, -10, 36, 20);
    g.fillStyle = `hsl(${hue} 20% 70%)`; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
    return;
  }
  g.scale(big, big);
  const pts: [number, number][] = [], n = 6;
  for (let i = 0; i <= n; i++) {
    const y = -48 + (96 * i) / n;
    const w = i === 0 ? 2 : 6 + rng() * 26 * Math.sin((i / n) * Math.PI * 0.9 + 0.2);
    pts.push([w, y]);
  }
  const grad = g.createLinearGradient(-30, 0, 30, 0);
  grad.addColorStop(0, `hsl(${hue} 20% 35%)`); grad.addColorStop(0.5, `hsl(${hue} 25% 75%)`); grad.addColorStop(1, `hsl(${hue} 20% 30%)`);
  g.fillStyle = grad; g.beginPath(); g.moveTo(0, -50);
  pts.forEach(([x, y]) => g.lineTo(x, y));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(-pts[i][0], pts[i][1]);
  g.closePath(); g.fill();
  if (rng() < 0.8) {
    const wy = rng() * 30, ww = 30 + rng() * 14;
    g.fillStyle = `hsl(${hue} 25% 45%)`;
    g.beginPath(); g.moveTo(8, wy - 10); g.lineTo(ww, wy + 14); g.lineTo(8, wy + 12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-8, wy - 10); g.lineTo(-ww, wy + 14); g.lineTo(-8, wy + 12); g.closePath(); g.fill();
  }
  g.fillStyle = `hsl(${hue + 150} 80% 70%)`; g.beginPath(); g.ellipse(0, -22, 4, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'hsl(30 100% 60%)'; g.shadowColor = 'hsl(30 100% 60%)'; g.shadowBlur = 12;
  g.fillRect(-6, 46, 4, 6); g.fillRect(2, 46, 4, 6); g.shadowBlur = 0;
}

function drawDefenseShape(g: Ctx, rng: Rng, hue: number, id: string) {
  if (id.includes('Shield')) {
    const r = id === 'largeShield' ? 48 : 38;
    const gr = g.createRadialGradient(0, 20, 4, 0, 20, r);
    gr.addColorStop(0, `hsla(${hue + 180} 90% 70% / .15)`); gr.addColorStop(1, `hsla(${hue + 180} 90% 70% / .7)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 26, r, Math.PI, 0); g.fill();
    g.fillStyle = `hsl(${hue} 10% 30%)`; g.fillRect(-r, 26, r * 2, 6);
    return;
  }
  if (id.includes('Missile')) { // silo missiles: an upright warhead
    g.fillStyle = `hsl(${hue} 10% 28%)`; g.fillRect(-14, 20, 28, 14);
    g.fillStyle = `hsl(${hue} 20% 78%)`; g.beginPath(); g.moveTo(0, -42); g.lineTo(9, -10); g.lineTo(9, 22); g.lineTo(-9, 22); g.lineTo(-9, -10); g.closePath(); g.fill();
    g.fillStyle = `hsl(${hue + 20} 100% 62%)`; g.beginPath(); g.moveTo(0, -42); g.lineTo(9, -10); g.lineTo(-9, -10); g.closePath(); g.fill();
    return;
  }
  g.fillStyle = `hsl(${hue} 10% 28%)`;
  g.beginPath(); g.moveTo(-36, 34); g.lineTo(36, 34); g.lineTo(22, 12); g.lineTo(-22, 12); g.closePath(); g.fill();
  g.fillStyle = `hsl(${hue} 25% 55%)`; g.beginPath(); g.arc(0, 10, 18, Math.PI, 0); g.fill();
  const barrels = id === 'rocketLauncher' ? 3 : id === 'lightLaser' ? 1 : 2;
  const len = 26 + rng() * 22, thick = id === 'plasmaTurret' || id === 'gaussCannon' ? 8 : 4;
  g.save(); g.rotate(-0.7);
  g.fillStyle = `hsl(${hue} 15% 70%)`;
  for (let i = 0; i < barrels; i++) g.fillRect(0, -thick / 2 + (i - (barrels - 1) / 2) * (thick + 3), len, thick);
  g.fillStyle = `hsl(${hue + 20} 100% 65%)`; g.shadowColor = g.fillStyle as string; g.shadowBlur = 10;
  g.beginPath(); g.arc(len + 2, 0, 3, 0, Math.PI * 2); g.fill();
  g.restore();
}

function drawResearchShape(g: Ctx, rng: Rng, hue: number) {
  g.strokeStyle = `hsl(${hue} 80% 75%)`; g.lineWidth = 2;
  const rings = 2 + ((rng() * 2) | 0);
  for (let i = 0; i < rings; i++) { g.save(); g.rotate(rng() * Math.PI); g.beginPath(); g.ellipse(0, 0, 44, 14 + rng() * 10, 0, 0, Math.PI * 2); g.stroke(); g.restore(); }
  const gr = g.createRadialGradient(0, 0, 1, 0, 0, 16);
  gr.addColorStop(0, '#fff'); gr.addColorStop(1, `hsl(${hue} 90% 60%)`);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 4; i++) { g.fillStyle = `hsl(${hue + 60} 90% 70%)`; g.beginPath(); g.arc(rng() * 80 - 40, rng() * 60 - 30, 3, 0, Math.PI * 2); g.fill(); }
}

/** A per-pixel shaded sphere with seeded bands; the palette follows the planet's temperature. */
function drawPlanet(seed: number, t: number, isMoon: boolean): string {
  const size = 160, cv = canvas(size);
  const g = cv.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(size, size), rng = mulberry32(seed);
  const pal: number[][] = isMoon ? [[62, 62, 68], [112, 112, 120], [158, 158, 166]] :
    t > 150 ? [[90, 30, 20], [200, 90, 40], [250, 180, 90]] :
    t > 60 ? [[120, 80, 50], [190, 150, 90], [230, 210, 160]] :
    t > -20 ? [[20, 60, 120], [40, 130, 90], [200, 190, 140]] :
    t > -80 ? [[40, 80, 110], [120, 170, 190], [220, 235, 245]] : [[90, 110, 140], [180, 200, 220], [250, 252, 255]];
  const f1 = 2 + rng() * 5, f2 = 5 + rng() * 9, ph1 = rng() * 6, ph2 = rng() * 6, tilt = rng() * 0.8 - 0.4;
  const R = size / 2 - 8, cx = size / 2, cy = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - cx) / R, dy = (y - cy) / R, d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    const i = (y * size + x) * 4;
    const z = Math.sqrt(1 - d2);
    const u = dx / (z + 1), v = dy / (z + 1) + dx * tilt;
    let n = Math.sin(v * f1 * 3 + ph1) * 0.5 + Math.sin((u + v) * f2 + ph2) * 0.3 + Math.sin(u * f2 * 1.7 - v * 4 + ph1) * 0.2;
    n = (n + 1) / 2;
    const c = n < 0.45 ? pal[0] : n < 0.72 ? pal[1] : pal[2];
    const light = clamp(0.25 + 0.85 * (z * 0.6 - dx * 0.35 - dy * 0.35), 0.08, 1.2);
    img.data[i] = c[0] * light; img.data[i + 1] = c[1] * light; img.data[i + 2] = c[2] * light;
    img.data[i + 3] = d2 > 0.97 ? 255 * (1 - (d2 - 0.97) / 0.03) : 255;
  }
  g.putImageData(img, 0, 0);
  if (isMoon) {
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.92, cr = 3 + rng() * 9;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(x, y, cr, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.arc(x - cr * 0.2, y - cr * 0.2, cr * 0.8, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    return cv.toDataURL();
  }
  const atm = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.12);
  atm.addColorStop(0, 'rgba(120,180,255,0)'); atm.addColorStop(0.5, 'rgba(120,180,255,.25)'); atm.addColorStop(1, 'rgba(120,180,255,0)');
  g.fillStyle = atm; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, Math.PI * 2); g.fill();
  return cv.toDataURL();
}

/** Fixed starfield behind the whole app. */
export function drawStarfield(cv: HTMLCanvasElement) {
  const w = (cv.width = window.innerWidth), h = (cv.height = window.innerHeight);
  const g = cv.getContext('2d');
  if (!g) return;
  const rng = mulberry32(7);
  g.fillStyle = '#050810'; g.fillRect(0, 0, w, h);
  const neb = g.createRadialGradient(w * 0.8, h * 0.2, 10, w * 0.8, h * 0.2, Math.max(w, h) * 0.6);
  neb.addColorStop(0, 'rgba(60,40,110,.35)'); neb.addColorStop(1, 'rgba(5,8,16,0)');
  g.fillStyle = neb; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 2200; i++) {
    const a = rng() * 0.8; g.fillStyle = `rgba(${200 + rng() * 55},${200 + rng() * 55},255,${a})`;
    const s = rng() < 0.05 ? 2 : 1; g.fillRect(rng() * w, rng() * h, s, s);
  }
}
