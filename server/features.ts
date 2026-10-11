import type { Player, World } from './world';

/**
 * Which optional pages are worth showing this commander yet. They only decide what the menu offers: every page keeps working
 * if it is opened, and Settings can turn the filtering off.
 */
export interface Features { automation: boolean; territory: boolean; invasion: boolean; simulator: boolean }

export function featuresOf(w: World, p: Player): Features {
  const planets = p.planetIds.map((id) => w.planets[id]).filter(Boolean);
  const levels = planets.reduce((s, pl) => s + Object.values(pl.buildings).reduce((a, b) => a + (b || 0), 0), 0);
  const yard = planets.some((pl) => (pl.buildings.shipyard || 0) >= 1);
  return {
    // once there is something to automate, or the player has already started using it
    automation: !!(p.autoRules || p.buildOrders?.length || planets.some((pl) => pl.plan)) || levels >= 12,
    // territory is an alliance matter
    territory: !!p.allianceId,
    // during an event, and afterwards for the record
    invasion: !!w.invasion || (w.invasionHistory?.length ?? 0) > 0,
    // the battle simulator is for people who can build ships or have fought
    simulator: yard || p.stats.battlesWon + p.stats.battlesLost > 0,
  };
}
