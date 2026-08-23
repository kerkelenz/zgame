/**
 * Placeholder art generator.
 *
 *   node scripts/gen-placeholders.mjs      (or: npm run gen:placeholders)
 *
 * Writes a PNG for every asset key into src/assets/placeholders/, then
 * regenerates src/assets/manifest.ts to match.
 *
 * ---------------------------------------------------------------------------
 * WHY GENERATE ART AT ALL?
 * ---------------------------------------------------------------------------
 * Real art is slow and expensive to make, and it is the *last* thing a game
 * needs. But building the whole UI against `<View style={{backgroundColor:
 * 'grey'}}/>` placeholders is a trap: layouts that look fine with grey boxes
 * fall apart the moment real images with real aspect ratios arrive.
 *
 * So we generate art that is *structurally* real - correct dimensions, correct
 * file format, loaded through the same `require()` pipeline as the final
 * assets - but obviously fake to look at. Swapping in real art later is a
 * one-line change per asset in the manifest and nothing else in the app moves.
 *
 * ---------------------------------------------------------------------------
 * TWO KINDS OF OUTPUT
 * ---------------------------------------------------------------------------
 * 1. **Tiles** (256px): buildings, planets, research, ships, defence. A solid
 *    category background, a geometric motif, and the item's name in readable
 *    text. These are shown large, so the text earns its place.
 *
 * 2. **Icons** (64px): resources and UI symbols. These are drawn at 16-22px in
 *    the interface, where rendered text is an illegible smudge - so an icon is
 *    a single bold glyph on a *transparent* background, with no label at all.
 *    UI glyphs are drawn in white specifically so the app can recolour them at
 *    runtime with expo-image's `tintColor` (one warning icon, tinted amber for
 *    "expensive" and red for "blocked").
 *
 * ---------------------------------------------------------------------------
 * WHY pngjs AND A HAND-ROLLED FONT?
 * ---------------------------------------------------------------------------
 * `sharp` could render SVG with text far more prettily, but text rendering
 * depends on which fonts happen to be installed on the machine. That would make
 * the output non-deterministic across developers, which defeats the point of
 * committing the PNGs.
 *
 * pngjs is pure JavaScript with no native build step, and the 5x7 bitmap font
 * below is embedded right here in the file. Same input, same bytes, on every
 * machine, forever.
 */

import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src', 'assets', 'placeholders');
const MANIFEST_PATH = join(ROOT, 'src', 'assets', 'manifest.ts');

// ===========================================================================
// 1. A 5x7 bitmap font
// ===========================================================================
// Each glyph is seven rows of five columns. '#' is ink, anything else is
// transparent. We only ship uppercase, digits and a little punctuation because
// every label is upper-cased before drawing - a placeholder does not need
// typographic range, it needs to be legible at a glance.

const FONT_WIDTH = 5;
const FONT_HEIGHT = 7;

const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
};

// ===========================================================================
// 2. A tiny canvas over pngjs
// ===========================================================================
// pngjs hands us a flat RGBA byte buffer. Everything below is written against
// that directly - no dependencies, no surprises, fully deterministic.

/**
 * Sentinel "colour" meaning *punch a hole*.
 *
 * Icons need real transparent cut-outs, not dark ones: the app recolours them
 * with `tintColor`, which repaints every non-transparent pixel. A keyhole drawn
 * in black would vanish the moment the padlock is tinted. Passing ERASE to any
 * drawing routine writes RGBA zeroes instead of blending.
 */
const ERASE = Symbol('erase');

/** `background` may be null, which leaves the canvas fully transparent. */
function createCanvas(width, height, background) {
  const png = new PNG({ width, height });
  const canvas = { png, width, height };
  // pngjs zero-fills, which is already transparent black.
  if (background) fillRect(canvas, 0, 0, width, height, background);
  return canvas;
}

/** Source-over alpha compositing for a single pixel. */
function setPixel(canvas, x, y, color) {
  // Silently clip out-of-bounds writes: the drawing routines below are allowed
  // to be sloppy at the edges, which keeps them much simpler to read.
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  const i = (canvas.width * Math.floor(y) + Math.floor(x)) << 2;
  const data = canvas.png.data;

  if (color === ERASE) {
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    return;
  }

  const [r, g, b, a = 255] = color;
  const sa = a / 255;
  const da = data[i + 3] / 255;
  const outA = sa + da * (1 - sa);

  if (outA === 0) {
    data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
    return;
  }

  data[i] = Math.round((r * sa + data[i] * da * (1 - sa)) / outA);
  data[i + 1] = Math.round((g * sa + data[i + 1] * da * (1 - sa)) / outA);
  data[i + 2] = Math.round((b * sa + data[i + 2] * da * (1 - sa)) / outA);
  data[i + 3] = Math.round(outA * 255);
}

