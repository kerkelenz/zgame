/**
 * Image pipeline helper.
 *   npm run art                       status: what has a picture, what is missing
 *   npm run art -- next [n]           the next n (default 4) missing items with prompts to paste into the generator
 *   npm run art -- all                write art/PROMPTS.md with every prompt
 *   npm run art -- ingest <folder>    take a folder of generated pictures (optionally split into buildings/ ships/ research/ defenses/ planets/ moons/
 *                                     sub-folders), work out which item each belongs to from its file name, shrink it and save it as
 *                                     client/src/assets/art/<id>.webp; the folder is left untouched
 *   npm run art -- optimize           shrink pictures already in client/src/assets/art that are larger than needed
 * The game picks the files up on the next build.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { artIdFromFile, artItems } from '../shared/artlist';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'client', 'src', 'assets', 'art');
mkdirSync(dir, { recursive: true });
const IMG = /\.(png|webp|jpe?g)$/i;
const MAX_SIDE = 768;
/** the wide banners are shown across the page: up to this wide, and they get no small copy */
const BANNER_WIDTH = 1400;
const isBanner = (id: string) => /^(planet|moon)banner-/.test(id);
const THUMB = /\.thumb\.webp$/i;
const have = () => new Set(readdirSync(dir).filter((f) => IMG.test(f) && !THUMB.test(f)).map((f) => f.replace(/\.[a-z]+$/i, '')));
const items = artItems();
const [cmd = 'status', arg] = process.argv.slice(2);

/** longest side at most MAX_SIDE, same proportions, WebP */
const shrinkBanner = (input: Buffer) => sharp(input).resize(BANNER_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
const shrink = (input: Buffer) => sharp(input).resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
/** the small square copy used by lists and icons: 256 px, cropped to the middle */
const thumb = (input: Buffer) => sharp(input).resize(256, 256, { fit: 'cover' }).webp({ quality: 78 }).toBuffer();
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

async function ingest(from: string) {
  const ids = items.map((i) => i.id);
  const files: { path: string; folder: string }[] = [];
  const walk = (d: string, folder: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p, name.toLowerCase());
      else if (IMG.test(name)) files.push({ path: p, folder });
    }
  };
  walk(from, '');
  const unmatched: string[] = [], seen = new Map<string, string>();
  let before = 0, after = 0;
  for (const f of files) {
    const id = artIdFromFile(basename(f.path), f.folder, ids);
    if (!id) { unmatched.push(f.path); continue; }
    if (seen.has(id)) { console.log(`duplicate for ${id}: ${basename(f.path)} (keeping ${basename(seen.get(id)!)})`); continue; }
    seen.set(id, f.path);
    const src = readFileSync(f.path);
    const banner = isBanner(id);
    const out = banner ? await shrinkBanner(src) : await shrink(src);
    writeFileSync(join(dir, `${id}.webp`), out);
    if (!banner) writeFileSync(join(dir, `${id}.thumb.webp`), await thumb(out));
    before += src.length; after += out.length;
    console.log(`${id.padEnd(24)} ${basename(f.path).slice(0, 40).padEnd(40)} ${kb(src.length)} -> ${kb(out.length)}`);
  }
  console.log(`\n${seen.size} saved, ${kb(before)} -> ${kb(after)}`);
  if (unmatched.length) console.log('could not match to an item:\n  ' + unmatched.join('\n  '));
}

async function optimize() {
  let before = 0, after = 0, n = 0, thumbs = 0;
  for (const f of readdirSync(dir).filter((x) => IMG.test(x) && !THUMB.test(x))) {
    const p = join(dir, f);
    let src = readFileSync(p);
    const meta = await sharp(src).metadata();
    const banner = isBanner(f.replace(/\.[a-z]+$/i, ''));
    if (banner ? (meta.width ?? 0) > BANNER_WIDTH || !/\.webp$/i.test(f) : Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_SIDE || !/\.webp$/i.test(f)) {
      const out = banner ? await shrinkBanner(src) : await shrink(src);
      writeFileSync(p.replace(/\.[a-z]+$/i, '.webp'), out);
      before += src.length; after += out.length; n++;
      console.log(`${f.padEnd(34)} ${kb(src.length)} -> ${kb(out.length)}`);
      src = out;
    }
    // every picture also has a small square copy for lists and icons
    const small = join(dir, f.replace(/\.[a-z]+$/i, '.thumb.webp'));
    if (!banner && !existsSync(small)) { writeFileSync(small, await thumb(src)); thumbs++; }
  }
  console.log(n ? `${n} shrunk, ${kb(before)} -> ${kb(after)}` : 'nothing to shrink', `; ${thumbs} small copies made`);
}

const show = (list: typeof items) => list.forEach((i, n) => console.log(`\n${n + 1}. save as ${i.id}.png   (${i.kind}: ${i.name})\n${i.prompt}`));

if (cmd === 'ingest') {
  if (!arg) { console.log('usage: npm run art -- ingest <folder>'); process.exit(1); }
  await ingest(arg);
} else if (cmd === 'optimize') {
  await optimize();
} else if (cmd === 'next') {
  const missing = items.filter((i) => !have().has(i.id));
  console.log(`${items.length - missing.length}/${items.length} done, ${missing.length} to go`);
  show(missing.slice(0, Number(arg) || 4));
} else if (cmd === 'all') {
  const out = join(__dirname, '..', 'art', 'PROMPTS.md');
  mkdirSync(join(__dirname, '..', 'art'), { recursive: true });
  const h = have();
  writeFileSync(out, `# Image prompts\n\nSave each as client/src/assets/art/<id>.png\n\n${items.map((i) => `## ${i.id} (${i.kind})${h.has(i.id) ? ' - done' : ''}\n\n${i.prompt}\n`).join('\n')}`);
  console.log(`wrote ${out}`);
} else {
  const h = have(), missing = items.filter((i) => !h.has(i.id));
  console.log(`${items.length - missing.length}/${items.length} done`);
  for (const k of ['resource', 'building', 'tech', 'ship', 'defense', 'planet', 'moon', 'banner'] as const) {
    const of = items.filter((i) => i.kind === k);
    console.log(`${k.padEnd(9)} ${of.filter((i) => h.has(i.id)).length}/${of.length}${of.some((i) => !h.has(i.id)) ? '  missing: ' + of.filter((i) => !h.has(i.id)).map((i) => i.id).join(', ') : ''}`);
  }
  const unknown = [...h].filter((id) => !items.some((i) => i.id === id));
  if (unknown.length) console.log('unrecognised file names (typo?): ' + unknown.join(', '));
}
