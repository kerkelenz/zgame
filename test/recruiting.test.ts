import { describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { createAlliance, joinAlliance, updateAlliance } from '../server/alliance';
import { recruitingList } from '../server/recruiting';
import { meView } from '../server/views';
import { createWorld } from '../server/world';
import { advise } from '../client/src/advice';

const T0 = 1_700_000_000_000;
describe('the list of alliances to join', () => {
  const setup = () => {
    const w = createWorld({ npcDensity: 0, protectionPoints: 0 }, T0);
    const a = register(w, 'alpha', 'secret1', T0).player, b = register(w, 'bravo', 'secret2', T0).player, c = register(w, 'charlie', 'secret3', T0).player;
    createAlliance(w, a, 'AAA', 'Alpha Club');
    createAlliance(w, b, 'BBB', 'Bravo Crew');
    return { w, a, b, c };
  };
  it('puts the open ones first, then the strongest, and counts members, points and recent activity', () => {
    const { w, a, b, c } = setup();
    updateAlliance(w, a, { open: false });
    updateAlliance(w, b, { open: true });
    joinAlliance(w, c, w.alliances[b.allianceId!].id, '');
    c.lastSeen = T0 - 10 * 86_400_000;
    const rows = recruitingList(w, T0);
    expect(rows.map((r) => r.tag)).toEqual(['BBB', 'AAA']);                 // open before closed
    const bbb = rows[0];
    expect(bbb.members).toBe(2);
    expect(bbb.active).toBe(1);                                              // charlie has been away for ten days
    expect(bbb.points).toBeGreaterThanOrEqual(0);
  });
  it('is told to the client as a count, and a player without an alliance is nudged after the first hour', () => {
    const { w, a, b, c } = setup();
    updateAlliance(w, a, { open: true });
    const me = meView(w, c, T0 + 2 * 3_600_000) as any;
    expect(me.recruiting).toBeGreaterThanOrEqual(1);
    expect(me.accountAge).toBe(2 * 3_600_000);
    const planet = { id: 'p', name: 'Home', updatedAt: 0, buildQueue: {}, buildBacklog: [], buildings: {}, fleet: {}, defenses: {}, resources: { metal: 0, crystal: 0, deuterium: 0 }, capacity: { metal: 1e4, crystal: 1e4, deuterium: 1e4 }, production: {} };
    const base = { player: { research: {} }, planets: [planet], now: 0 };
    expect(advise({ me: { ...me, player: { research: {} } }, planets: [planet], now: 0 }).some((x) => x.id === 'alliance')).toBe(true);
    expect(advise({ me: { ...me, accountAge: 600_000, player: { research: {} } }, planets: [planet], now: 0 }).some((x) => x.id === 'alliance')).toBe(false);
    expect(advise({ me: { ...me, alliance: { tag: 'AAA' }, player: { research: {} } }, planets: [planet], now: 0 }).some((x) => x.id === 'alliance')).toBe(false);
    void base; void b;
  });
});
