import type {
  BuildingDef, BuildingId, CharClass, DefenseId, FactionId, OfficerId, ShipId, TechDef, TechId, UnitDef, UnitId, Res,
} from './types';

const r = (metal = 0, crystal = 0, deuterium = 0): Res => ({ metal, crystal, deuterium });

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  metalMine: { id: 'metalMine', name: 'Metal Mine', desc: 'Extracts metal ore. Consumes energy.', base: r(60, 15), factor: 1.5, requires: [] },
  crystalMine: { id: 'crystalMine', name: 'Crystal Mine', desc: 'Extracts crystal. Consumes energy.', base: r(48, 24), factor: 1.6, requires: [] },
  deuteriumSynthesizer: { id: 'deuteriumSynthesizer', name: 'Vespene Extractor', desc: 'Filters vespene gas from water. Colder planets yield more.', base: r(225, 75), factor: 1.5, requires: [] },
  solarPlant: { id: 'solarPlant', name: 'Solar Plant', desc: 'Generates energy from sunlight.', base: r(75, 30), factor: 1.5, requires: [] },
  fusionReactor: { id: 'fusionReactor', name: 'Fusion Reactor', desc: 'Burns vespene gas for large amounts of energy.', base: r(900, 360, 180), factor: 1.8, requires: [{ id: 'deuteriumSynthesizer', level: 5 }, { id: 'energy', level: 3 }] },
  roboticsFactory: { id: 'roboticsFactory', name: 'Robotics Factory', desc: 'Speeds up building construction.', base: r(400, 120, 200), factor: 2, requires: [] },
  naniteFactory: { id: 'naniteFactory', name: 'Nanite Factory', desc: 'Halves construction and shipbuilding time per level.', base: r(1_000_000, 500_000, 100_000), factor: 2, requires: [{ id: 'roboticsFactory', level: 10 }, { id: 'computer', level: 10 }] },
  shipyard: { id: 'shipyard', name: 'Shipyard', desc: 'Builds ships and defenses.', base: r(400, 200, 100), factor: 2, requires: [{ id: 'roboticsFactory', level: 2 }] },
  researchLab: { id: 'researchLab', name: 'Research Lab', desc: 'Required for research; speeds it up.', base: r(200, 400, 200), factor: 2, requires: [] },
  metalStorage: { id: 'metalStorage', name: 'Metal Storage', desc: 'Raises metal capacity.', base: r(1000), factor: 2, requires: [] },
  crystalStorage: { id: 'crystalStorage', name: 'Crystal Storage', desc: 'Raises crystal capacity.', base: r(1000, 500), factor: 2, requires: [] },
  missileSilo: { id: 'missileSilo', name: 'Missile Silo', desc: 'Stores 10 missile slots per level and sets missile range (5 systems per level).', base: r(20000, 20000, 1000), factor: 2, requires: [{ id: 'shipyard', level: 1 }] },
  terraformer: { id: 'terraformer', name: 'Terraformer', desc: 'Reshapes the surface to create 8 extra building fields per level.', base: r(0, 50000, 100000), factor: 1.7, requires: [{ id: 'naniteFactory', level: 1 }, { id: 'energy', level: 10 }] },
  spaceDock: { id: 'spaceDock', name: 'Space Dock', desc: 'Rebuilds a share of the ships you lose defending this planet from the wreck field the battle leaves behind.', base: r(200000, 0, 50000), factor: 5, requires: [{ id: 'shipyard', level: 2 }] },
  lunarBase: { id: 'lunarBase', name: 'Lunar Base', desc: 'Moons have almost no room: each level adds 3 usable fields.', base: r(20000, 40000, 20000), factor: 2, requires: [], moonOnly: true },
  sensorPhalanx: { id: 'sensorPhalanx', name: 'Sensor Phalanx', desc: 'Scans fleet movements around a planet within (level² - 1) systems. Each scan costs 5,000 vespene gas.', base: r(20000, 40000, 20000), factor: 2, requires: [{ id: 'lunarBase', level: 1 }], moonOnly: true },
  jumpGate: { id: 'jumpGate', name: 'Jump Gate', desc: 'Instantly teleports ships to another of your moons with a gate. Cooldown after each jump.', base: r(200000, 400000, 200000), factor: 2, requires: [{ id: 'lunarBase', level: 1 }, { id: 'hyperspace', level: 7 }], moonOnly: true },
  deuteriumTank: { id: 'deuteriumTank', name: 'Vespene Tank', desc: 'Raises vespene gas capacity.', base: r(1000, 1000), factor: 2, requires: [] },
};

