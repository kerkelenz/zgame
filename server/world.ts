import { randomBytes } from 'node:crypto';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import type {
  BuildingId, Coords, Defenses, Fleet, Mission, Res, TechId, UnitId,
} from '../shared/types';
import type { Levels } from '../shared/formulas';

export const uid = (n = 6) => randomBytes(n).toString('hex');

export interface BuildJob { id: BuildingId; level: number; start: number; end: number; cost: Res }
export interface ResearchJob { id: TechId; level: number; start: number; end: number; cost: Res; planetId: string }
export interface ShipyardJob { id: UnitId; total: number; remaining: number; unitMs: number; start: number; unitCost: Res }

export interface Player {
  id: string;
  username: string;
  salt: string;
  hash: string;
  createdAt: number;
  lastSeen: number;
  techs: Levels<TechId>;
  research: ResearchJob | null;
  allianceId: string | null;
  planetIds: string[];
  /** expedition statistics etc. */
  stats: { raidsRepelled: number; battlesWon: number; battlesLost: number; expeditions: number };
}

export interface Planet {
  id: string;
  ownerId: string;
  name: string;
  coords: Coords;
  fields: number;
  maxTemp: number;
  isHome: boolean;
  buildings: Levels<BuildingId>;
  resources: Res;
  updatedAt: number;
  buildQueue: BuildJob | null;
  shipyardQueue: ShipyardJob[];
  fleet: Fleet;
  defenses: Defenses;
  /** production sliders 0..1 */
  settings: Record<string, number>;
}

export type FleetPhase = 'outbound' | 'holding' | 'returning';

export interface Movement {
  id: string;
  /** null = NPC raiders */
  ownerId: string | null;
  ownerName: string;
  mission: Mission;
  phase: FleetPhase;
  from: Coords;
  fromPlanetId: string | null;
  to: Coords;
  ships: Fleet;
  cargo: Res;
  speedPct: number;
  /** ms */
  departAt: number;
  arriveAt: number;
  /** when phase == 'holding' */
  holdUntil?: number;
  /** when phase == 'returning' */
  returnAt?: number;
  flightMs: number;
  holdHours?: number;
  /** for expeditions, a flag set when the outcome has been resolved */
  resolved?: boolean;
  /** joint attack: id of the leading movement this fleet joined */
  acsId?: string;
}

export interface Alliance {
  id: string;
  tag: string;
  name: string;
  description: string;
  open: boolean;
  founderId: string;
  members: { playerId: string; role: 'founder' | 'officer' | 'member'; joinedAt: number }[];
  applications: { playerId: string; text: string; at: number }[];
  bank: Res;
  upgrades: Record<string, number>;
  log: { at: number; text: string }[];
  createdAt: number;
}

export type MessageKind = 'system' | 'espionage' | 'combat' | 'expedition' | 'transport' | 'player' | 'alliance' | 'raid';
export interface Message {
  id: string;
  to: string;
  from: string | null;
  kind: MessageKind;
  subject: string;
  body: string;
  data?: unknown;
  at: number;
  read: boolean;
}

export interface ChatMsg { id: string; channel: 'global' | 'alliance'; allianceId?: string; from: string; text: string; at: number }

export interface Debris { metal: number; crystal: number }

export interface World {
  version: 1;
  config: UniverseConfig;
  createdAt: number;
  players: Record<string, Player>;
  planets: Record<string, Planet>;
  movements: Record<string, Movement>;
  debris: Record<string, Debris>;
  alliances: Record<string, Alliance>;
  messages: Message[];
  chat: ChatMsg[];
  sessions: Record<string, string>;
  nextRaidAt: number;
  rngSeed: number;
}

export function createWorld(config: Partial<UniverseConfig> = {}, now = Date.now()): World {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return {
    version: 1,
    config: cfg,
    createdAt: now,
    players: {},
    planets: {},
    movements: {},
    debris: {},
    alliances: {},
    messages: [],
    chat: [],
    sessions: {},
    nextRaidAt: cfg.raidIntervalMin > 0 ? now + cfg.raidIntervalMin * 60_000 : 0,
    rngSeed: Math.floor(Math.random() * 2 ** 31),
  };
}

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const ck = (c: Coords) => `${c.g}:${c.s}:${c.p}`;

export function planetAt(w: World, c: Coords): Planet | undefined {
  for (const p of Object.values(w.planets)) if (p.coords.g === c.g && p.coords.s === c.s && p.coords.p === c.p) return p;
  return undefined;
}

export function getPlayer(w: World, id: string): Player {
  const p = w.players[id];
  if (!p) throw new GameError('Unknown player', 404);
  return p;
}
export function getPlanet(w: World, id: string): Planet {
  const p = w.planets[id];
  if (!p) throw new GameError('Unknown planet', 404);
  return p;
}
export function ownedPlanet(w: World, playerId: string, planetId: string): Planet {
  const p = getPlanet(w, planetId);
  if (p.ownerId !== playerId) throw new GameError('Not your planet', 403);
  return p;
}

export function allianceOf(w: World, p: Player): Alliance | null {
  return p.allianceId ? w.alliances[p.allianceId] ?? null : null;
}
export function sameAlliance(w: World, aId: string | null, bId: string | null): boolean {
  if (!aId || !bId || aId === bId) return false;
  const a = w.players[aId], b = w.players[bId];
  return !!a?.allianceId && a.allianceId === b?.allianceId;
}
