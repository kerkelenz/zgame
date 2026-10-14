import { randomBytes } from 'node:crypto';
import { DEFAULT_CONFIG, type UniverseConfig } from '../shared/config';
import type {
  BuildingId, CharClass, Coords, Defenses, FactionId, Fleet, Mission, OfficerId, Res, TechId, UnitId,
} from '../shared/types';
import type { Levels } from '../shared/formulas';
import { defaultNotify, type NotifySettings } from './external';

export const uid = (n = 6) => randomBytes(n).toString('hex');

/** `down` marks a demolition: `level` is the level the building drops to, nothing is paid up front and `refund` comes back when it finishes */
export interface BuildJob { id: BuildingId; level: number; start: number; end: number; cost: Res; down?: boolean; refund?: Res }
export interface ResearchJob { id: TechId; level: number; start: number; end: number; cost: Res; planetId: string }
export interface ShipyardJob { id: UnitId; total: number; remaining: number; unitMs: number; start: number; unitCost: Res }

export interface Player {
  id: string;
  /** when the research queue ran dry; see Planet.idleSince */
  researchIdleSince?: number;
  researchIdleAlerted?: boolean;
  username: string;
  salt: string;
  hash: string;
  createdAt: number;
  lastSeen: number;
  techs: Levels<TechId>;
  research: ResearchJob | null;
  /** research waiting behind the active job; paid for when it starts */
  /** `paid` is reserved when queued and refunded if the entry is removed or cannot start */
  researchBacklog: { id: TechId; planetId: string; paid?: Res }[];
  allianceId: string | null;
  /** account moderation and recovery (optional so old saves load unchanged) */
  banned?: { until: number | null; reason: string };
  muted?: { until: number | null; reason: string };
  recovery?: { salt: string; hash: string };
  renamedAt?: number;
  /** message preferences (optional so old saves load unchanged) */
  prefs?: PlayerPrefs;
  /** devices that receive push notifications */
  pushSubs?: import('./push').PushSub[];
  /** today's and this week's contracts, and the claim streak */
  contracts?: import('./contracts').ContractBook;
  /** saved build orders, automation rules and what the rules did recently */
  buildOrders?: BuildOrder[];
  autoRules?: AutoRules;
  autoLog?: { at: number; text: string }[];
  /** incoming fleets the defense rule has already reacted to */
  autoSeen?: Record<string, number>;
  /** saved fleet compositions, shared across devices */
  presets?: { id: string; name: string; ships: Fleet }[];
  /** how much of today's merchant deal allowance has been used */
  dealUsed?: { day: number; amount: number };
  /** social tools (all optional so old saves load unchanged) */
  blocked?: string[];
  buddies?: string[];
  /** private notes keyed by `p:<playerId>` or `c:<g>:<s>:<p>` */
  notes?: Record<string, string>;
  bookmarks?: { id: string; name: string; coords: Coords }[];
  recent?: Coords[];
  /** latest spy report per planet */
  spyArchive?: Record<string, { at: number; report: unknown }>;
  planetIds: string[];
  /** expedition statistics etc. */
  stats: PlayerStats;
  /** Command Credits: earned from expeditions, objectives and achievements; spent on officers */
  credits: number;
  officers: Partial<Record<OfficerId, number>>;
  achievements: Record<string, number>;
  objectives: Record<string, number>;
  faction: FactionId | null;
  /** standing with each faction (-100..100) */
  rep: Record<string, number>;
  /** grudge each NPC empire holds against this commander */
  heat: Record<string, number>;
  /** npc id -> timestamp until which that empire leaves this commander alone */
  truces: Record<string, number>;
  tributes: Tribute[];
  nextTribute: number;
  history: HistoryPoint[];
  /** chosen character class (first pick is free) */
  charClass: CharClass | null;
  /** alerts outside the game (Discord / ntfy) */
  notify: NotifySettings;
  /** set while on vacation: production is frozen and nobody can attack you */
  vacation: { since: number; minUntil: number } | null;
  /** set for computer-controlled empires (no login) */
  npc?: NpcInfo;
  /** the encounters that turn up while this commander plays */
  events?: import('./encounters').EventState;
  /** empire upgrades, boosts and monuments bought (see shared/upgrades.ts) */
  upgrades?: import('../shared/upgrades').PlayerUpgrades;
  /** the bargains taken on the market today (value over what was paid), against the daily limit */
  bargains?: { day: number; value: number };
}