export const TECHS: Record<TechId, TechDef> = {
  energy: { id: 'energy', name: 'Energy Technology', desc: 'Boosts fusion output; unlocks advanced tech.', base: r(0, 800, 400), factor: 2, requires: [{ id: 'researchLab', level: 1 }] },
  laser: { id: 'laser', name: 'Laser Technology', desc: 'Focused light for weapons.', base: r(200, 100), factor: 2, requires: [{ id: 'researchLab', level: 1 }, { id: 'energy', level: 2 }] },
  ion: { id: 'ion', name: 'Ion Technology', desc: 'Ion beams for heavy weapons.', base: r(1000, 300, 100), factor: 2, requires: [{ id: 'researchLab', level: 4 }, { id: 'energy', level: 4 }, { id: 'laser', level: 5 }] },
  hyperspace: { id: 'hyperspace', name: 'Hyperspace Technology', desc: 'Bends space; unlocks hyperspace drive.', base: r(0, 4000, 2000), factor: 2, requires: [{ id: 'researchLab', level: 7 }, { id: 'energy', level: 5 }, { id: 'shielding', level: 5 }] },
  plasma: { id: 'plasma', name: 'Plasma Technology', desc: 'Boosts metal, crystal and vespene gas output by +1%/+0.66%/+0.33% per level.', base: r(2000, 4000, 1000), factor: 2, requires: [{ id: 'researchLab', level: 4 }, { id: 'energy', level: 8 }, { id: 'laser', level: 10 }, { id: 'ion', level: 5 }] },
  combustionDrive: { id: 'combustionDrive', name: 'Combustion Drive', desc: '+10% speed for combustion ships per level.', base: r(400, 0, 600), factor: 2, requires: [{ id: 'researchLab', level: 1 }, { id: 'energy', level: 1 }] },
  impulseDrive: { id: 'impulseDrive', name: 'Impulse Drive', desc: '+20% speed for impulse ships per level.', base: r(2000, 4000, 600), factor: 2, requires: [{ id: 'researchLab', level: 2 }, { id: 'energy', level: 1 }] },
  hyperspaceDrive: { id: 'hyperspaceDrive', name: 'Hyperspace Drive', desc: '+30% speed for hyperspace ships per level.', base: r(10000, 20000, 6000), factor: 2, requires: [{ id: 'researchLab', level: 7 }, { id: 'hyperspace', level: 3 }] },
  espionage: { id: 'espionage', name: 'Espionage Technology', desc: 'Better spy reports and counter-espionage.', base: r(200, 1000, 200), factor: 2, requires: [{ id: 'researchLab', level: 3 }] },
  computer: { id: 'computer', name: 'Computer Technology', desc: '+1 fleet slot per level.', base: r(0, 400, 600), factor: 2, requires: [{ id: 'researchLab', level: 1 }] },
  astrophysics: { id: 'astrophysics', name: 'Astrophysics', desc: 'Allows more colonies (+1 planet per 2 levels) and expeditions.', base: r(4000, 8000, 4000), factor: 1.75, requires: [{ id: 'researchLab', level: 3 }, { id: 'espionage', level: 4 }, { id: 'impulseDrive', level: 3 }] },
  weapons: { id: 'weapons', name: 'Weapons Technology', desc: '+10% attack per level.', base: r(800, 200), factor: 2, requires: [{ id: 'researchLab', level: 4 }] },
  shielding: { id: 'shielding', name: 'Shielding Technology', desc: '+10% shields per level.', base: r(200, 600), factor: 2, requires: [{ id: 'researchLab', level: 6 }, { id: 'energy', level: 3 }] },
  graviton: { id: 'graviton', name: 'Graviton Technology', desc: 'Costs no resources, but needs a planet producing 300,000 energy (x3 per level). Unlocks the Deathstar.', base: r(0, 0, 0), factor: 3, requires: [{ id: 'researchLab', level: 12 }], energyReq: 300_000 },
  armour: { id: 'armour', name: 'Armour Technology', desc: '+10% hull per level.', base: r(1000), factor: 2, requires: [{ id: 'researchLab', level: 2 }] },
};