function fillRect(canvas, x, y, w, h, color) {
  for (let py = Math.floor(y); py < y + h; py++) {
    for (let px = Math.floor(x); px < x + w; px++) setPixel(canvas, px, py, color);
  }
}

function strokeRect(canvas, x, y, w, h, thickness, color) {
  fillRect(canvas, x, y, w, thickness, color);
  fillRect(canvas, x, y + h - thickness, w, thickness, color);
  fillRect(canvas, x, y, thickness, h, color);
  fillRect(canvas, x + w - thickness, y, thickness, h, color);
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= cy + radius; y++) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(canvas, x, y, color);
    }
  }
}

/** An annulus: everything between `inner` and `outer` radius. */
function fillRing(canvas, cx, cy, outer, inner, color) {
  const o2 = outer * outer;
  const i2 = inner * inner;
  for (let y = Math.floor(cy - outer); y <= cy + outer; y++) {
    for (let x = Math.floor(cx - outer); x <= cx + outer; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= o2 && d2 >= i2) setPixel(canvas, x, y, color);
    }
  }
}

/**
 * Scanline-fill an arbitrary convex or concave polygon.
 *
 * The even-odd rule: for each row of pixels, find every place the polygon's
 * edges cross that row, sort those crossings left to right, and fill between
 * pairs. It is the standard textbook algorithm and it handles our triangles,
 * hexagons, gems and bolts with one implementation.
 */
function fillPolygon(canvas, points, color) {
  const ys = points.map((p) => p[1]);
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(...ys)));

  for (let y = minY; y <= maxY; y++) {
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      // Half-open comparison avoids counting a shared vertex twice.
      if (y1 <= y === y2 <= y) continue;
      crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (let x = Math.round(crossings[i]); x <= Math.round(crossings[i + 1]); x++) {
        setPixel(canvas, x, y, color);
      }
    }
  }
}

/** A line with thickness, drawn as a rectangle rotated to match the slope. */
function fillThickLine(canvas, x1, y1, x2, y2, width, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  // Unit vector perpendicular to the line, scaled to half the thickness.
  const px = (-dy / length) * (width / 2);
  const py = (dx / length) * (width / 2);
  fillPolygon(
    canvas,
    [
      [x1 + px, y1 + py],
      [x2 + px, y2 + py],
      [x2 - px, y2 - py],
      [x1 - px, y1 - py],
    ],
    color,
  );
}

function regularPolygon(cx, cy, radius, sides, rotation = 0) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/**
 * Scale a colour's brightness. Factor < 1 shades, factor > 1 highlights.
 *
 * The clamp is essential, not defensive: channel values land in a `Buffer`,
 * which masks with `& 255`. Without clamping, a highlight that pushed green
 * past 255 wrapped around to near-zero and turned a mint-green droplet purple.
 */
function tone(color, factor) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return [clamp(color[0]), clamp(color[1]), clamp(color[2]), color[3] ?? 255];
}

// ---- Text -----------------------------------------------------------------

const LETTER_SPACING = 1; // in font pixels, before scaling

function textWidth(text, scale) {
  if (text.length === 0) return 0;
  return (text.length * (FONT_WIDTH + LETTER_SPACING) - LETTER_SPACING) * scale;
}

function drawText(canvas, text, x, y, scale, color) {
  let cursor = x;
  for (const char of text) {
    const glyph = GLYPHS[char] ?? GLYPHS['-'];
    for (let row = 0; row < FONT_HEIGHT; row++) {
      for (let col = 0; col < FONT_WIDTH; col++) {
        if (glyph[row][col] !== '#') continue;
        fillRect(canvas, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += (FONT_WIDTH + LETTER_SPACING) * scale;
  }
}

/** Greedy word wrap: pack as many words per line as `maxWidth` allows. */
function wrapText(text, scale, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, scale) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw a label centred horizontally, choosing the largest scale that fits.
 *
 * Starting big and stepping down means "ION" gets rendered large and
 * "DEUTERIUM SYNTHESIZER" gets rendered small, without any per-asset tuning.
 */
function drawCenteredLabel(canvas, text, centerY, maxWidth, maxHeight, color, scales) {
  for (const scale of scales) {
    const lines = wrapText(text, scale, maxWidth);
    const lineHeight = (FONT_HEIGHT + 2) * scale;
    const totalHeight = lines.length * lineHeight;
    const widest = Math.max(...lines.map((l) => textWidth(l, scale)));

    // Try the next size down if this one overflows in either direction.
    if ((widest > maxWidth || totalHeight > maxHeight) && scale !== scales[scales.length - 1]) {
      continue;
    }

    let y = Math.round(centerY - totalHeight / 2);
    for (const line of lines) {
      drawText(
        canvas,
        line,
        Math.round((canvas.width - textWidth(line, scale)) / 2),
        y,
        scale,
        color,
      );
      y += lineHeight;
    }
    return;
  }
}

// ===========================================================================
// 3. Deterministic per-key colour
// ===========================================================================

/**
 * FNV-1a: a small, fast, well-distributed string hash.
 *
 * Used only to give each asset a stable accent colour. `Math.random()` would
 * obviously break determinism, and a hand-picked colour per key would be 80
 * lines of table nobody wants to maintain.
 */
function hashString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 again - same generator the engine uses, for the same reason. */
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** HSL -> RGB. Hue in degrees, saturation and lightness in [0, 1]. */
function hsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255), 255];
}