export interface PlayerStats {
  raidsRepelled: number; battlesWon: number; battlesLost: number; expeditions: number;
  destroyed: number; plundered: number; harvested: number; ipmKills: number; moonsDestroyed: number;
  /** counters that contracts are measured against */
  buildingsDone: number; researchDone: number; shipsBuilt: number; spyReports: number; delivered: number;
  /** Void invasions fought in (and won, with a real share of the damage), and total damage dealt to the Armada */
  invasionsWon: number; voidDamage: number;
  /** Void invasion work outside the front: value of aliens destroyed at home, value of supplies delivered, waves scouted */
  voidHome: number; voidSupplied: number; voidScouts: number;
  /** pirate and alien outposts broken */
  outpostsCleared: number;
  /** encounters answered */
  encountersDone: number;
  /** trades with the travelling merchant, and market offers made or taken */
  trades: number; marketDeals: number;
}
export interface Tribute { id: string; npc: string; want: Res; deadline: number; answered: false | 'paid' | 'refused' | 'ignored' }
export interface HistoryPoint { t: number; points: number; rank: number; fleet: number }
export type NpcStatus = 'inactive' | 'active' | 'aggressive';
export interface NpcInfo { status: NpcStatus; seedPoints: number; faction: FactionId | null; /** set on the owner of a pirate or alien outpost */ outpost?: { kind: 'pirate' | 'alien'; tier: number } }

export const blankStats = (): PlayerStats => ({ raidsRepelled: 0, battlesWon: 0, battlesLost: 0, expeditions: 0, destroyed: 0, plundered: 0, harvested: 0, ipmKills: 0, moonsDestroyed: 0, buildingsDone: 0, researchDone: 0, shipsBuilt: 0, spyReports: 0, delivered: 0, invasionsWon: 0, voidDamage: 0, voidHome: 0, voidSupplied: 0, voidScouts: 0, outpostsCleared: 0, encountersDone: 0, trades: 0, marketDeals: 0 });

export function blankPlayer(id: string, username: string, now: number, extra: Partial<Player> = {}): Player {
  return {
    id, username, salt: '', hash: '', createdAt: now, lastSeen: now, techs: {}, research: null, researchBacklog: [],
    allianceId: null, planetIds: [], stats: blankStats(), credits: 0, officers: {}, achievements: {}, objectives: {},
    faction: null, rep: {}, heat: {}, truces: {}, tributes: [], nextTribute: 0, history: [], vacation: null, notify: defaultNotify(), charClass: null, ...extra,
  };
}

/** Fill fields added after a save was written. */
export function migratePlayer(p: Player) {
  const d = blankPlayer(p.id, p.username, p.createdAt);
  p.stats = { ...d.stats, ...(p.stats ?? {}) };
  p.credits ??= 0; p.officers ??= {}; p.achievements ??= {}; p.objectives ??= {}; p.faction ??= null;
  p.rep ??= {}; p.heat ??= {}; p.truces ??= {}; p.tributes ??= []; p.nextTribute ??= 0; p.history ??= [];
  p.vacation ??= null;
  p.charClass ??= null;
  p.notify = { ...defaultNotify(), ...(p.notify ?? {}), events: { ...defaultNotify().events, ...(p.notify?.events ?? {}) } };
  p.researchBacklog ??= [];
}
export const isNpc = (p: Player | null | undefined): p is Player & { npc: NpcInfo } => !!p?.npc;