type U = Omit<UnitDef, 'id' | 'kind' | 'name'>;
const ship = (id: ShipId, name: string, u: U): UnitDef => ({ id, name, kind: 'ship', ...u });
const def = (id: DefenseId, name: string, u: U): UnitDef => ({ id, name, kind: 'defense', ...u });
const none = {};
const PS = { espionageProbe: 5, solarSatellite: 5, crawler: 5 } as const;

export const UNITS: Record<UnitId, UnitDef> = {
  smallCargo: ship('smallCargo', 'Small Cargo', { desc: 'Nimble transport.', cost: r(2000, 2000), attack: 5, shield: 10, hull: 400, cargo: 5000, speed: 5000, fuel: 10, drive: 'combustionDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 2 }, { id: 'combustionDrive', level: 2 }] }),
  largeCargo: ship('largeCargo', 'Large Cargo', { desc: 'Heavy transport.', cost: r(6000, 6000), attack: 5, shield: 25, hull: 1200, cargo: 25000, speed: 7500, fuel: 50, drive: 'combustionDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 4 }, { id: 'combustionDrive', level: 6 }] }),
  lightFighter: ship('lightFighter', 'Light Fighter', { desc: 'Cheap and fast fighter.', cost: r(3000, 1000), attack: 50, shield: 10, hull: 400, cargo: 50, speed: 12500, fuel: 20, drive: 'combustionDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 1 }, { id: 'combustionDrive', level: 1 }] }),
  heavyFighter: ship('heavyFighter', 'Heavy Fighter', { desc: 'Armoured fighter.', cost: r(6000, 4000), attack: 150, shield: 25, hull: 1000, cargo: 100, speed: 10000, fuel: 75, drive: 'impulseDrive', rapidFire: { smallCargo: 3, ...PS }, requires: [{ id: 'shipyard', level: 3 }, { id: 'armour', level: 2 }, { id: 'impulseDrive', level: 2 }] }),
  cruiser: ship('cruiser', 'Cruiser', { desc: 'Excellent against light fighters and rocket launchers.', cost: r(20000, 7000, 2000), attack: 400, shield: 50, hull: 2700, cargo: 800, speed: 15000, fuel: 300, drive: 'impulseDrive', rapidFire: { lightFighter: 6, rocketLauncher: 10, ...PS }, requires: [{ id: 'shipyard', level: 5 }, { id: 'impulseDrive', level: 4 }, { id: 'ion', level: 2 }] }),
  battleship: ship('battleship', 'Battleship', { desc: 'Backbone of any fleet.', cost: r(45000, 15000), attack: 1000, shield: 200, hull: 6000, cargo: 1500, speed: 10000, fuel: 500, drive: 'hyperspaceDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 7 }, { id: 'hyperspaceDrive', level: 4 }] }),
  battlecruiser: ship('battlecruiser', 'Battlecruiser', { desc: 'Raider hunting transports and fighters.', cost: r(30000, 40000, 15000), attack: 700, shield: 400, hull: 7000, cargo: 750, speed: 10000, fuel: 250, drive: 'hyperspaceDrive', rapidFire: { smallCargo: 3, largeCargo: 3, heavyFighter: 4, cruiser: 4, battleship: 7, ...PS }, requires: [{ id: 'shipyard', level: 8 }, { id: 'hyperspace', level: 5 }, { id: 'laser', level: 12 }, { id: 'hyperspaceDrive', level: 5 }] }),
  bomber: ship('bomber', 'Bomber', { desc: 'Smashes planetary defenses.', cost: r(50000, 25000, 15000), attack: 1000, shield: 500, hull: 7500, cargo: 500, speed: 4000, fuel: 700, drive: 'impulseDrive', rapidFire: { rocketLauncher: 20, lightLaser: 20, heavyLaser: 10, ionCannon: 10, gaussCannon: 5, ...PS }, requires: [{ id: 'shipyard', level: 8 }, { id: 'impulseDrive', level: 6 }, { id: 'plasma', level: 5 }] }),
  destroyer: ship('destroyer', 'Destroyer', { desc: 'Heavy warship.', cost: r(60000, 50000, 15000), attack: 2000, shield: 500, hull: 11000, cargo: 2000, speed: 5000, fuel: 1000, drive: 'hyperspaceDrive', rapidFire: { lightLaser: 10, battlecruiser: 2, ...PS }, requires: [{ id: 'shipyard', level: 9 }, { id: 'hyperspace', level: 5 }, { id: 'hyperspaceDrive', level: 6 }] }),
  deathstar: ship('deathstar', 'Deathstar', { desc: 'The ultimate weapon.', cost: r(5_000_000, 4_000_000, 1_000_000), attack: 200000, shield: 50000, hull: 900000, cargo: 1_000_000, speed: 100, fuel: 1, drive: 'hyperspaceDrive', rapidFire: { smallCargo: 250, largeCargo: 250, lightFighter: 200, heavyFighter: 100, cruiser: 33, battleship: 30, battlecruiser: 15, bomber: 25, destroyer: 5, recycler: 250, colonyShip: 250, rocketLauncher: 200, lightLaser: 200, heavyLaser: 100, gaussCannon: 50, ionCannon: 100, espionageProbe: 1250, solarSatellite: 1250, crawler: 1250 }, requires: [{ id: 'shipyard', level: 12 }, { id: 'hyperspaceDrive', level: 7 }, { id: 'hyperspace', level: 6 }, { id: 'graviton', level: 1 }] }),
  recycler: ship('recycler', 'Recycler', { desc: 'Collects debris fields.', cost: r(10000, 6000, 2000), attack: 1, shield: 10, hull: 1600, cargo: 20000, speed: 2000, fuel: 300, drive: 'combustionDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 4 }, { id: 'combustionDrive', level: 6 }, { id: 'shielding', level: 2 }] }),
  reaper: ship('reaper', 'Reaper', { desc: 'A heavy warship that also salvages: it collects debris fields and takes part of the debris of every battle it fights in.', cost: r(85000, 55000, 20000), attack: 2800, shield: 700, hull: 11000, cargo: 10000, speed: 7000, fuel: 1100, drive: 'hyperspaceDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 10 }, { id: 'hyperspaceDrive', level: 6 }, { id: 'shielding', level: 6 }] }),
  espionageProbe: ship('espionageProbe', 'Espionage Probe', { desc: 'Spies on other planets.', cost: r(0, 1000), attack: 0, shield: 0, hull: 100, cargo: 5, speed: 100_000_000, fuel: 1, drive: 'combustionDrive', rapidFire: none, requires: [{ id: 'shipyard', level: 3 }, { id: 'combustionDrive', level: 3 }, { id: 'espionage', level: 2 }] }),
  colonyShip: ship('colonyShip', 'Colony Ship', { desc: 'Founds new colonies.', cost: r(10000, 20000, 10000), attack: 50, shield: 100, hull: 3000, cargo: 7500, speed: 2500, fuel: 1000, drive: 'impulseDrive', rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'impulseDrive', level: 3 }] }),
  pathfinder: ship('pathfinder', 'Pathfinder', { desc: 'Long-range explorer built for deep space. On expeditions it raises finds (+10% each, up to 5) and can steer the fleet clear of black holes.', cost: r(8000, 5000, 2000), attack: 200, shield: 100, hull: 1300, cargo: 10000, speed: 12000, fuel: 200, drive: 'impulseDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 5 }, { id: 'impulseDrive', level: 4 }, { id: 'astrophysics', level: 2 }] }),
  crawler: ship('crawler', 'Crawler', { desc: 'Mining machine that boosts metal, crystal and vespene gas output on its planet. Stays home; fragile.', cost: r(2000, 2000, 1000), attack: 1, shield: 1, hull: 500, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 5 }, { id: 'combustionDrive', level: 4 }] }),
  solarSatellite: ship('solarSatellite', 'Solar Satellite', { desc: 'Orbits the planet and generates energy.', cost: r(0, 2000, 500), attack: 1, shield: 1, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 1 }, { id: 'energy', level: 2 }] }),

  rocketLauncher: def('rocketLauncher', 'Rocket Launcher', { desc: 'Cheap basic defense.', cost: r(2000), attack: 80, shield: 20, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 1 }] }),
  lightLaser: def('lightLaser', 'Light Laser', { desc: 'Solid early defense.', cost: r(1500, 500), attack: 100, shield: 25, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 2 }, { id: 'energy', level: 2 }, { id: 'laser', level: 3 }] }),
  heavyLaser: def('heavyLaser', 'Heavy Laser', { desc: 'Strong all-round defense.', cost: r(6000, 2000), attack: 250, shield: 100, hull: 800, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'energy', level: 3 }, { id: 'laser', level: 6 }] }),
  gaussCannon: def('gaussCannon', 'Gauss Cannon', { desc: 'Powerful kinetic cannon.', cost: r(20000, 15000, 2000), attack: 1100, shield: 200, hull: 3500, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 6 }, { id: 'energy', level: 6 }, { id: 'weapons', level: 3 }, { id: 'shielding', level: 1 }] }),
  ionCannon: def('ionCannon', 'Ion Cannon', { desc: 'Strips enemy shields.', cost: r(5000, 3000), attack: 150, shield: 500, hull: 800, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'ion', level: 4 }] }),
  plasmaTurret: def('plasmaTurret', 'Plasma Turret', { desc: 'Devastating plasma defense.', cost: r(50000, 50000, 30000), attack: 3000, shield: 300, hull: 10000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 8 }, { id: 'plasma', level: 7 }] }),
  antiBallisticMissile: def('antiBallisticMissile', 'Anti-Ballistic Missile', { desc: 'Intercepts one incoming interplanetary missile. Uses 1 silo slot.', cost: r(8000, 0, 2000), attack: 1, shield: 1, hull: 1, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, missile: true, requires: [{ id: 'shipyard', level: 1 }, { id: 'missileSilo', level: 2 }] }),
  interplanetaryMissile: def('interplanetaryMissile', 'Interplanetary Missile', { desc: 'Destroys defenses on another planet in range. Uses 2 silo slots.', cost: r(12500, 2500, 10000), attack: 12000, shield: 1, hull: 1, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, missile: true, requires: [{ id: 'shipyard', level: 1 }, { id: 'missileSilo', level: 4 }, { id: 'impulseDrive', level: 1 }] }),
  smallShield: def('smallShield', 'Small Shield Dome', { desc: 'Envelops the planet in a shield. Max 1.', cost: r(10000, 10000), attack: 1, shield: 2000, hull: 2000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, max: 1, requires: [{ id: 'shipyard', level: 1 }, { id: 'shielding', level: 2 }] }),
  largeShield: def('largeShield', 'Large Shield Dome', { desc: 'A far stronger shield dome. Max 1.', cost: r(50000, 50000), attack: 1, shield: 10000, hull: 10000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, max: 1, requires: [{ id: 'shipyard', level: 6 }, { id: 'shielding', level: 6 }] }),
};

