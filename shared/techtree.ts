import { BUILDINGS, TECHS, UNITS, buildingAllowed } from './data';
import { kindOf, nameOf, requirementsOf, type ItemKind } from './effects';
import type { BuildingId } from './types';

/** The dependency graph behind the Tech tree page: every building, research, ship and defense with what it needs. Pure, so it can be tested. */
export interface TreeNode { id: string; kind: ItemKind; name: string; requires: { id: string; level: number }[]; tier: number; moonOnly: boolean }

const ALL_IDS = [...Object.keys(BUILDINGS), ...Object.keys(TECHS), ...Object.keys(UNITS)];

const tiers = new Map<string, number>();
function tierOf(id: string, seen: string[] = []): number {
  const known = tiers.get(id);
  if (known !== undefined) return known;
  if (seen.includes(id)) return 0;                                   // a cycle would be a data bug; the test checks there is none
  const reqs = requirementsOf(id);
  const t = reqs.length ? 1 + Math.max(...reqs.map((r) => tierOf(r.id, [...seen, id]))) : 0;
  tiers.set(id, t);
  return t;
}

export const TREE: TreeNode[] = ALL_IDS.map((id) => ({
  id, kind: kindOf(id)!, name: nameOf(id), requires: requirementsOf(id).map((r) => ({ id: r.id, level: r.level })), tier: tierOf(id),
  moonOnly: id in BUILDINGS && !buildingAllowed(id as BuildingId, false),
}));
const BY_ID = new Map(TREE.map((n) => [n.id, n]));
export const nodeOf = (id: string) => BY_ID.get(id);

/** everything that must be built or researched, directly or indirectly, before this */
export function ancestors(id: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (x: string) => { for (const r of BY_ID.get(x)?.requires ?? []) { if ((out.get(r.id) ?? 0) < r.level) { out.set(r.id, r.level); walk(r.id); } } };
  walk(id);
  return out;
}

/** everything that directly or indirectly needs this */
export function descendants(id: string): Set<string> {
  const out = new Set<string>();
  const walk = (x: string) => { for (const n of TREE) if (!out.has(n.id) && n.requires.some((r) => r.id === x)) { out.add(n.id); walk(n.id); } };
  walk(id);
  return out;
}

/** how things feed each other: for each output, what raises it. `id` links to an item, otherwise the text stands alone. */
export interface Influence { id?: string; text: string }
export interface Flow { id: string; title: string; summary: string; boosts: Influence[]; limits?: Influence[] }
export const FLOWS: Flow[] = [
  {
    id: 'metal', title: 'Metal', summary: 'Mined by the Metal Mine. Output needs energy.',
    boosts: [
      { id: 'metalMine', text: 'the main source; every level raises output' },
      { id: 'plasma', text: '+1% per level' },
      { id: 'crawler', text: '+0.1% each, up to +50% in total' },
      { text: 'Orbit positions 6 to 10 on the planet (best at 8: +35%)' },
      { text: 'Quartermaster officer (+5% per rank), alliance Shared Mining Network upgrade, held systems (territory), the Collector class' },
    ],
    limits: [{ id: 'metalStorage', text: 'raises the cap production stops at' }, { id: 'solarPlant', text: 'too little energy cuts every mine' }],
  },
  {
    id: 'crystal', title: 'Crystal', summary: 'Mined by the Crystal Mine. Output needs energy.',
    boosts: [
      { id: 'crystalMine', text: 'the main source' },
      { id: 'plasma', text: '+0.66% per level' },
      { id: 'crawler', text: 'the same crawler bonus as metal' },
      { text: 'Orbit positions 1 to 3 (best at 1: +40%)' },
      { text: 'Quartermaster officer, alliance Shared Mining Network upgrade, held systems, the Collector class' },
    ],
    limits: [{ id: 'crystalStorage', text: 'raises the cap production stops at' }],
  },
  {
    id: 'gas', title: 'Vespene Gas', summary: 'Drawn by the Vespene Extractor; colder planets yield more. Fusion Reactors burn it.',
    boosts: [
      { id: 'deuteriumSynthesizer', text: 'the main source' },
      { id: 'plasma', text: '+0.33% per level' },
      { id: 'crawler', text: 'the same crawler bonus as the other mines' },
      { text: 'Colder planets (the far orbit positions)' },
      { text: 'Quartermaster officer, alliance Shared Mining Network upgrade, held systems' },
    ],
    limits: [{ id: 'deuteriumTank', text: 'raises the cap production stops at' }, { id: 'fusionReactor', text: 'burns vespene gas for energy, which lowers the net amount' }],
  },
  {
    id: 'energy', title: 'Energy', summary: 'Every mine and every working crawler draws energy. If production falls short, all mines slow down together.',
    boosts: [
      { id: 'solarPlant', text: 'cheap and steady' },
      { id: 'fusionReactor', text: 'large output for vespene gas; needs a Vespene Extractor and Energy Technology' },
      { id: 'energy', text: 'raises Fusion Reactor output' },
      { id: 'solarSatellite', text: 'a satellite in orbit adds energy without taking a building slot' },
      { text: 'Chief Engineer officer (+5% per rank)' },
    ],
    limits: [{ id: 'crawler', text: 'each working crawler draws 6 energy' }],
  },
  {
    id: 'build', title: 'Construction speed', summary: 'How fast buildings finish.',
    boosts: [
      { id: 'roboticsFactory', text: 'each level shortens construction' },
      { id: 'naniteFactory', text: 'halves construction and shipbuilding time per level' },
      { text: 'Chief Engineer officer (-10% per rank)' },
    ],
  },
  {
    id: 'research', title: 'Research speed', summary: 'How fast research finishes.',
    boosts: [
      { id: 'researchLab', text: 'required, and each level speeds research up' },
      { id: 'graviton', text: 'a very expensive tech whose price is energy output' },
      { text: 'Chief Engineer officer (-10% per rank), alliance Joint Research Institute upgrade (-3% per level)' },
    ],
  },
  {
    id: 'ships', title: 'Shipbuilding speed', summary: 'How fast ships and defenses finish.',
    boosts: [
      { id: 'shipyard', text: 'required; each level speeds it up' },
      { id: 'naniteFactory', text: 'halves shipbuilding time per level' },
      { text: 'Chief Engineer officer (-10% per rank)' },
    ],
  },
  {
    id: 'drives', title: 'Fleet speed', summary: 'Each ship uses the drive it was built for.',
    boosts: [
      { id: 'combustionDrive', text: '+10% per level for combustion ships (cargos, light fighters, recyclers)' },
      { id: 'impulseDrive', text: '+20% per level for impulse ships (heavy fighters, cruisers, bombers, colony ships)' },
      { id: 'hyperspaceDrive', text: '+30% per level for hyperspace ships (battleships, battlecruisers, destroyers, Deathstars)' },
      { text: 'General class, alliance Allied Logistics upgrade (+3% per level)' },
    ],
  },
  {
    id: 'war', title: 'Fleet strength', summary: 'What makes your ships and defenses hit harder and last longer.',
    boosts: [
      { id: 'weapons', text: '+10% attack per level' },
      { id: 'shielding', text: '+10% shield per level' },
      { id: 'armour', text: '+10% hull per level' },
      { text: 'Faction perks, character class and ship rapid fire' },
    ],
  },
  {
    id: 'reach', title: 'Reach and slots', summary: 'How many planets, fleets and expeditions you can run.',
    boosts: [
      { id: 'astrophysics', text: 'more planets and expedition slots' },
      { id: 'computer', text: '+1 fleet slot per level' },
      { id: 'terraformer', text: '+5 building spaces on a planet' },
      { id: 'lunarBase', text: 'moons only: +3 building spaces per level' },
      { text: 'Fleet Admiral officer, alliance Joint Command upgrade' },
    ],
  },
];

