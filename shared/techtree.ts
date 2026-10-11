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

// ---------------------------------------------------------------- level graph

/** A node of the progression graph: one level of one building or research (units are a single node at level 1). */
export interface LevelNode { key: string; id: string; level: number; kind: ItemKind; name: string; layer: number; lane: number }
export interface LevelEdge { from: string; to: string; kind: 'level' | 'needs'; /** the level of the requirement, for 'needs' */ at?: number }
export interface LevelGraph { nodes: LevelNode[]; edges: LevelEdge[]; lanes: string[]; layers: number; preds: Map<string, string[]>; succs: Map<string, string[]> }

/** levels shown for things nothing else needs beyond this */
export const MIN_LEVELS_SHOWN = 5;
export const levelKey = (id: string, level: number) => `${id}@${level}`;

/** how many levels of an item appear in the graph: every level something requires, and at least a few more */
export function levelsShown(id: string): number {
  const n = nodeOf(id);
  if (!n || (n.kind !== 'building' && n.kind !== 'tech')) return 1;
  let top = 0;
  for (const o of TREE) for (const r of o.requires) if (r.id === id) top = Math.max(top, r.level);
  return Math.max(top, MIN_LEVELS_SHOWN);
}

let cached: LevelGraph | null = null;
/** The whole progression as a directed graph: Energy 1 -> Energy 2 -> ..., and Energy 3 -> Fusion Reactor 1 where fusion needs Energy 3. Laid out in layers (left to right) and lanes (one per item). */
export function levelGraph(): LevelGraph {
  if (cached) return cached;
  const nodes = new Map<string, LevelNode>();
  const edges: LevelEdge[] = [];
  for (const n of TREE) for (let l = 1; l <= levelsShown(n.id); l++) nodes.set(levelKey(n.id, l), { key: levelKey(n.id, l), id: n.id, level: l, kind: n.kind, name: n.name, layer: 0, lane: 0 });
  for (const n of TREE) {
    for (let l = 2; l <= levelsShown(n.id); l++) edges.push({ from: levelKey(n.id, l - 1), to: levelKey(n.id, l), kind: 'level' });
    for (const r of n.requires) edges.push({ from: levelKey(r.id, r.level), to: levelKey(n.id, 1), kind: 'needs', at: r.level });
  }
  // layers: an item's first level sits after everything it needs; each next level one step further
  const layerOf = new Map<string, number>();
  const layer = (key: string): number => {
    const got = layerOf.get(key);
    if (got !== undefined) return got;
    const [id, lv] = key.split('@');
    const level = Number(lv);
    const l = level > 1 ? layer(levelKey(id, level - 1)) + 1 : Math.max(-1, ...(nodeOf(id)?.requires ?? []).map((r) => layer(levelKey(r.id, r.level)))) + 1;
    layerOf.set(key, l);
    return l;
  };
  for (const n of nodes.values()) n.layer = layer(n.key);

  // lanes: start by step and kind, then pull each lane toward the lanes it connects to to untangle the arrows
  const lanes = TREE.map((n) => n.id).sort((a, b) => nodeOf(a)!.tier - nodeOf(b)!.tier || nodeOf(a)!.kind.localeCompare(nodeOf(b)!.kind) || nodeOf(a)!.name.localeCompare(nodeOf(b)!.name));
  const links = new Map<string, Set<string>>(lanes.map((id) => [id, new Set<string>()]));
  for (const n of TREE) for (const r of n.requires) { links.get(n.id)!.add(r.id); links.get(r.id)!.add(n.id); }
  for (let pass = 0; pass < 8; pass++) {
    const pos = new Map(lanes.map((id, i) => [id, i]));
    const score = new Map(lanes.map((id) => {
      const ns = [...links.get(id)!];
      return [id, ns.length ? ns.reduce((s, o) => s + pos.get(o)!, 0) / ns.length : pos.get(id)!] as const;
    }));
    lanes.sort((a, b) => (score.get(a)! - score.get(b)!) || (pos.get(a)! - pos.get(b)!));
  }
  const laneOf = new Map(lanes.map((id, i) => [id, i]));
  for (const n of nodes.values()) n.lane = laneOf.get(n.id)!;

  const preds = new Map<string, string[]>(), succs = new Map<string, string[]>();
  for (const k of nodes.keys()) { preds.set(k, []); succs.set(k, []); }
  for (const e of edges) { preds.get(e.to)!.push(e.from); succs.get(e.from)!.push(e.to); }
  cached = { nodes: [...nodes.values()], edges, lanes, layers: Math.max(...[...nodes.values()].map((n) => n.layer)) + 1, preds, succs };
  return cached;
}

/** every node reachable by following edges one way: what must come first (`back`) or what it leads to */
export function reach(g: LevelGraph, key: string, back: boolean): Set<string> {
  const out = new Set<string>();
  const next = back ? g.preds : g.succs;
  const stack = [key];
  while (stack.length) for (const n of next.get(stack.pop()!) ?? []) if (!out.has(n)) { out.add(n); stack.push(n); }
  return out;
}