/** buildings a moon may host (plus every moonOnly building); planets may not host moonOnly ones */
export const MOON_BUILDINGS: BuildingId[] = ['lunarBase', 'sensorPhalanx', 'jumpGate', 'roboticsFactory', 'shipyard', 'missileSilo'];   // no mines on a moon, so no storage either
export const buildingAllowed = (id: BuildingId, moon: boolean) => (moon ? MOON_BUILDINGS.includes(id) : !BUILDINGS[id].moonOnly);

/** share of a wreck field a Space Dock of this level can rebuild */
/** 3.5% of a wreck field per Space Dock level, at most 35% (reached at level 10) */
export const wreckRepairShare = (level: number) => Math.min(0.35, 0.035 * Math.max(0, level));

/** building fields a Terraformer level adds to a planet */
export const TERRAFORMER_FIELDS = 8;
export const SHIP_IDS = (Object.keys(UNITS) as UnitId[]).filter((k) => UNITS[k].kind === 'ship') as ShipId[];
/** ships that never leave their planet */
export const STATIONARY_SHIPS: readonly ShipId[] = ['solarSatellite', 'crawler'];
export const isStationary = (id: string) => (STATIONARY_SHIPS as readonly string[]).includes(id);

/** Planet position bonuses: orbit decides which mine pays extra (as in the classic game) */
export const POSITION_BONUS: Record<number, { metal?: number; crystal?: number }> = {
  1: { crystal: 0.4 }, 2: { crystal: 0.3 }, 3: { crystal: 0.2 },
  6: { metal: 0.17 }, 7: { metal: 0.23 }, 8: { metal: 0.35 }, 9: { metal: 0.23 }, 10: { metal: 0.17 },
};
/** Crawlers: +0.1% output of every mine each, at most 6 working per mine level (sum of the three), at most +50% in total, and each working one draws 6 energy. Collectors multiply the bonus and the cap by 1.25. */
export const CRAWLER = { perUnit: 0.001, perMineLevel: 6, cap: 0.5, /** energy each working crawler draws, so they compete with the mines for power */ energy: 6 };
export const crawlerBonus = (count: number, mineLevels: number, mul = 1) => Math.min(Math.min(count, CRAWLER.perMineLevel * mineLevels) * CRAWLER.perUnit * mul, CRAWLER.cap * mul);