// ===========================================================================
// 4. Icons: single glyphs on transparent backgrounds
// ===========================================================================
//
// Every painter draws in a 0..100 coordinate space and is scaled to the output
// size, so the same glyph can be regenerated at any resolution later.
//
// Resource icons are painted in their own identity colour (metal is pewter,
// crystal is cyan, and so on) because those colours are load-bearing: the same
// hue is used for that resource everywhere in the interface.
//
// UI icons are painted white so the app can tint them per context: one warning
// glyph serves as amber "you cannot afford this" and red "this is blocked".

const ICON_COLORS = {
  'resource.metal': [184, 196, 212, 255],
  'resource.crystal': [95, 211, 243, 255],
  'resource.deuterium': [124, 231, 176, 255],
  'resource.energy': [245, 196, 81, 255],
};

const WHITE = [255, 255, 255, 255];

const ICON_PAINTERS = {
  // ---- Resources ---------------------------------------------------------

  /** Stacked metal ingots. */
  'resource.metal': (c, u, color) => {
    const dark = tone(color, 0.62);
    const ingot = (x, y, w, h, col) =>
      fillPolygon(
        c,
        [
          [(x + w * 0.12) * u, y * u],
          [(x + w * 0.88) * u, y * u],
          [(x + w) * u, (y + h) * u],
          [x * u, (y + h) * u],
        ],
        col,
      );
    ingot(34, 14, 32, 17, color); // top
    ingot(14, 36, 32, 17, dark); // middle left
    ingot(54, 36, 32, 17, dark); // middle right
    ingot(24, 58, 52, 19, color); // bottom
  },

  /** A cut gem: table on top, pavilion below. */
  'resource.crystal': (c, u, color) => {
    const dark = tone(color, 0.6);
    const light = tone(color, 1.3);
    fillPolygon(
      c,
      [
        [32 * u, 22 * u],
        [68 * u, 22 * u],
        [90 * u, 46 * u],
        [50 * u, 90 * u],
        [10 * u, 46 * u],
      ],
      color,
    );
    // Right-hand facets catch less light.
    fillPolygon(
      c,
      [
        [68 * u, 22 * u],
        [90 * u, 46 * u],
        [50 * u, 90 * u],
      ],
      dark,
    );
    // The flat table on top.
    fillPolygon(
      c,
      [
        [32 * u, 22 * u],
        [68 * u, 22 * u],
        [60 * u, 40 * u],
        [40 * u, 40 * u],
      ],
      light,
    );
  },

  /** A droplet of heavy water: a circle with a point on top. */
  'resource.deuterium': (c, u, color) => {
    fillCircle(c, 50 * u, 62 * u, 27 * u, color);
    fillPolygon(
      c,
      [
        [50 * u, 10 * u],
        [74 * u, 60 * u],
        [26 * u, 60 * u],
      ],
      color,
    );
    fillCircle(c, 39 * u, 54 * u, 7 * u, tone(color, 1.35));
  },

  /** A lightning bolt. */
  'resource.energy': (c, u, color) => {
    fillPolygon(
      c,
      [
        [60 * u, 6 * u],
        [26 * u, 54 * u],
        [45 * u, 54 * u],
        [38 * u, 94 * u],
        [76 * u, 42 * u],
        [55 * u, 42 * u],
      ],
      color,
    );
  },

  // ---- UI symbols --------------------------------------------------------

  /** Clock: build time. */
  'ui.time': (c, u, color) => {
    fillRing(c, 50 * u, 50 * u, 42 * u, 32 * u, color);
    fillThickLine(c, 50 * u, 50 * u, 50 * u, 26 * u, 9 * u, color);
    fillThickLine(c, 50 * u, 50 * u, 70 * u, 60 * u, 9 * u, color);
  },

  /** Upward arrow: production, or a gain. */
  'ui.production': (c, u, color) => {
    fillPolygon(
      c,
      [
        [50 * u, 8 * u],
        [86 * u, 46 * u],
        [14 * u, 46 * u],
      ],
      color,
    );
    fillRect(c, 36 * u, 46 * u, 28 * u, 46 * u, color);
  },

  /** A silo, part-filled: storage capacity. */
  'ui.storage': (c, u, color) => {
    fillRect(c, 10 * u, 12 * u, 80 * u, 13 * u, color); // lid
    strokeRect(c, 20 * u, 25 * u, 60 * u, 66 * u, 8 * u, color);
    fillRect(c, 28 * u, 57 * u, 44 * u, 26 * u, color); // contents, filled to ~half
  },

  /** Hammer: something under construction. */
  'ui.build': (c, u, color) => {
    fillThickLine(c, 44 * u, 36 * u, 66 * u, 90 * u, 13 * u, color);
    fillPolygon(
      c,
      [
        [14 * u, 20 * u],
        [66 * u, 12 * u],
        [70 * u, 34 * u],
        [18 * u, 42 * u],
      ],
      color,
    );
  },

  /** Padlock: blocked / unavailable. */
  'ui.locked': (c, u, color) => {
    fillRing(c, 50 * u, 44 * u, 25 * u, 16 * u, color);
    fillRect(c, 22 * u, 46 * u, 56 * u, 44 * u, color);
    fillCircle(c, 50 * u, 66 * u, 7 * u, ERASE); // keyhole, punched right through
  },

  /** Tick: ready to go. */
  'ui.check': (c, u, color) => {
    fillThickLine(c, 20 * u, 52 * u, 42 * u, 74 * u, 14 * u, color);
    fillThickLine(c, 42 * u, 74 * u, 80 * u, 24 * u, 14 * u, color);
  },

  /** Warning triangle: you cannot afford this yet. */
  'ui.warning': (c, u, color) => {
    fillPolygon(
      c,
      [
        [50 * u, 8 * u],
        [94 * u, 86 * u],
        [6 * u, 86 * u],
      ],
      color,
    );
    // Punched out, not painted dark, so the glyph survives being tinted.
    fillRect(c, 45 * u, 36 * u, 10 * u, 26 * u, ERASE);
    fillRect(c, 45 * u, 67 * u, 10 * u, 10 * u, ERASE);
  },

  /** Cross: cancel. */
  'ui.cancel': (c, u, color) => {
    fillThickLine(c, 24 * u, 24 * u, 76 * u, 76 * u, 14 * u, color);
    fillThickLine(c, 76 * u, 24 * u, 24 * u, 76 * u, 14 * u, color);
  },

  /** Double chevron: upgrade. */
  'ui.upgrade': (c, u, color) => {
    const chevron = (y) => {
      fillThickLine(c, 18 * u, (y + 26) * u, 50 * u, y * u, 13 * u, color);
      fillThickLine(c, 50 * u, y * u, 82 * u, (y + 26) * u, 13 * u, color);
    };
    chevron(14);
    chevron(50);
  },

  /** Ascending bars: level. */
  'ui.level': (c, u, color) => {
    fillRect(c, 14 * u, 62 * u, 20 * u, 28 * u, color);
    fillRect(c, 40 * u, 42 * u, 20 * u, 48 * u, color);
    fillRect(c, 66 * u, 18 * u, 20 * u, 72 * u, color);
  },

  /** Thermometer. */
  'ui.temperature': (c, u, color) => {
    fillRect(c, 41 * u, 10 * u, 18 * u, 52 * u, color);
    fillCircle(c, 50 * u, 12 * u, 9 * u, color);
    fillCircle(c, 50 * u, 74 * u, 20 * u, color);
  },

  /** Double-headed arrow: diameter. */
  'ui.diameter': (c, u, color) => {
    fillRect(c, 22 * u, 44 * u, 56 * u, 12 * u, color);
    fillPolygon(
      c,
      [
        [6 * u, 50 * u],
        [26 * u, 32 * u],
        [26 * u, 68 * u],
      ],
      color,
    );
    fillPolygon(
      c,
      [
        [94 * u, 50 * u],
        [74 * u, 32 * u],
        [74 * u, 68 * u],
      ],
      color,
    );
  },

  /** Crosshair: coordinates. */
  'ui.coords': (c, u, color) => {
    fillRing(c, 50 * u, 50 * u, 34 * u, 25 * u, color);
    fillRect(c, 44 * u, 4 * u, 12 * u, 22 * u, color);
    fillRect(c, 44 * u, 74 * u, 12 * u, 22 * u, color);
    fillRect(c, 4 * u, 44 * u, 22 * u, 12 * u, color);
    fillRect(c, 74 * u, 44 * u, 22 * u, 12 * u, color);
    fillCircle(c, 50 * u, 50 * u, 8 * u, color);
  },

  /** A price tag: what this costs. */
  'ui.cost': (c, u, color) => {
    fillPolygon(
      c,
      [
        [10 * u, 50 * u],
        [40 * u, 12 * u],
        [92 * u, 12 * u],
        [92 * u, 88 * u],
        [40 * u, 88 * u],
      ],
      color,
    );
    fillCircle(c, 44 * u, 50 * u, 10 * u, ERASE); // the string hole
  },

  /** A world with latitude lines: the Overview tab. */
  'ui.planet': (c, u, color) => {
    fillCircle(c, 50 * u, 50 * u, 40 * u, color);
    fillRect(c, 8 * u, 36 * u, 84 * u, 6 * u, ERASE);
    fillRect(c, 8 * u, 58 * u, 84 * u, 6 * u, ERASE);
    fillCircle(c, 34 * u, 26 * u, 8 * u, ERASE);
  },

  /** A skyline: the Buildings tab. */
  'ui.buildings': (c, u, color) => {
    fillRect(c, 10 * u, 48 * u, 22 * u, 44 * u, color);
    fillRect(c, 38 * u, 24 * u, 24 * u, 68 * u, color);
    fillRect(c, 68 * u, 40 * u, 22 * u, 52 * u, color);
    // Windows, punched out so they survive tinting.
    for (const [x, y] of [
      [16, 56],
      [24, 56],
      [16, 70],
      [24, 70],
      [44, 34],
      [52, 34],
      [44, 48],
      [52, 48],
      [44, 62],
      [52, 62],
      [74, 50],
      [82, 50],
      [74, 64],
      [82, 64],
    ]) {
      fillRect(c, x * u, y * u, 5 * u, 7 * u, ERASE);
    }
  },
};

