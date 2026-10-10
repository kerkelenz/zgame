import type {
  BuildingDef, BuildingId, DefenseId, ShipId, TechDef, TechId, UnitDef, UnitId, Res,
} from './types';

const r = (metal = 0, crystal = 0, deuterium = 0): Res => ({ metal, crystal, deuterium });

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  metalMine: { id: 'metalMine', name: 'Metal Mine', desc: 'Extracts metal ore. Consumes energy.', base: r(60, 15), factor: 1.5, requires: [] },
  crystalMine: { id: 'crystalMine', name: 'Crystal Mine', desc: 'Extracts crystal. Consumes energy.', base: r(48, 24), factor: 1.6, requires: [] },
  deuteriumSynthesizer: { id: 'deuteriumSynthesizer', name: 'Deuterium Synthesizer', desc: 'Filters deuterium from water. Colder planets yield more.', base: r(225, 75), factor: 1.5, requires: [] },
  solarPlant: { id: 'solarPlant', name: 'Solar Plant', desc: 'Generates energy from sunlight.', base: r(75, 30), factor: 1.5, requires: [] },
  fusionReactor: { id: 'fusionReactor', name: 'Fusion Reactor', desc: 'Burns deuterium for large amounts of energy.', base: r(900, 360, 180), factor: 1.8, requires: [{ id: 'deuteriumSynthesizer', level: 5 }, { id: 'energy', level: 3 }] },
  roboticsFactory: { id: 'roboticsFactory', name: 'Robotics Factory', desc: 'Speeds up building construction.', base: r(400, 120, 200), factor: 2, requires: [] },
  naniteFactory: { id: 'naniteFactory', name: 'Nanite Factory', desc: 'Halves construction and shipbuilding time per level.', base: r(1_000_000, 500_000, 100_000), factor: 2, requires: [{ id: 'roboticsFactory', level: 10 }, { id: 'computer', level: 10 }] },
  shipyard: { id: 'shipyard', name: 'Shipyard', desc: 'Builds ships and defenses.', base: r(400, 200, 100), factor: 2, requires: [{ id: 'roboticsFactory', level: 2 }] },
  researchLab: { id: 'researchLab', name: 'Research Lab', desc: 'Required for research; speeds it up.', base: r(200, 400, 200), factor: 2, requires: [] },
  metalStorage: { id: 'metalStorage', name: 'Metal Storage', desc: 'Raises metal capacity.', base: r(1000), factor: 2, requires: [] },
  crystalStorage: { id: 'crystalStorage', name: 'Crystal Storage', desc: 'Raises crystal capacity.', base: r(1000, 500), factor: 2, requires: [] },
  deuteriumTank: { id: 'deuteriumTank', name: 'Deuterium Tank', desc: 'Raises deuterium capacity.', base: r(1000, 1000), factor: 2, requires: [] },
};