export const DEFENSE_IDS = (Object.keys(UNITS) as UnitId[]).filter((k) => UNITS[k].kind === 'defense') as DefenseId[];
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const TECH_IDS = Object.keys(TECHS) as TechId[];

export const isShip = (id: string): id is ShipId => id in UNITS && UNITS[id as UnitId].kind === 'ship';
export const isDefense = (id: string): id is DefenseId => id in UNITS && UNITS[id as UnitId].kind === 'defense';

/** Planet diameter by orbital position [min, max] km: inner = small and hot, middle = large. */
export const POS_DIAMETER: ([number, number] | null)[] = [null,
  [5800, 9800], [5800, 9800], [6600, 10800], [9200, 14800], [9200, 15200], [9200, 15600],
  [10600, 17000], [10600, 17400], [10600, 16600], [9000, 15400], [8000, 14200], [7400, 13000],
  [6400, 12400], [5400, 11200], [5000, 10000]];
export const fieldsFromDiameter = (km: number) => Math.floor((km / 1000) ** 2);

export interface FactionDef { id: FactionId; name: string; rival: FactionId; perk: string; tag: string }
export const FACTIONS: FactionDef[] = [
  { id: 'iron', name: 'Concord of Iron', rival: 'chain', perk: '+10% shield strength on everything you own', tag: 'Defensive bloc of old mining houses.' },
  { id: 'verge', name: 'Verge Syndicate', rival: 'solar', perk: '+15% plunder and +10% cargo space', tag: 'Smugglers, salvagers and privateers.' },
  { id: 'solar', name: 'Solar Covenant', rival: 'verge', perk: '+8% output from every mine', tag: 'Industrial worlds that trade rather than raid.' },
  { id: 'chain', name: 'Black Chain', rival: 'iron', perk: '+10% weapon damage', tag: 'Warlords who measure wealth in wreckage.' },
];
export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<FactionId, FactionDef>;
export const JOIN_REP = 40;