// ===========================================================================
// 5. Category styling for the big tiles
// ===========================================================================
// Each category gets a solid background colour and a motif shape, so you can
// tell at a glance what kind of thing a tile is even before reading the label.

const CATEGORIES = {
  building: { background: [26, 35, 56, 255], hue: 210, motif: 'rect' },
  planet: { background: [10, 14, 26, 255], hue: 160, motif: 'planet' },
  research: { background: [30, 24, 52, 255], hue: 275, motif: 'hexagon' },
  ship: { background: [20, 38, 44, 255], hue: 185, motif: 'triangle' },
  defense: { background: [46, 26, 30, 255], hue: 5, motif: 'shield' },
  ui: { background: [8, 10, 20, 255], hue: 300, motif: 'none' },
};

const INK = [232, 240, 252, 255];

/**
 * `building.metalMine` -> `METAL MINE`; `planet.temperate.1` -> `TEMPERATE 1`.
 * Splits camelCase so multi-word ids read as multiple words.
 */
function labelFor(key) {
  return key
    .split('.')
    .slice(1)
    .join(' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toUpperCase();
}

/** `building.metalMine` -> `building-metalMine.png`. */
function fileNameFor(key) {
  return `${key.replace(/\./g, '-')}.png`;
}

// ===========================================================================
// 6. The tile renderers
// ===========================================================================

function drawMotif(canvas, motif, accent, shade) {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  // Sit the motif in the upper portion; the label lives underneath it.
  const cy = h * 0.4;
  const r = Math.min(w, h) * 0.22;

  switch (motif) {
    case 'rect':
      // A blocky "structure" with a darker footing, so buildings read as built.
      fillRect(
        canvas,
        Math.round(cx - r),
        Math.round(cy - r),
        Math.round(r * 2),
        Math.round(r * 2),
        accent,
      );
      fillRect(
        canvas,
        Math.round(cx - r),
        Math.round(cy + r * 0.4),
        Math.round(r * 2),
        Math.round(r * 0.6),
        shade,
      );
      strokeRect(
        canvas,
        Math.round(cx - r),
        Math.round(cy - r),
        Math.round(r * 2),
        Math.round(r * 2),
        Math.max(1, Math.round(r * 0.12)),
        INK,
      );
      break;

    case 'planet':
      // Disc plus a crescent of shadow, the cheapest way to read as "sphere".
      fillCircle(canvas, cx, cy, r * 1.35, accent);
      fillCircle(canvas, cx + r * 0.45, cy + r * 0.35, r * 1.15, shade);
      break;

    case 'hexagon':
      // Flat-top hexagon: rotate by 30 degrees so a vertex is not on top.
      fillPolygon(canvas, regularPolygon(cx, cy, r * 1.2, 6, Math.PI / 6), accent);
      fillPolygon(canvas, regularPolygon(cx, cy, r * 0.6, 6, Math.PI / 6), shade);
      break;

    case 'triangle':
      // Point-up triangle = "ship", the oldest visual shorthand in the genre.
      fillPolygon(
        canvas,
        [
          [cx, cy - r * 1.25],
          [cx + r * 1.15, cy + r],
          [cx - r * 1.15, cy + r],
        ],
        accent,
      );
      fillPolygon(
        canvas,
        [
          [cx, cy - r * 0.3],
          [cx + r * 0.5, cy + r * 0.9],
          [cx - r * 0.5, cy + r * 0.9],
        ],
        shade,
      );
      break;

    case 'shield':
      fillPolygon(
        canvas,
        [
          [cx - r, cy - r * 1.1],
          [cx + r, cy - r * 1.1],
          [cx + r, cy + r * 0.3],
          [cx, cy + r * 1.3],
          [cx - r, cy + r * 0.3],
        ],
        accent,
      );
      fillPolygon(
        canvas,
        [
          [cx - r * 0.45, cy - r * 0.6],
          [cx + r * 0.45, cy - r * 0.6],
          [cx + r * 0.45, cy + r * 0.1],
          [cx, cy + r * 0.65],
          [cx - r * 0.45, cy + r * 0.1],
        ],
        shade,
      );
      break;

    default:
      break;
  }
}

function renderTile(key, size) {
  const category = key.split('.')[0];
  const style = CATEGORIES[category] ?? CATEGORIES.ui;
  const canvas = createCanvas(size, size, style.background);

  // Per-key accent: same family as the category, but each item gets its own
  // recognisable shade so a screen full of buildings is not a wall of one blue.
  const hueJitter = (hashString(key) % 60) - 30;
  const accent = hsl(style.hue + hueJitter, 0.55, 0.55);
  const shade = hsl(style.hue + hueJitter, 0.5, 0.32);

  // A hairline frame keeps tiles from bleeding into a dark UI background.
  strokeRect(canvas, 0, 0, size, size, Math.max(1, Math.round(size / 128)), [255, 255, 255, 40]);

  drawMotif(canvas, style.motif, accent, shade);

  const scales = size >= 256 ? [3, 2, 1] : [2, 1];
  drawCenteredLabel(canvas, labelFor(key), size * 0.8, size * 0.88, size * 0.3, INK, scales);

  return canvas;
}

/** A transparent-background glyph, sized for use at 16-24px in the interface. */
function renderIcon(key, size) {
  const canvas = createCanvas(size, size, null);
  ICON_PAINTERS[key](canvas, size / 100, ICON_COLORS[key] ?? WHITE);
  return canvas;
}

/**
 * The screen backdrop: a dark field with a deterministic scatter of stars.
 *
 * Seeded from the asset key itself, so the sky is identical on every run and
 * every machine.
 */
function renderStarfield(size) {
  const canvas = createCanvas(size, size, [5, 7, 15, 255]);
  const rng = mulberry32(hashString('ui.starfield'));

  // A faint nebula wash first, so the field is not a flat black rectangle.
  for (let i = 0; i < 6; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const radius = size * (0.08 + rng() * 0.18);
    const color = hsl(200 + rng() * 100, 0.5, 0.5);
    fillCircle(canvas, cx, cy, radius, [color[0], color[1], color[2], 10]);
  }

  // Then the stars: mostly tiny, a few bright ones with a cross-flare.
  for (let i = 0; i < 900; i++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    const roll = rng();
    const brightness = 120 + Math.floor(rng() * 135);
    const star = [brightness, brightness, Math.min(255, brightness + 20), 255];

    if (roll > 0.985) {
      fillCircle(canvas, x, y, 2, star);
      fillRect(canvas, x - 4, y, 9, 1, [star[0], star[1], star[2], 90]);
      fillRect(canvas, x, y - 4, 1, 9, [star[0], star[1], star[2], 90]);
    } else if (roll > 0.9) {
      fillRect(canvas, x, y, 2, 2, star);
    } else {
      setPixel(canvas, x, y, star);
    }
  }

  return canvas;
}

/**
 * The fallback tile. Magenta-and-black checkerboard is the universal "this
 * texture is missing" signal, borrowed from Source and Unreal - it is
 * deliberately hideous so a missing asset can never quietly ship.
 */
function renderMissing(size) {
  const canvas = createCanvas(size, size, [0, 0, 0, 255]);
  const cell = size / 8;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 0) continue;
      fillRect(canvas, col * cell, row * cell, cell, cell, [255, 0, 255, 255]);
    }
  }
  drawCenteredLabel(canvas, 'MISSING', size / 2, size * 0.9, size * 0.3, WHITE, [3, 2, 1]);
  return canvas;
}

