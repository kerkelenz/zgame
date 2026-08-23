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

function createCanvas(width, height, background) {
  const png = new PNG({ width, height });
  const canvas = { png, width, height };
  fillRect(canvas, 0, 0, width, height, background);
  return canvas;
}

/** Alpha-blend a colour into a single pixel. */
function setPixel(canvas, x, y, [r, g, b, a = 255]) {
  // Silently clip out-of-bounds writes: drawing routines below are allowed to
  // be sloppy at the edges, which keeps them much simpler to read.
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

  const i = (canvas.width * Math.floor(y) + Math.floor(x)) << 2;
  const data = canvas.png.data;
  const alpha = a / 255;
  data[i] = Math.round(data[i] * (1 - alpha) + r * alpha);
  data[i + 1] = Math.round(data[i + 1] * (1 - alpha) + g * alpha);
  data[i + 2] = Math.round(data[i + 2] * (1 - alpha) + b * alpha);
  data[i + 3] = 255;
}

function fillRect(canvas, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) setPixel(canvas, px, py, color);
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

/**
 * Scanline-fill an arbitrary convex or concave polygon.
 *
 * The even-odd rule: for each row of pixels, find every place the polygon's
 * edges cross that row, sort those crossings left to right, and fill between
 * pairs. It is the standard textbook algorithm and it handles our triangles,
 * hexagons and shields with one implementation.
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
      // Half-open comparison (`<=` on one end, `<` on the other) avoids
      // counting a shared vertex twice.
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

function regularPolygon(cx, cy, radius, sides, rotation = 0) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * 2 * Math.PI) / sides;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
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
      drawText(canvas, line, Math.round((canvas.width - textWidth(line, scale)) / 2), y, scale, color);
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
// 4. Category styling
// ===========================================================================
// Each category gets a solid background colour and a motif shape, so you can
// tell at a glance what kind of thing a tile is even before reading the label.

const CATEGORIES = {
  building: { background: [26, 35, 56, 255], hue: 210, motif: 'rect' },
  resource: { background: [24, 30, 44, 255], hue: 35, motif: 'circle' },
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
// 5. The tile renderers
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
      fillRect(canvas, Math.round(cx - r), Math.round(cy - r), Math.round(r * 2), Math.round(r * 2), accent);
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

    case 'circle':
      fillCircle(canvas, cx, cy, r, accent);
      fillCircle(canvas, cx - r * 0.3, cy - r * 0.3, r * 0.35, INK);
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
  strokeRect(canvas, 0, 0, size, size, Math.max(1, Math.round(size / 128)), [
    255,
    255,
    255,
    40,
  ]);

  drawMotif(canvas, style.motif, accent, shade);

  const scales = size >= 256 ? [3, 2, 1] : [2, 1];
  drawCenteredLabel(canvas, labelFor(key), size * 0.8, size * 0.88, size * 0.3, INK, scales);

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
  drawCenteredLabel(canvas, 'MISSING', size / 2, size * 0.9, size * 0.3, [255, 255, 255, 255], [3, 2, 1]);
  return canvas;
}

// ===========================================================================
// 6. The asset list
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

const RESOURCE_KEYS = ['resource.metal', 'resource.crystal', 'resource.deuterium', 'resource.energy'];

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

/** key -> pixel size. Resource icons are small because they sit in a status bar. */
const ASSET_SIZES = new Map([
  ...BUILDING_KEYS.map((k) => [k, 256]),
  ...RESOURCE_KEYS.map((k) => [k, 64]),
  ...PLANET_KEYS.map((k) => [k, 256]),
  ...RESEARCH_KEYS.map((k) => [k, 256]),
  ...SHIP_KEYS.map((k) => [k, 256]),
  ...DEFENSE_KEYS.map((k) => [k, 256]),
  ['ui.starfield', 1024],
  ['ui.missing', 256],
]);

const ALL_KEYS = [...ASSET_SIZES.keys()];

// ===========================================================================
// 7. The manifest
// ===========================================================================

function buildManifestSource(keys) {
  const keyList = keys.map((k) => `  '${k}',`).join('\n');
  const requires = keys
    .map((k) => `  '${k}': require('./placeholders/${fileNameFor(k)}'),`)
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
  const avgTemp = (planet.temperature.min + planet.temperature.max) / 2;

  const type =
    avgTemp >= 60 ? 'desert' : avgTemp <= -60 ? 'gas' : avgTemp <= -20 ? 'ice' : 'temperate';

  const variants = PLANET_VARIANTS[type];
  if (variants.length === 0) return 'ui.missing';

  // Positions are 1-based, so subtract one before taking the modulus.
  return variants[Math.abs(planet.coords.position - 1) % variants.length];
}
`;
}

// ===========================================================================
// 8. Run
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
          : renderTile(key, size);

    // `deflateLevel`/`deflateStrategy` are pinned so the compressed bytes are
    // identical run to run - otherwise git would show a diff for every asset
    // every time the script runs, which makes the committed PNGs useless.
    const buffer = PNG.sync.write(canvas.png, { deflateLevel: 9, deflateStrategy: 3 });
    writeFileSync(join(OUT_DIR, fileNameFor(key)), buffer);
  }

  writeFileSync(MANIFEST_PATH, buildManifestSource(ALL_KEYS), 'utf8');

  console.log(`Generated ${ALL_KEYS.length} placeholder assets in src/assets/placeholders/`);
  console.log('Regenerated src/assets/manifest.ts');
}

main();
