// Draws the app icons (a ringed amber planet over deep space) into client/public/icons without any image library.
//   node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

/** colour of one point of the icon, u and v in -1..1; `pad` shrinks the artwork for maskable icons */
function pixel(u, v, pad, px) {
  u /= pad; v /= pad;
  // deep space with a faint glow and a few stars
  let r = 11, g = 16, b = 32;
  const glow = Math.max(0, 1 - Math.hypot(u + 0.2, v + 0.3) / 1.6);
  r += 22 * glow; g += 18 * glow; b += 40 * glow;
  const h = Math.sin(Math.floor((u + 1) * 40) * 12.9898 + Math.floor((v + 1) * 40) * 78.233) * 43758.5453;
  if (h - Math.floor(h) > 0.985) { r += 90; g += 90; b += 90; }

  const over = (cr, cg, cb, a) => { r = mix(r, cr, a); g = mix(g, cg, a); b = mix(b, cb, a); };
  const cx = -0.04, cy = 0.04, R = 0.46;
  // ring, tilted: points of the ellipse that lie behind the planet are drawn first, the front arc after it
  const ang = -0.38, ca = Math.cos(ang), sa = Math.sin(ang);
  const ru = (u - cx) * ca + (v - cy) * sa, rv = -(u - cx) * sa + (v - cy) * ca;
  const e = Math.hypot(ru / 0.92, rv / 0.26);
  const ringA = smooth(px * 2.5, 0, Math.abs(e - 1) - 0.08) * 0.95;
  const ringFront = rv > 0;
  if (!ringFront) over(240, 190, 110, ringA * 0.8);
  // planet disc with a lit upper-left
  const d = Math.hypot(u - cx, v - cy);
  const body = smooth(px * 2, 0, d - R);
  if (body > 0) {
    const lit = Math.max(0, 1 - Math.hypot(u - cx + 0.16, v - cy + 0.18) / (R * 1.5));
    const band = 0.5 + 0.5 * Math.sin((v - cy) * 17 + Math.sin((u - cx) * 6) * 0.9);
    const pr = mix(150, 255, lit) * (0.88 + 0.12 * band), pg = mix(86, 190, lit) * (0.88 + 0.12 * band), pb = mix(30, 96, lit) * (0.9 + 0.1 * band);
    const shade = smooth(R * 0.4, R * 1.05, Math.hypot(u - cx - 0.22, v - cy - 0.2)); // night side, lower right
    over(pr * (1 - 0.45 * (1 - shade)), pg * (1 - 0.45 * (1 - shade)), pb * (1 - 0.45 * (1 - shade)), body);
  }
  if (ringFront) over(250, 205, 125, ringA);
  // a small moon
  const md = Math.hypot(u - 0.58, v + 0.5);
  over(205, 214, 232, smooth(px * 2, 0, md - 0.095));
  over(60, 68, 96, smooth(px * 2, 0, Math.hypot(u - 0.61, v + 0.47) - 0.07) * 0.45 * smooth(px * 2, 0, md - 0.095));
  return [r, g, b];
}

function png(size, pad) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const px = 2 / size;
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      // 2x2 supersampling keeps the edges clean
      let sr = 0, sg = 0, sb = 0;
      for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const [r, g, b] = pixel(((x + dx) / size) * 2 - 1, ((y + dy) / size) * 2 - 1, pad, px);
        sr += r; sg += g; sb += b;
      }
      raw[o++] = Math.min(255, Math.round(sr / 4)); raw[o++] = Math.min(255, Math.round(sg / 4)); raw[o++] = Math.min(255, Math.round(sb / 4)); raw[o++] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('client/public/icons', { recursive: true });
for (const [name, size, pad] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 1.3], ['apple-touch-icon.png', 180, 1.05]]) {
  writeFileSync(`client/public/icons/${name}`, png(size, pad));
  console.log('wrote', name);
}