// ===========================================================================
// 7. The asset list
// ===========================================================================
// These strings are the manifest keys the app uses. Adding one here and
// re-running the script is the entire process for adding an asset.

const BUILDING_KEYS = [
  'building.metalMine',
  'building.crystalMine',
  'building.deuteriumSynthesizer',
  'building.solarPlant',
  'building.roboticsFactory',
  'building.shipyard',
  'building.researchLab',
  'building.metalStorage',
  'building.crystalStorage',
  'building.deuteriumTank',
];

const RESOURCE_KEYS = [
  'resource.metal',
  'resource.crystal',
  'resource.deuterium',
  'resource.energy',
];

const PLANET_KEYS = [
  'planet.temperate.1',
  'planet.temperate.2',
  'planet.desert.1',
  'planet.ice.1',
  'planet.gas.1',
];

const RESEARCH_KEYS = [
  'research.energy',
  'research.laser',
  'research.ion',
  'research.hyperspace',
  'research.plasma',
  'research.combustionDrive',
  'research.impulseDrive',
  'research.hyperspaceDrive',
  'research.espionage',
  'research.computer',
  'research.astrophysics',
  'research.weapons',
  'research.shielding',
  'research.armour',
];

const SHIP_KEYS = [
  'ship.smallCargo',
  'ship.largeCargo',
  'ship.lightFighter',
  'ship.heavyFighter',
  'ship.cruiser',
  'ship.battleship',
  'ship.colonyShip',
  'ship.recycler',
  'ship.espionageProbe',
  'ship.bomber',
  'ship.destroyer',
  'ship.deathstar',
  'ship.battlecruiser',
];