export interface BuildStep { kind: 'building' | 'tech'; id: string; level: number }
export interface BuildOrder { id: string; name: string; steps: BuildStep[] }
export interface AutoRules { energy: boolean; storage: boolean; defense: { on: boolean; unit: string; count: number; maxSharePct: number } }

/** A Void Armada event: one shared boss fleet every commander fights together. */
export interface InvasionWave {
  index: number;
  kind: import('../shared/aliens').AlienKindId;
  name: string;
  share: number;
  fleet: Fleet;
  value: number;
  status: 'pending' | 'active' | 'cleared';
  /** when it arrives if the one before has not been cleared sooner */
  scheduledAt: number;
  appearedAt?: number;
  clearedAt?: number;
}
export interface Contribution {
  damage: number; lost: number; battles: number;
  /** value of aliens destroyed at home (own planets and ones defended for allies) */
  home?: number;
  /** value of supplies delivered to the front, and convoys that arrived */
  supplied?: number; convoys?: number;
  /** waves scouted (the first look at a wave, and the first exact look) */
  scouts?: number;
}
export interface Invasion {
  number: number;
  /** the waves, the one on the field and when the next comes */
  waves?: InvasionWave[];
  waveIndex?: number;
  nextWaveAt?: number;
  /** what the whole invasion is worth, all waves together */
  totalValue?: number;
  /** what scouts have learned of each wave, by wave index; `fleet` only when it was an exact look */
  scouted?: Record<number, { by: string; at: number; exact: boolean; fleet?: Fleet }>;
  /** supplies waiting at the front, spent on repairs before each engagement, and the ships each commander lost last time */
  supply?: Res;
  lastLoss?: Record<string, Fleet>;
  repaired?: number;
  /** alien strike teams sent at planets */
  strikes?: number;
  /** the last engagement, for the replay */
  last?: { at: number; wave: number; rounds: number; winner: string; roundLog: unknown[]; roundStats: unknown[] };
  phase: 'announced' | 'active';
  announcedAt: number; startsAt: number; endsAt: number;
  rift: Coords;
  /** weapons, shielding and armour of the Armada */
  level: number;
  startFleet: Fleet; fleet: Fleet; startValue: number;
  nextEngageAt: number; round: number;
  contrib: Record<string, Contribution>;
}
export interface InvasionRecord { number: number; result: 'won' | 'lost'; startedAt: number; endedAt: number; startValue: number; rounds: number; top: { name: string; damage: number }[]; topAlliance: { tag: string; damage: number } | null; waves?: number; wavesCleared?: number; strikes?: number; supplied?: number }

export interface Planet {
  id: string;
  /** the people settled on this planet and the levels of their structures (see shared/lifeforms.ts) */
  lifeform?: import('../shared/lifeforms').PlanetLifeform;
  /** planet projects bought here, by level (see shared/upgrades.ts) */
  projects?: Partial<Record<import('../shared/upgrades').ProjectId, number>>;
  /** which picture and banner it shows (a name from shared/artlist), stored when first needed so it never changes */
  look?: string;
  /** what the owner uses this planet for; only changes the suggestions the game makes */
  role?: import('../shared/roles').PlanetRole;
  /** when the building queue ran dry (nothing running, nothing waiting); cleared when something starts */
  idleSince?: number;
  idleAlerted?: boolean;
  ownerId: string;
  name: string;
  coords: Coords;
  fields: number;
  maxTemp: number;
  isHome: boolean;
  /** planet diameter in km (fields derive from it) */
  diameter?: number;
  /** moons share their parent's coordinates */
  isMoon?: boolean;
  parentId?: string;
  /** jump gate cooldown (ms timestamp) */
  jumpReadyAt?: number;
  buildings: Levels<BuildingId>;
  resources: Res;
  updatedAt: number;
  buildQueue: BuildJob | null;
  /** buildings waiting behind the active job; paid for when they start */
  buildBacklog: BuildingId[];
  /** a build order running here: every step is "raise this to level N", started whenever it is affordable */
  plan?: { name: string; steps: BuildStep[]; status: string; startedAt: number; added: number; /** after a blocked attempt, do not try again before this time */ retryAt?: number };
  /** after a rule could not act (no fields, cannot pay), do not evaluate the rules again before this time */
  rulesRetryAt?: number;
  /** resources already reserved for each buildBacklog entry (same index) */
  buildPaid?: Res[];
  shipyardQueue: ShipyardJob[];
  fleet: Fleet;
  defenses: Defenses;
  /** production sliders 0..1 */
  settings: Record<string, number>;
}