export const TECHS: Record<TechId, TechDef> = {
  energy: { id: 'energy', name: 'Energy Technology', desc: 'Boosts fusion output; unlocks advanced tech.', base: r(0, 800, 400), factor: 2, requires: [{ id: 'researchLab', level: 1 }] },
  laser: { id: 'laser', name: 'Laser Technology', desc: 'Focused light for weapons.', base: r(200, 100), factor: 2, requires: [{ id: 'researchLab', level: 1 }, { id: 'energy', level: 2 }] },
  ion: { id: 'ion', name: 'Ion Technology', desc: 'Ion beams for heavy weapons.', base: r(1000, 300, 100), factor: 2, requires: [{ id: 'researchLab', level: 4 }, { id: 'energy', level: 4 }, { id: 'laser', level: 5 }] },
  hyperspace: { id: 'hyperspace', name: 'Hyperspace Technology', desc: 'Bends space; unlocks hyperspace drive.', base: r(0, 4000, 2000), factor: 2, requires: [{ id: 'researchLab', level: 7 }, { id: 'energy', level: 5 }, { id: 'shielding', level: 5 }] },
  plasma: { id: 'plasma', name: 'Plasma Technology', desc: 'Boosts metal, crystal and deuterium output by +1%/+0.66%/+0.33% per level.', base: r(2000, 4000, 1000), factor: 2, requires: [{ id: 'researchLab', level: 4 }, { id: 'energy', level: 8 }, { id: 'laser', level: 10 }, { id: 'ion', level: 5 }] },
  combustionDrive: { id: 'combustionDrive', name: 'Combustion Drive', desc: '+10% speed for combustion ships per level.', base: r(400, 0, 600), factor: 2, requires: [{ id: 'researchLab', level: 1 }, { id: 'energy', level: 1 }] },
  impulseDrive: { id: 'impulseDrive', name: 'Impulse Drive', desc: '+20% speed for impulse ships per level.', base: r(2000, 4000, 600), factor: 2, requires: [{ id: 'researchLab', level: 2 }, { id: 'energy', level: 1 }] },
  hyperspaceDrive: { id: 'hyperspaceDrive', name: 'Hyperspace Drive', desc: '+30% speed for hyperspace ships per level.', base: r(10000, 20000, 6000), factor: 2, requires: [{ id: 'researchLab', level: 7 }, { id: 'hyperspace', level: 3 }] },
  espionage: { id: 'espionage', name: 'Espionage Technology', desc: 'Better spy reports and counter-espionage.', base: r(200, 1000, 200), factor: 2, requires: [{ id: 'researchLab', level: 3 }] },
  computer: { id: 'computer', name: 'Computer Technology', desc: '+1 fleet slot per level.', base: r(0, 400, 600), factor: 2, requires: [{ id: 'researchLab', level: 1 }] },
  astrophysics: { id: 'astrophysics', name: 'Astrophysics', desc: 'Allows more colonies (+1 planet per 2 levels) and expeditions.', base: r(4000, 8000, 4000), factor: 1.75, requires: [{ id: 'researchLab', level: 3 }, { id: 'espionage', level: 4 }, { id: 'impulseDrive', level: 3 }] },
  weapons: { id: 'weapons', name: 'Weapons Technology', desc: '+10% attack per level.', base: r(800, 200), factor: 2, requires: [{ id: 'researchLab', level: 4 }] },
  shielding: { id: 'shielding', name: 'Shielding Technology', desc: '+10% shields per level.', base: r(200, 600), factor: 2, requires: [{ id: 'researchLab', level: 6 }, { id: 'energy', level: 3 }] },
  armour: { id: 'armour', name: 'Armour Technology', desc: '+10% hull per level.', base: r(1000), factor: 2, requires: [{ id: 'researchLab', level: 2 }] },
};