export interface OfficerDef { id: OfficerId; name: string; cost: [number, number, number]; desc: string }
export const OFFICERS: OfficerDef[] = [
  { id: 'quartermaster', name: 'Quartermaster', cost: [400, 1200, 3000], desc: '+5% output from every mine in your empire, per rank.' },
  { id: 'engineer', name: 'Chief Engineer', cost: [400, 1200, 3000], desc: '-10% building, research and shipyard time per rank, and +5% energy.' },
  { id: 'admiral', name: 'Fleet Admiral', cost: [600, 1600, 4000], desc: '+1 fleet slot per rank, and +1 expedition slot every second rank.' },
  { id: 'spymaster', name: 'Spymaster', cost: [500, 1400, 3500], desc: 'Spy reports reveal more, and your probes are caught far less often.' },
  { id: 'geologist', name: 'Geologist', cost: [500, 1400, 3500], desc: '+5% debris from every battle per rank, and +15% from expedition finds.' },
];
export const OFFICER_MAX = 3;

export interface CharClassDef { id: CharClass; name: string; tag: string; perks: string[] }
/** Pick one: the first choice is free, changing later costs Command Credits. */
export const CHAR_CLASSES: CharClassDef[] = [
  { id: 'collector', name: 'Collector', tag: 'Economy: the empire builder.', perks: ['+15% output from every mine', '+10% energy production', '+25% cargo on Small and Large Cargo ships', 'The merchant keeps 8% instead of 12%', 'Crawlers are 25% more effective'] },
  { id: 'general', name: 'General', tag: 'War: the fleet commander.', perks: ['+2 fleet slots', '25% less fuel on every flight', '+25% flight speed for combat ships and recyclers', '+3% more debris from battles'] },
  { id: 'discoverer', name: 'Discoverer', tag: 'Exploration: the pathfinder.', perks: ['+1 expedition slot', '+50% resources and ships found on expeditions', 'Half as many pirate ambushes and black holes', '+10% research speed', 'New colonies are 10% bigger'] },
];
export const CLASS_CHANGE_COST = 2000;
/** ships the General's +25% speed applies to */
export const GENERAL_FAST_SHIPS: string[] = ['lightFighter', 'heavyFighter', 'cruiser', 'battleship', 'battlecruiser', 'bomber', 'destroyer', 'deathstar', 'recycler'];