// ---------------------------------------------------------------- layout

/** levels drawn for an item: every level something requires, and at least a few more (units have one) */
export const MIN_LEVELS_SHOWN = 5;
export function levelsShown(id: string): number {
  const n = nodeOf(id);
  if (!n || (n.kind !== 'building' && n.kind !== 'tech')) return 1;
  let top = 0;
  for (const o of TREE) for (const r of o.requires) if (r.id === id) top = Math.max(top, r.level);
  return Math.max(top, MIN_LEVELS_SHOWN);
}

export interface ItemEdge { from: string; to: string; level: number }
export const ITEM_EDGES: ItemEdge[] = TREE.flatMap((n) => n.requires.map((r) => ({ from: r.id, to: n.id, level: r.level })));

let cols: string[][] | null = null;
/** One column per step, left to right. Items are ordered inside each column to keep the arrows between columns short and untangled. */
export function columns(): string[][] {
  if (cols) return cols;
  const out: string[][] = [];
  for (const n of [...TREE].sort((a, b) => a.name.localeCompare(b.name))) (out[n.tier] ||= []).push(n.id);
  const needs = new Map<string, string[]>(), feeds = new Map<string, string[]>();
  for (const n of TREE) { needs.set(n.id, []); feeds.set(n.id, []); }
  for (const e of ITEM_EDGES) { needs.get(e.to)!.push(e.from); feeds.get(e.from)!.push(e.to); }
  const index = () => new Map(out.flatMap((c) => c.map((id, i) => [id, i / Math.max(1, c.length - 1)] as const)));
  const sweep = (c: string[], links: Map<string, string[]>) => {
    const pos = index();
    const score = new Map(c.map((id) => { const l = links.get(id)!; return [id, l.length ? l.reduce((s, o) => s + pos.get(o)!, 0) / l.length : pos.get(id)!] as const; }));
    c.sort((a, b) => score.get(a)! - score.get(b)! || a.localeCompare(b));
  };
  for (let pass = 0; pass < 6; pass++) {
    for (let t = 1; t < out.length; t++) sweep(out[t], needs);
    for (let t = out.length - 2; t >= 0; t--) sweep(out[t], feeds);
  }
  cols = out.map((c) => c ?? []);
  return cols;
}

/** every item that must come first, with the highest level any path needs, and the target itself, in the order to do them */
export function pathTo(id: string): { id: string; level: number }[] {
  const out = [...ancestors(id).entries()].map(([x, level]) => ({ id: x, level }));
  out.sort((a, b) => nodeOf(a.id)!.tier - nodeOf(b.id)!.tier || nodeOf(a.id)!.name.localeCompare(nodeOf(b.id)!.name));
  return out;
}
