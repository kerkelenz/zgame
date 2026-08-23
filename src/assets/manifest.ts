/**
 * GENERATED FILE - do not edit by hand.
 * Regenerate with: npm run gen:placeholders
 *
 * -----------------------------------------------------------------------
 * To replace placeholder art, put your file in `src/assets/art/` and change
 * the require path here - nothing else in the app needs to change.
 * -----------------------------------------------------------------------
 *
 * For example, once you have real art for the metal mine:
 *
 *     'building.metalMine': require('./art/metal-mine.png'),
 *
 * Every screen reaches images through `<GameImage id="building.metalMine" />`,
 * which looks the key up in this table. The key is the app-facing name; the
 * file path is an implementation detail that lives only in this file.
 *
 * (Note that once you hand-edit a require path, re-running the generator will
 * overwrite it. At that point the asset has graduated: move its key out of
 * scripts/gen-placeholders.mjs and into a hand-written companion module.)
 *
 * Why `require()` and not `import`? React Native's bundler statically analyses
 * `require()` calls to build the asset registry, resolving @2x/@3x variants and
 * bundling the right density per device. A dynamic path would silently produce
 * a missing image on a real device even though it worked on web.
 */

import type { ImageSourcePropType } from 'react-native';

import type { Planet } from '@/engine';

/**
 * Every asset key, as a runtime array. `as const` is what lets us derive the
 * `AssetKey` union from it, so the type and the data can never drift apart.
 */
export const ASSET_KEYS = [
  'building.metalMine',
  'building.crystalMine',
  'building.deuteriumSynthesizer',
  'building.solarPlant',
  'building.roboticsFactory',
  'building.shipyard',
  'building.researchLab',
  'building.metalStorage',
  'building.crystalStorage',
  'building.deuteriumTank',
  'resource.metal',
  'resource.crystal',
  'resource.deuterium',
  'resource.energy',
  'planet.temperate.1',
  'planet.temperate.2',
  'planet.desert.1',
  'planet.ice.1',
  'planet.gas.1',
  'research.energy',
  'research.laser',
  'research.ion',
  'research.hyperspace',
  'research.plasma',
  'research.combustionDrive',
  'research.impulseDrive',
  'research.hyperspaceDrive',
  'research.espionage',
  'research.computer',
  'research.astrophysics',
  'research.weapons',
  'research.shielding',
  'research.armour',
  'ship.smallCargo',
  'ship.largeCargo',
  'ship.lightFighter',
  'ship.heavyFighter',
  'ship.cruiser',
  'ship.battleship',
  'ship.colonyShip',
  'ship.recycler',
  'ship.espionageProbe',
  'ship.bomber',
  'ship.destroyer',
  'ship.deathstar',
  'ship.battlecruiser',
  'defense.rocketLauncher',
  'defense.lightLaser',
  'defense.heavyLaser',
  'defense.gaussCannon',
  'defense.ionCannon',
  'defense.plasmaTurret',
  'defense.smallShield',
  'defense.largeShield',
  'ui.time',
  'ui.production',
  'ui.storage',
  'ui.build',
  'ui.locked',
  'ui.check',
  'ui.warning',
  'ui.cancel',
  'ui.upgrade',
  'ui.level',
  'ui.temperature',
  'ui.diameter',
  'ui.coords',
  'ui.cost',
  'ui.planet',
  'ui.buildings',
  'ui.starfield',
  'ui.missing',
] as const;

/** The union of every valid asset key, e.g. `'building.metalMine'`. */
export type AssetKey = (typeof ASSET_KEYS)[number];

/**
 * The asset table. Typed as an exhaustive `Record`, so forgetting an entry is
 * a compile error rather than a magenta checkerboard at runtime.
 */
