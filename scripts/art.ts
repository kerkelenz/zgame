/**
 * Image pipeline helper.
 *   npm run art              status: what has a picture, what is missing
 *   npm run art -- next [n]  the next n (default 4) missing items with prompts to paste into the generator
 *   npm run art -- all       write art/PROMPTS.md with every prompt
 * Save each result as client/src/assets/art/<id>.png (webp/jpg also work); the game picks them up on the next build.
 */
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { artItems } from '../shared/artlist';

const dir = join(__dirname, '..', 'client', 'src', 'assets', 'art');
mkdirSync(dir, { recursive: true });
const have = new Set(readdirSync(dir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f)).map((f) => f.replace(/\.[a-z]+$/i, '')));
const items = artItems();
const missing = items.filter((i) => !have.has(i.id));
const [cmd = 'status', arg] = process.argv.slice(2);

const show = (list: typeof items) => list.forEach((i, n) => console.log(`\n${n + 1}. save as ${i.id}.png   (${i.kind}: ${i.name})\n${i.prompt}`));

if (cmd === 'next') {
  const n = Number(arg) || 4;
  console.log(`${items.length - missing.length}/${items.length} done, ${missing.length} to go`);
  show(missing.slice(0, n));
} else if (cmd === 'all') {
  const out = join(__dirname, '..', 'art', 'PROMPTS.md');
  mkdirSync(join(__dirname, '..', 'art'), { recursive: true });
  writeFileSync(out, `# Image prompts\n\nSave each as client/src/assets/art/<id>.png\n\n${items.map((i) => `## ${i.id} (${i.kind})${have.has(i.id) ? ' - done' : ''}\n\n${i.prompt}\n`).join('\n')}`);
  console.log(`wrote ${out}`);
} else {
  console.log(`${items.length - missing.length}/${items.length} done`);
  for (const k of ['resource', 'building', 'tech', 'ship', 'defense'] as const) {
    const of = items.filter((i) => i.kind === k);
    console.log(`${k.padEnd(9)} ${of.filter((i) => have.has(i.id)).length}/${of.length}${of.some((i) => !have.has(i.id)) ? '  missing: ' + of.filter((i) => !have.has(i.id)).map((i) => i.id).join(', ') : ''}`);
  }
  const unknown = [...have].filter((id) => !items.some((i) => i.id === id));
  if (unknown.length) console.log('unrecognised file names (typo?): ' + unknown.join(', '));
}