const DEFENSE_KEYS = [
  'defense.rocketLauncher',
  'defense.lightLaser',
  'defense.heavyLaser',
  'defense.gaussCannon',
  'defense.ionCannon',
  'defense.plasmaTurret',
  'defense.smallShield',
  'defense.largeShield',
];

/** Interface glyphs. White on transparent, meant to be tinted at the call site. */
const UI_ICON_KEYS = [
  'ui.time',
  'ui.production',
  'ui.storage',
  'ui.build',
  'ui.locked',
  'ui.check',
  'ui.warning',
  'ui.cancel',
  'ui.upgrade',
  'ui.level',
  'ui.temperature',
  'ui.diameter',
  'ui.coords',
  'ui.cost',
  'ui.planet',
  'ui.buildings',
];

/** key -> pixel size. Icons are small because they are drawn small. */
const ASSET_SIZES = new Map([
  ...BUILDING_KEYS.map((k) => [k, 256]),
  ...RESOURCE_KEYS.map((k) => [k, 64]),
  ...PLANET_KEYS.map((k) => [k, 256]),
  ...RESEARCH_KEYS.map((k) => [k, 256]),
  ...SHIP_KEYS.map((k) => [k, 256]),
  ...DEFENSE_KEYS.map((k) => [k, 256]),
  ...UI_ICON_KEYS.map((k) => [k, 64]),
  ['ui.starfield', 1024],
  ['ui.missing', 256],
]);