export type FleetPhase = 'outbound' | 'holding' | 'returning';

export interface Movement {
  id: string;
  /** an alien strike team of a Void invasion, with its technology levels and the wave it came with */
  alien?: { wave: number; weapons: number; shielding: number; armour: number };
  /** the target asked their alliance for help with this fleet (once) */
  helpAsked?: boolean;
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
  /** target is the moon at the destination coordinates */
  toMoon?: boolean;
  /** interplanetary missile strikes */
  missiles?: number;
}

export type AlliancePerm = 'applications' | 'kick' | 'bank' | 'upgrades' | 'edit' | 'message' | 'bulletin' | 'diplomacy';
export const ALLIANCE_PERMS: AlliancePerm[] = ['applications', 'kick', 'bank', 'upgrades', 'edit', 'message', 'bulletin', 'diplomacy'];

export interface Alliance {
  id: string;
  tag: string;
  name: string;
  description: string;
  open: boolean;
  founderId: string;
  members: { playerId: string; role: 'founder' | 'officer' | 'member'; joinedAt: number; rankId?: string }[];
  /** custom ranks with individual permissions (founders hold every permission; plain officers get the defaults) */
  ranks?: { id: string; name: string; perms: AlliancePerm[] }[];
  bulletin?: { id: string; authorId: string; author: string; text: string; at: number; pinned: boolean }[];
  /** how many systems it holds: a cache refreshed with every territory pass, so production maths can read it in O(1) */
  territory?: number;
  /** treaties with other alliances, keyed by their id */
  diplomacy?: Record<string, { kind: 'pact' | 'war'; since: number; warId?: string }>;
  /** pact offers other alliances made to us */
  proposals?: { fromId: string; at: number }[];
  applications: { playerId: string; text: string; at: number }[];
  bank: Res;
  upgrades: Record<string, number>;
  log: { at: number; text: string; /** what sort of line it is, for filtering the activity feed */ kind?: 'attack' | 'defense' | 'offense' | 'raid' | 'build' | 'help'; /** the member it is about */ by?: string }[];
  createdAt: number;
}

export interface ForgeJob { planetId: string; ownerId: string; start: number; end: number; /** the debris field it consumed */ debris: { metal: number; crystal: number }; cost: Res; /** size of the moon it will make, km */ diameter: number }

export interface WarSide { kills: number; held: number; /** points by commander */ by: Record<string, number> }
export interface War {
  id: string;
  aId: string;
  bId: string;
  tags: Record<string, string>;
  startedAt: number;
  endsAt: number;
  /** held-system points have been counted up to here */
  heldAt: number;
  score: Record<string, WarSide>;
  endedAt?: number;
  how?: 'time' | 'conceded' | 'dissolved';
  /** null = draw */
  winnerId?: string | null;
  reward?: { loot: number; credits: number };
}

export type MessageKind = 'system' | 'espionage' | 'combat' | 'expedition' | 'transport' | 'player' | 'alliance' | 'raid' | 'news';
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

export interface PlayerReport { id: string; by: string; byName: string; target: string; targetName: string; reason: string; at: number; resolved: boolean }

export interface ChatMsg { id: string; channel: 'global' | 'alliance'; allianceId?: string; from: string; text: string; at: number }

export interface Debris { metal: number; crystal: number }

/** Wreckage over a planet after a big battle: the owner's Space Dock can rebuild a share of the ships. */
export interface Wreck {
  planetId: string; ownerId: string; ships: Fleet; value: number; createdAt: number; expiresAt: number;
  repair?: { endsAt: number; ships: Fleet };
}

