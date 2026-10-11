export type Res = { metal: number; crystal: number; deuterium: number };

export type BuildingId =
  | 'metalMine' | 'crystalMine' | 'deuteriumSynthesizer' | 'solarPlant' | 'fusionReactor'
  | 'roboticsFactory' | 'naniteFactory' | 'shipyard' | 'researchLab'
  | 'metalStorage' | 'crystalStorage' | 'deuteriumTank' | 'missileSilo'
  | 'lunarBase' | 'sensorPhalanx' | 'jumpGate' | 'terraformer';

export type TechId =
  | 'energy' | 'laser' | 'ion' | 'hyperspace' | 'plasma'
  | 'combustionDrive' | 'impulseDrive' | 'hyperspaceDrive'
  | 'espionage' | 'computer' | 'astrophysics' | 'weapons' | 'shielding' | 'armour' | 'graviton';

export type ShipId =
  | 'smallCargo' | 'largeCargo' | 'lightFighter' | 'heavyFighter' | 'cruiser' | 'battleship'
  | 'battlecruiser' | 'bomber' | 'destroyer' | 'deathstar' | 'recycler' | 'espionageProbe'
  | 'colonyShip' | 'solarSatellite';

export type DefenseId =
  | 'rocketLauncher' | 'lightLaser' | 'heavyLaser' | 'gaussCannon' | 'ionCannon'
  | 'plasmaTurret' | 'smallShield' | 'largeShield'
  | 'antiBallisticMissile' | 'interplanetaryMissile';

export type UnitId = ShipId | DefenseId;
export type ItemId = BuildingId | TechId | UnitId;

export type Fleet = Partial<Record<ShipId, number>>;
export type Defenses = Partial<Record<DefenseId, number>>;

export type Coords = { g: number; s: number; p: number };

export type Mission =
  | 'attack' | 'transport' | 'deploy' | 'espionage' | 'colonize'
  | 'recycle' | 'expedition' | 'hold' | 'missile' | 'destroy';

export interface Requirement { id: BuildingId | TechId; level: number }

export interface BuildingDef {
  id: BuildingId; name: string; desc: string;
  base: Res; factor: number; requires: Requirement[];
  /** can only be built on moons */
  moonOnly?: boolean;
}
export interface TechDef {
  id: TechId; name: string; desc: string;
  base: Res; factor: number; requires: Requirement[];
  /** needs a planet producing this much energy (x3 per further level) */
  energyReq?: number;
}

export type FactionId = 'iron' | 'verge' | 'solar' | 'chain';
export type OfficerId = 'quartermaster' | 'engineer' | 'admiral' | 'spymaster' | 'geologist';
export interface UnitDef {
  id: UnitId; name: string; desc: string; kind: 'ship' | 'defense';
  cost: Res; attack: number; shield: number; hull: number;
  cargo: number; speed: number; fuel: number;
  drive: 'combustionDrive' | 'impulseDrive' | 'hyperspaceDrive' | null;
  rapidFire: Partial<Record<UnitId, number>>;
  requires: Requirement[];
  max?: number;
  /** stored in the silo, never takes part in regular combat */
  missile?: boolean;
}