export const ASSETS: Record<AssetKey, ImageSourcePropType> = {
  'building.metalMine': require('./placeholders/building-metalMine.png'),
  'building.crystalMine': require('./placeholders/building-crystalMine.png'),
  'building.deuteriumSynthesizer': require('./placeholders/building-deuteriumSynthesizer.png'),
  'building.solarPlant': require('./placeholders/building-solarPlant.png'),
  'building.roboticsFactory': require('./placeholders/building-roboticsFactory.png'),
  'building.shipyard': require('./placeholders/building-shipyard.png'),
  'building.researchLab': require('./placeholders/building-researchLab.png'),
  'building.metalStorage': require('./placeholders/building-metalStorage.png'),
  'building.crystalStorage': require('./placeholders/building-crystalStorage.png'),
  'building.deuteriumTank': require('./placeholders/building-deuteriumTank.png'),
  'resource.metal': require('./placeholders/resource-metal.png'),
  'resource.crystal': require('./placeholders/resource-crystal.png'),
  'resource.deuterium': require('./placeholders/resource-deuterium.png'),
  'resource.energy': require('./placeholders/resource-energy.png'),
  'planet.temperate.1': require('./placeholders/planet-temperate-1.png'),
  'planet.temperate.2': require('./placeholders/planet-temperate-2.png'),
  'planet.desert.1': require('./placeholders/planet-desert-1.png'),
  'planet.ice.1': require('./placeholders/planet-ice-1.png'),
  'planet.gas.1': require('./placeholders/planet-gas-1.png'),
  'research.energy': require('./placeholders/research-energy.png'),
  'research.laser': require('./placeholders/research-laser.png'),
  'research.ion': require('./placeholders/research-ion.png'),
  'research.hyperspace': require('./placeholders/research-hyperspace.png'),
  'research.plasma': require('./placeholders/research-plasma.png'),
  'research.combustionDrive': require('./placeholders/research-combustionDrive.png'),
  'research.impulseDrive': require('./placeholders/research-impulseDrive.png'),
  'research.hyperspaceDrive': require('./placeholders/research-hyperspaceDrive.png'),
  'research.espionage': require('./placeholders/research-espionage.png'),
  'research.computer': require('./placeholders/research-computer.png'),
  'research.astrophysics': require('./placeholders/research-astrophysics.png'),
  'research.weapons': require('./placeholders/research-weapons.png'),
  'research.shielding': require('./placeholders/research-shielding.png'),
  'research.armour': require('./placeholders/research-armour.png'),
  'ship.smallCargo': require('./placeholders/ship-smallCargo.png'),
  'ship.largeCargo': require('./placeholders/ship-largeCargo.png'),
  'ship.lightFighter': require('./placeholders/ship-lightFighter.png'),
  'ship.heavyFighter': require('./placeholders/ship-heavyFighter.png'),
  'ship.cruiser': require('./placeholders/ship-cruiser.png'),
  'ship.battleship': require('./placeholders/ship-battleship.png'),
  'ship.colonyShip': require('./placeholders/ship-colonyShip.png'),
  'ship.recycler': require('./placeholders/ship-recycler.png'),
  'ship.espionageProbe': require('./placeholders/ship-espionageProbe.png'),
  'ship.bomber': require('./placeholders/ship-bomber.png'),
  'ship.destroyer': require('./placeholders/ship-destroyer.png'),
  'ship.deathstar': require('./placeholders/ship-deathstar.png'),
  'ship.battlecruiser': require('./placeholders/ship-battlecruiser.png'),
  'defense.rocketLauncher': require('./placeholders/defense-rocketLauncher.png'),
  'defense.lightLaser': require('./placeholders/defense-lightLaser.png'),
  'defense.heavyLaser': require('./placeholders/defense-heavyLaser.png'),
  'defense.gaussCannon': require('./placeholders/defense-gaussCannon.png'),
  'defense.ionCannon': require('./placeholders/defense-ionCannon.png'),
  'defense.plasmaTurret': require('./placeholders/defense-plasmaTurret.png'),
  'defense.smallShield': require('./placeholders/defense-smallShield.png'),
  'defense.largeShield': require('./placeholders/defense-largeShield.png'),
  'ui.time': require('./placeholders/ui-time.png'),
  'ui.production': require('./placeholders/ui-production.png'),
  'ui.storage': require('./placeholders/ui-storage.png'),
  'ui.build': require('./placeholders/ui-build.png'),
  'ui.locked': require('./placeholders/ui-locked.png'),
  'ui.check': require('./placeholders/ui-check.png'),
  'ui.warning': require('./placeholders/ui-warning.png'),
  'ui.cancel': require('./placeholders/ui-cancel.png'),
  'ui.upgrade': require('./placeholders/ui-upgrade.png'),
  'ui.level': require('./placeholders/ui-level.png'),
  'ui.temperature': require('./placeholders/ui-temperature.png'),
  'ui.diameter': require('./placeholders/ui-diameter.png'),
  'ui.coords': require('./placeholders/ui-coords.png'),
  'ui.cost': require('./placeholders/ui-cost.png'),
  'ui.planet': require('./placeholders/ui-planet.png'),
  'ui.buildings': require('./placeholders/ui-buildings.png'),
  'ui.starfield': require('./placeholders/ui-starfield.png'),
  'ui.missing': require('./placeholders/ui-missing.png'),
};