type U = Omit<UnitDef, 'id' | 'kind' | 'name'>;
const ship = (id: ShipId, name: string, u: U): UnitDef => ({ id, name, kind: 'ship', ...u });
const def = (id: DefenseId, name: string, u: U): UnitDef => ({ id, name, kind: 'defense', ...u });
const none = {};
const PS = { espionageProbe: 5, solarSatellite: 5 } as const;

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
  deathstar: ship('deathstar', 'Deathstar', { desc: 'The ultimate weapon.', cost: r(5_000_000, 4_000_000, 1_000_000), attack: 200000, shield: 50000, hull: 900000, cargo: 1_000_000, speed: 100, fuel: 1, drive: 'hyperspaceDrive', rapidFire: { smallCargo: 250, largeCargo: 250, lightFighter: 200, heavyFighter: 100, cruiser: 33, battleship: 30, battlecruiser: 15, bomber: 25, destroyer: 5, recycler: 250, colonyShip: 250, rocketLauncher: 200, lightLaser: 200, heavyLaser: 100, gaussCannon: 50, ionCannon: 100, espionageProbe: 1250, solarSatellite: 1250 }, requires: [{ id: 'shipyard', level: 12 }, { id: 'hyperspaceDrive', level: 7 }, { id: 'hyperspace', level: 6 }] }),
  recycler: ship('recycler', 'Recycler', { desc: 'Collects debris fields.', cost: r(10000, 6000, 2000), attack: 1, shield: 10, hull: 1600, cargo: 20000, speed: 2000, fuel: 300, drive: 'combustionDrive', rapidFire: { ...PS }, requires: [{ id: 'shipyard', level: 4 }, { id: 'combustionDrive', level: 6 }, { id: 'shielding', level: 2 }] }),
  espionageProbe: ship('espionageProbe', 'Espionage Probe', { desc: 'Spies on other planets.', cost: r(0, 1000), attack: 0, shield: 0, hull: 100, cargo: 5, speed: 100_000_000, fuel: 1, drive: 'combustionDrive', rapidFire: none, requires: [{ id: 'shipyard', level: 3 }, { id: 'combustionDrive', level: 3 }, { id: 'espionage', level: 2 }] }),
  colonyShip: ship('colonyShip', 'Colony Ship', { desc: 'Founds new colonies.', cost: r(10000, 20000, 10000), attack: 50, shield: 100, hull: 3000, cargo: 7500, speed: 2500, fuel: 1000, drive: 'impulseDrive', rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'impulseDrive', level: 3 }] }),
  solarSatellite: ship('solarSatellite', 'Solar Satellite', { desc: 'Orbits the planet and generates energy.', cost: r(0, 2000, 500), attack: 1, shield: 1, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 1 }, { id: 'energy', level: 2 }] }),

  rocketLauncher: def('rocketLauncher', 'Rocket Launcher', { desc: 'Cheap basic defense.', cost: r(2000), attack: 80, shield: 20, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 1 }] }),
  lightLaser: def('lightLaser', 'Light Laser', { desc: 'Solid early defense.', cost: r(1500, 500), attack: 100, shield: 25, hull: 200, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 2 }, { id: 'energy', level: 2 }, { id: 'laser', level: 3 }] }),
  heavyLaser: def('heavyLaser', 'Heavy Laser', { desc: 'Strong all-round defense.', cost: r(6000, 2000), attack: 250, shield: 100, hull: 800, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'energy', level: 3 }, { id: 'laser', level: 6 }] }),
  gaussCannon: def('gaussCannon', 'Gauss Cannon', { desc: 'Powerful kinetic cannon.', cost: r(20000, 15000, 2000), attack: 1100, shield: 200, hull: 3500, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 6 }, { id: 'energy', level: 6 }, { id: 'weapons', level: 3 }, { id: 'shielding', level: 1 }] }),
  ionCannon: def('ionCannon', 'Ion Cannon', { desc: 'Strips enemy shields.', cost: r(5000, 3000), attack: 150, shield: 500, hull: 800, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 4 }, { id: 'ion', level: 4 }] }),
  plasmaTurret: def('plasmaTurret', 'Plasma Turret', { desc: 'Devastating plasma defense.', cost: r(50000, 50000, 30000), attack: 3000, shield: 300, hull: 10000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, requires: [{ id: 'shipyard', level: 8 }, { id: 'plasma', level: 7 }] }),
  smallShield: def('smallShield', 'Small Shield Dome', { desc: 'Envelops the planet in a shield. Max 1.', cost: r(10000, 10000), attack: 1, shield: 2000, hull: 2000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, max: 1, requires: [{ id: 'shipyard', level: 1 }, { id: 'shielding', level: 2 }] }),
  largeShield: def('largeShield', 'Large Shield Dome', { desc: 'A far stronger shield dome. Max 1.', cost: r(50000, 50000), attack: 1, shield: 10000, hull: 10000, cargo: 0, speed: 0, fuel: 0, drive: null, rapidFire: none, max: 1, requires: [{ id: 'shipyard', level: 6 }, { id: 'shielding', level: 6 }] }),
};

export const SHIP_IDS = (Object.keys(UNITS) as UnitId[]).filter((k) => UNITS[k].kind === 'ship') as ShipId[];
export const DEFENSE_IDS = (Object.keys(UNITS) as UnitId[]).filter((k) => UNITS[k].kind === 'defense') as DefenseId[];
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const TECH_IDS = Object.keys(TECHS) as TechId[];

export const isShip = (id: string): id is ShipId => id in UNITS && UNITS[id as UnitId].kind === 'ship';
export const isDefense = (id: string): id is DefenseId => id in UNITS && UNITS[id as UnitId].kind === 'defense';

export interface AllianceUpgrade { id: string; name: string; desc: string; base: Res; factor: number; perLevel: number }
export const ALLIANCE_UPGRADES: Record<string, AllianceUpgrade> = {
  production: { id: 'production', name: 'Shared Mining Network', desc: '+2% mine output per level for every member.', base: { metal: 50_000, crystal: 25_000, deuterium: 10_000 }, factor: 2, perLevel: 0.02 },
  research: { id: 'research', name: 'Joint Research Institute', desc: '-3% research time per level for every member.', base: { metal: 40_000, crystal: 40_000, deuterium: 20_000 }, factor: 2, perLevel: 0.03 },
  logistics: { id: 'logistics', name: 'Allied Logistics', desc: '+3% fleet speed per level for every member.', base: { metal: 60_000, crystal: 30_000, deuterium: 30_000 }, factor: 2, perLevel: 0.03 },
};