const ALL_KEYS = [...ASSET_SIZES.keys()];

// ===========================================================================
// 8. The manifest
// ===========================================================================

function buildManifestSource(keys) {
  const keyList = keys.map((k) => `  '${k}',`).join('\n');
  const requires = keys
    .map((k) => `  '${k}': require('./placeholders/${fileNameFor(k)}'),`)
    .join('\n');
  const iconList = Object.keys(ICON_PAINTERS)
    .map((k) => `  '${k}',`)
    .join('\n');

  return `/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate with: npm run gen:placeholders
 *
 * -----------------------------------------------------------------------
 * To replace placeholder art, put your file in \`src/assets/art/\` and change
 * the require path here - nothing else in the app needs to change.
 * -----------------------------------------------------------------------
 *
 * For example, once you have real art for the metal mine:
 *
 *     'building.metalMine': require('./art/metal-mine.png'),
 *
 * Every screen reaches images through \`<GameImage id="building.metalMine" />\`,
 * which looks the key up in this table. The key is the app-facing name; the
 * file path is an implementation detail that lives only in this file.
 *
 * (Note that once you hand-edit a require path, re-running the generator will
 * overwrite it. At that point the asset has graduated: move its key out of
 * scripts/gen-placeholders.mjs and into a hand-written companion module.)
 *
 * Why \`require()\` and not \`import\`? React Native's bundler statically analyses
 * \`require()\` calls to build the asset registry, resolving @2x/@3x variants and
 * bundling the right density per device. A dynamic path would silently produce
 * a missing image on a real device even though it worked on web.
 */

import type { ImageSourcePropType } from 'react-native';

import type { Planet } from '@/engine';

/**
 * Every asset key, as a runtime array. \`as const\` is what lets us derive the
 * \`AssetKey\` union from it, so the type and the data can never drift apart.
 */
export const ASSET_KEYS = [
${keyList}
] as const;

/** The union of every valid asset key, e.g. \`'building.metalMine'\`. */
export type AssetKey = (typeof ASSET_KEYS)[number];

/**
 * The asset table. Typed as an exhaustive \`Record\`, so forgetting an entry is
 * a compile error rather than a magenta checkerboard at runtime.
 */
export const ASSETS: Record<AssetKey, ImageSourcePropType> = {
${requires}
};

/**
 * Keys drawn as a single glyph on a transparent background, rather than as a
 * framed tile with a caption.
 *
 * \`<GameImage>\` uses this to decide whether to draw a rounded card behind the
 * image, so call sites never have to remember which is which. The \`ui.*\` ones
 * are painted white on purpose - tint them at the call site to colour-code
 * meaning (amber for "cannot afford", red for "blocked", green for "ready").
 */
export const ICON_KEYS = [
${iconList}
] as const satisfies readonly AssetKey[];

export type IconKey = (typeof ICON_KEYS)[number];

const ICON_KEY_SET: ReadonlySet<string> = new Set(ICON_KEYS);

export function isIconKey(key: AssetKey): key is IconKey {
  return ICON_KEY_SET.has(key);
}

// ---------------------------------------------------------------------------
// Planet art selection
// ---------------------------------------------------------------------------

/** Which art variants exist for each planet type, in variant order. */
const PLANET_VARIANTS = {
  temperate: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.temperate.')),
  desert: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.desert.')),
  ice: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.ice.')),
  gas: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.gas.')),
};

export type PlanetType = keyof typeof PLANET_VARIANTS;

/**
 * A planet's climate type, derived from its average surface temperature.
 *
 * Exported separately from \`planetArtKey\` because the interface wants to *say*
 * "TEMPERATE" as well as draw it - a label the player can read beats a picture
 * they have to interpret.
 */
export function planetType(planet: Planet): PlanetType {
  const avgTemp = (planet.temperature.min + planet.temperature.max) / 2;
  return avgTemp >= 60 ? 'desert' : avgTemp <= -60 ? 'gas' : avgTemp <= -20 ? 'ice' : 'temperate';
}

/**
 * Pick a planet's artwork deterministically from its own data.
 *
 * Two inputs, doing two different jobs:
 *
 * - **Temperature picks the *type*.** A world averaging 90 C is a desert, one
 *   at -70 C is a frozen gas giant. This is the same number the deuterium
 *   formula uses, so what the player sees agrees with what they earn.
 * - **Orbital position picks the *variant*.** Purely cosmetic - it just stops
 *   every temperate world in the galaxy from looking identical.
 *
 * Deterministic on purpose: a planet must not change appearance between app
 * launches, and we do not want to store an art id in the save file for
 * something we can always re-derive.
 */
export function planetArtKey(planet: Planet): AssetKey {
  const variants = PLANET_VARIANTS[planetType(planet)];
  if (variants.length === 0) return 'ui.missing';

  // Positions are 1-based, so subtract one before taking the modulus.
  return variants[Math.abs(planet.coords.position - 1) % variants.length];
}
`;
}