/** Travelling merchant: swaps resources at a fixed 3:2:1 rate, keeping a cut. */
/** Ready-made build orders. Each step raises a building (on the planet it runs on) or a technology to a level. */
export const BUILD_ORDER_TEMPLATES: { id: string; name: string; desc: string; steps: { kind: 'building' | 'tech'; id: string; level: number }[] }[] = [
  { id: 'opener', name: 'Economy opener', desc: 'Mines and power up to the first research lab.', steps: [
    { kind: 'building', id: 'metalMine', level: 4 }, { kind: 'building', id: 'crystalMine', level: 3 }, { kind: 'building', id: 'solarPlant', level: 4 },
    { kind: 'building', id: 'metalMine', level: 8 }, { kind: 'building', id: 'crystalMine', level: 6 }, { kind: 'building', id: 'solarPlant', level: 8 },
    { kind: 'building', id: 'deuteriumSynthesizer', level: 4 }, { kind: 'building', id: 'roboticsFactory', level: 2 }, { kind: 'building', id: 'researchLab', level: 1 },
    { kind: 'building', id: 'metalMine', level: 10 }, { kind: 'building', id: 'crystalMine', level: 8 }, { kind: 'building', id: 'solarPlant', level: 10 },
  ] },
  { id: 'science', name: 'Science start', desc: 'A lab and the first technologies every commander needs.', steps: [
    { kind: 'building', id: 'researchLab', level: 3 }, { kind: 'tech', id: 'energy', level: 2 }, { kind: 'tech', id: 'combustionDrive', level: 3 },
    { kind: 'tech', id: 'computer', level: 3 }, { kind: 'tech', id: 'espionage', level: 2 }, { kind: 'tech', id: 'energy', level: 4 },
  ] },
  { id: 'colony', name: 'Colony starter', desc: 'Gets a new colony producing and able to build ships.', steps: [
    { kind: 'building', id: 'solarPlant', level: 5 }, { kind: 'building', id: 'metalMine', level: 5 }, { kind: 'building', id: 'crystalMine', level: 4 },
    { kind: 'building', id: 'roboticsFactory', level: 2 }, { kind: 'building', id: 'shipyard', level: 2 }, { kind: 'building', id: 'metalStorage', level: 2 },
  ] },
];