export interface World {
  version: 1;
  config: UniverseConfig;
  createdAt: number;
  players: Record<string, Player>;
  planets: Record<string, Planet>;
  movements: Record<string, Movement>;
  debris: Record<string, Debris>;
  /** wreck fields by planet id */
  wrecks: Record<string, Wreck>;
  alliances: Record<string, Alliance>;
  messages: Message[];
  chat: ChatMsg[];
  reports?: PlayerReport[];
  /** the server's push identity (generated once) */
  vapid?: import('./push').Vapid;
  invasion?: Invasion;
  invasionCount?: number;
  nextInvasionAt?: number;
  invasionHistory?: InvasionRecord[];
  /** the standing as it was at the last daily snapshot, to show who gained or lost since */
  standingDay?: import('./standing').StandingDay;
  /** Moon Forges running, by the planet they work above */
  forges?: Record<string, ForgeJob>;
  /** scored alliance wars: the running one and recent history, newest first */
  wars?: War[];
  /** looks were pinned on the worlds that existed when they were introduced */
  looksAssigned?: boolean;
  /** commanders' worlds that shared a look were given distinct ones, once */
  looksDeduped?: boolean;
  /** what admins did, newest first; announcements waiting to go out; accounts created and commanders seen per day */
  auditLog?: import('./adminlog').AuditEntry[];
  scheduledAnnouncements?: import('./adminlog').ScheduledAnnouncement[];
  dailyStats?: import('./adminlog').DayStat[];
  /** pirate and alien outposts (undefined until they were first settled) */
  outposts?: import('./outposts').Outpost[];
  /** player market offers (the goods are held back from the seller's planet while an offer stands) */
  market?: import('./market').MarketOffer[];
  /** alliance operations: shared targets members sign up for */
  operations?: import('./operations').Operation[];
  /** which alliance holds which system ("g:s") */
  sectors?: Record<string, { allianceId: string; since: number }>;
  season?: import('./season').SeasonState;
  hallOfFame?: import('./season').HallEntry[];
  /** battle reports published with a public link */
  shared?: Record<string, { id: string; at: number; subject: string; report: unknown }>;
  sessions: Record<string, string>;
  /** when each token was last used, so idle sessions can expire */
  sessionAt?: Record<string, number>;
  nextRaidAt: number;
  /** next computer-empire economy / war tick */
  nextNpcTick?: number;
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
    wrecks: {},
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

export function planetAt(w: World, c: Coords, moon = false): Planet | undefined {
  for (const p of Object.values(w.planets)) if (!!p.isMoon === moon && p.coords.g === c.g && p.coords.s === c.s && p.coords.p === c.p) return p;
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
/** Allies by membership or by a pact between their alliances: neither may attack the other. */
export function friendly(w: World, aId: string | null, bId: string | null): boolean {
  if (sameAlliance(w, aId, bId)) return true;
  const a = aId ? w.players[aId]?.allianceId : null, b = bId ? w.players[bId]?.allianceId : null;
  return !!a && !!b && w.alliances[a]?.diplomacy?.[b]?.kind === 'pact';
}
export function atWar(w: World, aId: string | null, bId: string | null): boolean {
  const a = aId ? w.players[aId]?.allianceId : null, b = bId ? w.players[bId]?.allianceId : null;
  return !!a && !!b && w.alliances[a]?.diplomacy?.[b]?.kind === 'war';
}

export function sameAlliance(w: World, aId: string | null, bId: string | null): boolean {
  if (!aId || !bId || aId === bId) return false;
  const a = w.players[aId], b = w.players[bId];
  return !!a?.allianceId && a.allianceId === b?.allianceId;
}

export interface PlayerPrefs {
  /** no in-game message when a building, research or production run finishes (alerts outside the game are separate) */
  quietCompletions?: boolean;
  /** also hear about raids between computer empires and commanders you have nothing to do with; off by default, so you only hear about members of your own alliance */
  worldNews?: boolean;
}