/**
 * Keys drawn as a single glyph on a transparent background, rather than as a
 * framed tile with a caption.
 *
 * `<GameImage>` uses this to decide whether to draw a rounded card behind the
 * image, so call sites never have to remember which is which. The `ui.*` ones
 * are painted white on purpose - tint them at the call site to colour-code
 * meaning (amber for "cannot afford", red for "blocked", green for "ready").
 */
export const ICON_KEYS = [
  'resource.metal',
  'resource.crystal',
  'resource.deuterium',
  'resource.energy',
  'ui.time',
  'ui.production',
  'ui.storage',
  'ui.build',
  'ui.locked',
  'ui.check',
  'ui.warning',
  'ui.cancel',
  'ui.upgrade',
  'ui.level',
  'ui.temperature',
  'ui.diameter',
  'ui.coords',
  'ui.cost',
  'ui.planet',
  'ui.buildings',
] as const satisfies readonly AssetKey[];

export type IconKey = (typeof ICON_KEYS)[number];

const ICON_KEY_SET: ReadonlySet<string> = new Set(ICON_KEYS);

export function isIconKey(key: AssetKey): key is IconKey {
  return ICON_KEY_SET.has(key);
}

// ---------------------------------------------------------------------------
// Planet art selection
// ---------------------------------------------------------------------------

/** Which art variants exist for each planet type, in variant order. */
const PLANET_VARIANTS = {
  temperate: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.temperate.')),
  desert: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.desert.')),
  ice: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.ice.')),
  gas: ASSET_KEYS.filter((k): k is AssetKey => k.startsWith('planet.gas.')),
};

export type PlanetType = keyof typeof PLANET_VARIANTS;

/**
 * A planet's climate type, derived from its average surface temperature.
 *
 * Exported separately from `planetArtKey` because the interface wants to *say*
 * "TEMPERATE" as well as draw it - a label the player can read beats a picture
 * they have to interpret.
 */
export function planetType(planet: Planet): PlanetType {
  const avgTemp = (planet.temperature.min + planet.temperature.max) / 2;
  return avgTemp >= 60 ? 'desert' : avgTemp <= -60 ? 'gas' : avgTemp <= -20 ? 'ice' : 'temperate';
}

/**
 * Pick a planet's artwork deterministically from its own data.
 *
 * Two inputs, doing two different jobs:
 *
 * - **Temperature picks the *type*.** A world averaging 90 C is a desert, one
 *   at -70 C is a frozen gas giant. This is the same number the deuterium
 *   formula uses, so what the player sees agrees with what they earn.
 * - **Orbital position picks the *variant*.** Purely cosmetic - it just stops
 *   every temperate world in the galaxy from looking identical.
 *
 * Deterministic on purpose: a planet must not change appearance between app
 * launches, and we do not want to store an art id in the save file for
 * something we can always re-derive.
 */
export function planetArtKey(planet: Planet): AssetKey {
  const variants = PLANET_VARIANTS[planetType(planet)];
  if (variants.length === 0) return 'ui.missing';

  // Positions are 1-based, so subtract one before taking the modulus.
  return variants[Math.abs(planet.coords.position - 1) % variants.length];
}