/** how each resource is shown to players (the internal key stays `deuterium`) */
export const RES_NAME = { metal: 'metal', crystal: 'crystal', deuterium: 'vespene gas' } as const;
export const resName = (k: string): string => (RES_NAME as Record<string, string>)[k] ?? k;

export const TRADE_VALUE = { metal: 1, crystal: 1.5, deuterium: 3 } as const;
export const TRADE_FEE = 0.12;
export const TRADE_FEE_COLLECTOR = 0.08;
/** Every day the merchant picks one trade he will do for a token cut, up to a daily allowance per commander. */
export const DEAL_FEE = 0.02;
export const dailyDeal = (day: number): { give: keyof typeof TRADE_VALUE; get: keyof typeof TRADE_VALUE } => {
  const pairs: [keyof typeof TRADE_VALUE, keyof typeof TRADE_VALUE][] = [['metal', 'crystal'], ['crystal', 'metal'], ['metal', 'deuterium'], ['deuterium', 'metal'], ['crystal', 'deuterium'], ['deuterium', 'crystal']];
  const h = Math.imul(day ^ 0x9e3779b1, 2654435761) >>> 0;
  const [give, get] = pairs[h % pairs.length];
  return { give, get };
};
export const tradeQuote = (give: keyof typeof TRADE_VALUE, get: keyof typeof TRADE_VALUE, amount: number, fee = TRADE_FEE) =>
  Math.floor((Math.max(0, amount) * TRADE_VALUE[give]) / TRADE_VALUE[get] * (1 - fee));

export interface AllianceUpgrade { id: string; name: string; desc: string; base: Res; factor: number; perLevel: number }
export const ALLIANCE_UPGRADES: Record<string, AllianceUpgrade> = {
  production: { id: 'production', name: 'Shared Mining Network', desc: '+2% mine output per level for every member.', base: { metal: 50_000, crystal: 25_000, deuterium: 10_000 }, factor: 2, perLevel: 0.02 },
  research: { id: 'research', name: 'Joint Research Institute', desc: '-3% research time per level for every member.', base: { metal: 40_000, crystal: 40_000, deuterium: 20_000 }, factor: 2, perLevel: 0.03 },
  command: { id: 'command', name: 'Joint Command', desc: '+1 fleet slot for every member per 2 levels.', base: { metal: 80_000, crystal: 50_000, deuterium: 40_000 }, factor: 2.2, perLevel: 0.5 },
  logistics: { id: 'logistics', name: 'Allied Logistics', desc: '+3% fleet speed per level for every member.', base: { metal: 60_000, crystal: 30_000, deuterium: 30_000 }, factor: 2, perLevel: 0.03 },
};

/** Two ships change engine when the matching technology is high enough: from that level they fly on the better drive, from a better base speed, and their speed grows with that drive instead of the old one. */
export const DRIVE_SWITCH: Partial<Record<ShipId, { tech: 'impulseDrive' | 'hyperspaceDrive'; level: number; speed: number }>> = {
  smallCargo: { tech: 'impulseDrive', level: 5, speed: 10_000 },
  bomber: { tech: 'hyperspaceDrive', level: 8, speed: 5_000 },
};
export const DRIVE_BONUS = { combustionDrive: 0.1, impulseDrive: 0.2, hyperspaceDrive: 0.3 } as const;

/** how long an expedition may stay out (whole hours); the server clamps to this and the Fleet page offers exactly these */
export const EXPEDITION_HOURS = { min: 1, max: 4 };
