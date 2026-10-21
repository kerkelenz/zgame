/**
 * Short plain-language explanations for the details page of every building, research, ship and defense: what it is for and the one or two
 * things worth knowing. Numbers that depend on your levels are shown live on the page; the text here sticks to rules that never change.
 */
export interface Help { does: string; tips?: string[] }

export const HELP: Record<string, Help> = {
  // ------------------------------------------------------------ buildings
  metalMine: { does: 'Digs metal, the basic material for almost everything you build. Each level raises the output and the energy the mine draws.', tips: ['Planets at orbit positions 6 to 10 give a metal bonus, best at position 8 (+35%).', 'Mines slow down together when the planet runs short of energy.'] },
  crystalMine: { does: 'Produces crystal, needed for electronics, research and advanced hulls. Output and energy use rise with every level.', tips: ['Orbit positions 1 to 3 give a crystal bonus, best at position 1 (+40%).'] },
  deuteriumSynthesizer: { does: 'Draws deuterium out of the atmosphere. Every flight burns it, and the Fusion Reactor runs on it.', tips: ['Colder planets, further from the sun, yield more.'] },
  solarPlant: { does: 'Turns sunlight into energy. Mines and working Crawlers all draw energy; when production falls short, every mine slows down together.', tips: ['Solar Satellites add energy without taking a building field.'] },
  fusionReactor: { does: 'Burns deuterium to make a large amount of energy. Its output grows with every level and with Energy Technology.', tips: ['The gas it burns is subtracted from the planet\'s deuterium output, so look at the net amount.', 'Needs a Deuterium Synthesizer and Energy Technology.'] },
  roboticsFactory: { does: 'Robots shorten the construction time of buildings. Each level helps, and it is required for the Shipyard and the Nanite Factory.', tips: ['Does not speed up research or shipbuilding (the Research Lab and the Shipyard do).'] },
  naniteFactory: { does: 'Nanite swarms halve construction and shipbuilding time with every level, on top of the Robotics Factory. Very expensive.', tips: ['The strongest speed-up in the game once you have the resources.'] },
  shipyard: { does: 'Builds ships and defenses. Higher levels build faster and unlock bigger ships and defenses.', tips: ['Level 12 is also needed to forge a moon.', 'Almost every ship and defense lists it as a requirement.'] },
  researchLab: { does: 'Research needs a lab, and higher levels research faster and open more technologies.', tips: ['Most technologies ask for a certain lab level.'] },
  metalStorage: { does: 'Raises how much metal the planet can hold. Production stops when the store is full, so spend before it fills.', tips: ['Storage does not protect against raids.'] },
  crystalStorage: { does: 'Raises how much crystal the planet can hold. Production stops when the store is full.', tips: ['Storage does not protect against raids.'] },
  deuteriumTank: { does: 'Raises how much deuterium the planet can hold. Production stops when the tank is full.', tips: ['Storage does not protect against raids.'] },
  missileSilo: { does: 'Stores missiles: 10 slots per level, an interplanetary missile takes 2 and an interceptor takes 1. Higher levels also reach further.', tips: ['Missiles only hit defenses, never ships.'] },
  terraformer: { does: 'Reshapes the surface to create 8 extra building fields per level, so the planet can hold more buildings.', tips: ['The Terraformer itself uses no field.'] },
  spaceDock: { does: 'Rebuilds a share of the ships you lose defending this planet, for free, from the wreck field the battle leaves.', tips: ['3.5% of the wreck per level, at most 35% at level 10.', 'Only works on planets, not moons.'] },
  lunarBase: { does: 'A moon has almost no room: the base gives it usable building fields, 3 per level on top of 1 free field.', tips: ['Moon only.'] },
  sensorPhalanx: { does: 'Scans fleet movements around the moon: any planet within range shows what is flying to and from it.', tips: ['Range grows quickly with level (level squared minus one systems).', 'Each scan costs deuterium.', 'Moon only.'] },
  jumpGate: { does: 'Instantly moves ships to another of your moons that also has a Jump Gate, with no flight time.', tips: ['After a jump the gate has to recharge; higher levels recharge faster.', 'Moon only.'] },

  // ------------------------------------------------------------ research
  energy: { does: 'The basis of power technology. It raises what Fusion Reactors produce and opens most of the advanced research.', tips: ['Needed by Laser, Ion, Hyperspace, Plasma and the engines.'] },
  laser: { does: 'Focused light. A stepping stone to ion weapons and to light lasers and similar defenses.' },
  ion: { does: 'Ion beams for heavy weapons: needed for the Ion Cannon and for later research.' },
  hyperspace: { does: 'Bends space. It unlocks the Hyperspace Drive, the big warships and the Jump Gate.', tips: ['Not the same as the Hyperspace Drive, which is the engine itself.'] },
  plasma: { does: 'Superheated plasma boosts every mine: +1% metal, +0.66% crystal and +0.33% deuterium per level, for the whole empire.' },
  combustionDrive: { does: 'Speeds up the ships built for combustion engines by 10% of their base speed per level.' },
  impulseDrive: { does: 'Speeds up the ships built for impulse engines by 20% of their base speed per level. Also needed for colony ships and heavier fleets.', tips: ['At level 5 the Small Cargo switches to this engine.'] },
  hyperspaceDrive: { does: 'Speeds up the ships built for hyperspace engines by 30% of their base speed per level.', tips: ['At level 8 the Bomber switches to this engine.'] },
  espionage: { does: 'Better spying. Your probes learn more, are caught less often, and you can tell more about the enemy fleets heading your way.', tips: ['Compare your level with the target\'s: that difference decides how much a spy report or an incoming fleet reveals.'] },
  computer: { does: 'Each level gives you one more fleet slot, so more fleets can be out at the same time.' },
  astrophysics: { does: 'Lets you hold more planets and send more expeditions at once.', tips: ['Every second level allows another planet.'] },
  weapons: { does: 'Every level makes all your ships and defenses hit 10% harder.' },
  shielding: { does: 'Every level strengthens the shields of all your ships and defenses by 10%.' },
  armour: { does: 'Every level makes the hulls of all your ships and defenses 10% sturdier.' },
  graviton: { does: 'Manipulates gravity itself. It costs no resources: the price is the energy output of a single planet.', tips: ['Needed for the Deathstar and to forge a moon.'] },

  // ------------------------------------------------------------ ships
  smallCargo: { does: 'A nimble transport for resources. Cheap, fast and good for raiding inactive neighbours and for moving goods between your planets.', tips: ['Collectors carry 25% more in it.'] },
  largeCargo: { does: 'A heavy transport that carries far more than the Small Cargo, but flies slower.', tips: ['Collectors carry 25% more in it.'] },
  lightFighter: { does: 'The cheapest warship. Weak alone, but it dies cheaply and is a good screen for a bigger fleet.' },
  heavyFighter: { does: 'A sturdier fighter with better armour. A step up from the Light Fighter at modest cost.' },
  cruiser: { does: 'Excellent against light fighters and rocket launchers thanks to rapid fire. A core ship of the middle game.' },
  battleship: { does: 'The backbone of a serious fleet: heavy guns and thick armour at a fair price.' },
  battlecruiser: { does: 'A raider built to hunt transports and fighters, with strong rapid fire against them.' },
  bomber: { does: 'Smashes planetary defenses with rapid fire against rocket launchers and lasers.', tips: ['It flies on impulse drive until Hyperspace Drive 8; from then on it uses the hyperspace drive from a base speed of 5,000.'] },
  destroyer: { does: 'A heavy warship with strong rapid fire against light lasers and battlecruisers.' },
  deathstar: { does: 'The ultimate weapon. Overwhelming firepower and rapid fire against nearly everything; the only ship that can destroy a moon.', tips: ['Very slow and enormously expensive.', 'Moon destruction can also tear the Deathstars apart.'] },
  reaper: { does: 'A heavy warship that salvages too. On a Recycle mission it collects a debris field like a Recycler (10,000 per ship), and when it fights in a battle as an attacker it takes up to 30% of the debris that battle makes straight into its hold.', tips: ['The share it takes in battle is limited by its free cargo space, which loot also uses.', 'It needs Shipyard 10, Hyperspace Drive 6 and Shielding Technology 6.'] },
  recycler: { does: 'Collects debris fields above planets: metal and crystal together, in the proportion they lie there.', tips: ['Its recycling capacity is shown on the Fleet page when you select it.', 'Recyclers also help to salvage on expeditions.'] },
  espionageProbe: { does: 'A tiny scout for spy reports. Fast, but a battle against defenses can destroy it.', tips: ['How much a spy report shows depends on probes sent and on Espionage Technology.'] },
  colonyShip: { does: 'Founds a new planet on an empty position. The ship is used up when it settles.', tips: ['You need Astrophysics to hold more planets.'] },
  pathfinder: { does: 'Built for deep space: it finds more on expeditions and can steer the fleet clear of black holes.', tips: ['Each one adds 10% to expedition finds, five count at most.'] },
  crawler: { does: 'A mining machine that boosts the output of all three mines on its planet. It stays on the planet and draws energy.', tips: ['At most 6 working Crawlers per mine level; the total bonus is capped.'] },
  solarSatellite: { does: 'Hangs in orbit and adds energy to the planet without using a building field. It stays on the planet.', tips: ['Warm planets give more energy per satellite.', 'Fragile: raiders can shoot it down.'] },

  // ------------------------------------------------------------ defenses
  rocketLauncher: { does: 'Cheap defense that soaks up fire and kills light attackers in numbers.' },
  lightLaser: { does: 'A solid early defense, good against fighters.' },
  heavyLaser: { does: 'A stronger laser with better armour, a solid mid-game defense.' },
  gaussCannon: { does: 'A powerful kinetic cannon that hurts armoured ships.' },
  ionCannon: { does: 'Strips enemy shields: good against fleets that rely on them.' },
  plasmaTurret: { does: 'The strongest defense: a devastating plasma weapon with a thick hull.' },
  antiBallisticMissile: { does: 'Intercepts incoming interplanetary missiles, one for one. Stored in the Missile Silo.', tips: ['It takes 1 silo slot.'] },
  interplanetaryMissile: { does: 'A long-range missile that destroys enemy defenses (never ships). Stored in the Missile Silo and fired from the Fleet page.', tips: ['The target\'s interceptors stop one missile each.', 'It takes 2 silo slots.'] },
  smallShield: { does: 'A dome that absorbs shots for the whole planet. Only one per planet.' },
  largeShield: { does: 'A far stronger shield dome. Only one per planet.' },
};