// ===========================================================================
// 9. Run
// ===========================================================================

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Remove PNGs from a previous run first, so a key that has been deleted from
  // the lists above does not linger as an orphaned file in git.
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith('.png')) unlinkSync(join(OUT_DIR, file));
  }

  for (const key of ALL_KEYS) {
    const size = ASSET_SIZES.get(key);
    const canvas =
      key === 'ui.starfield'
        ? renderStarfield(size)
        : key === 'ui.missing'
          ? renderMissing(size)
          : ICON_PAINTERS[key]
            ? renderIcon(key, size)
            : renderTile(key, size);

    // `deflateLevel`/`deflateStrategy` are pinned so the compressed bytes are
    // identical run to run - otherwise git would show a diff for every asset
    // every time the script runs, which makes the committed PNGs useless.
    const buffer = PNG.sync.write(canvas.png, { deflateLevel: 9, deflateStrategy: 3 });
    writeFileSync(join(OUT_DIR, fileNameFor(key)), buffer);
  }

  writeFileSync(MANIFEST_PATH, buildManifestSource(ALL_KEYS), 'utf8');

  const iconCount = Object.keys(ICON_PAINTERS).length;
  console.log(
    `Generated ${ALL_KEYS.length} placeholder assets ` +
      `(${iconCount} glyph icons, ${ALL_KEYS.length - iconCount - 2} tiles) ` +
      `in src/assets/placeholders/`,
  );
  console.log('Regenerated src/assets/manifest.ts');
}

main();
