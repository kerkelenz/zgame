import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { ALWAYS_PAGES, OBJECTIVES, checkProgress, currentObjective, openQuests, unlockedPages } from '../server/progress';
import { migratePlayer, createWorld, type Planet, type Player, type World } from '../server/world';
import { questsView } from '../server/views';
import { NAV_GROUPS } from '../client/src/nav';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player; let ap: Planet;
beforeEach(() => {
  w = createWorld({ economySpeed: 10, fleetSpeed: 100, protectionPoints: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  ap = w.planets[alice.planetIds[0]];
});

describe('the quest line', () => {
  it('has unique ids, waits only for quests that exist and has no loop', () => {
    const ids = new Set(OBJECTIVES.map((o) => o.id));
    expect(ids.size).toBe(OBJECTIVES.length);
    for (const o of OBJECTIVES) for (const a of o.after) expect(ids.has(a), `${o.id} waits for ${a}`).toBe(true);
    const seen = new Set<string>();
    const order: string[] = [];
    let rest = OBJECTIVES.slice();
    while (rest.length) {
      const next = rest.filter((o) => o.after.every((a) => seen.has(a)));
      expect(next.length, `a loop among ${rest.map((o) => o.id)}`).toBeGreaterThan(0);
      for (const o of next) { seen.add(o.id); order.push(o.id); }
      rest = rest.filter((o) => !seen.has(o.id));
    }
    expect(order.length).toBe(OBJECTIVES.length);
  });

  it('opens only real pages, and every page of the menu is open from the start or opened by a quest', () => {
    const pages = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    for (const o of OBJECTIVES) for (const p of o.unlocks) expect(pages.has(p), `${o.id} opens ${p}`).toBe(true);
    const opened = new Set([...ALWAYS_PAGES, ...OBJECTIVES.flatMap((o) => o.unlocks)]);
    for (const g of NAV_GROUPS) for (const i of g.items) if (!i.feature && !i.admin) expect(opened.has(i.id), `${i.id} is never opened`).toBe(true);
  });

  it('every quest page a quest asks the player to use is open before it', () => {
    const need: Record<string, string> = { 'q-lab': 'buildings', o5: 'research', o6: 'buildings', 'q-ships': 'shipyard', o9: 'defense', o7: 'galaxy', o8: 'galaxy', o10: 'galaxy', o11: 'fleet', 'q-trade': 'market', 'q-upgrade': 'upgrades', 'q-class': 'command', 'q-ally': 'alliance' };
    const byId = new Map(OBJECTIVES.map((o) => [o.id, o]));
    const before = (id: string, seen = new Set<string>()): Set<string> => { for (const a of byId.get(id)!.after) { if (seen.has(a)) continue; seen.add(a); for (const p of byId.get(a)!.unlocks) seen.add('page:' + p); before(a, seen); } return seen; };
    for (const [q, page] of Object.entries(need)) {
      if (ALWAYS_PAGES.includes(page)) continue;
      expect(before(q).has('page:' + page), `${q} needs ${page}`).toBe(true);
    }
  });

  it('a new commander has the basics; each finished quest adds its pages', () => {
    expect(unlockedPages(w, alice)).toEqual(ALWAYS_PAGES);
    ap.buildings = { metalMine: 8, crystalMine: 7, solarPlant: 20, researchLab: 1 };
    checkProgress(w, alice, T0);
    const pages = unlockedPages(w, alice)!;
    expect(pages).toContain('research');
    expect(pages).toContain('techtree');
    expect(pages).not.toContain('fleet');
  });

  it('opens several quests at once where they do not wait for each other', () => {
    ap.buildings = { metalMine: 8, crystalMine: 7, solarPlant: 20 };
    checkProgress(w, alice, T0);
    const open = openQuests(alice).map((o) => o.id);
    expect(open).toEqual(expect.arrayContaining(['o4', 'q-lab']));
    expect(currentObjective(alice)?.optional).toBeFalsy();
    expect(questsView(alice).filter((q) => q.open).length).toBe(open.length);
  });

  it('a side quest does not hold anything back', () => {
    const optional = OBJECTIVES.filter((o) => o.optional).map((o) => o.id);
    expect(optional.length).toBeGreaterThan(0);
    for (const o of OBJECTIVES) for (const a of o.after) expect(optional.includes(a), `${o.id} waits for the side quest ${a}`).toBe(false);
  });

  it('shows every page to a veteran and when the onboarding is off', () => {
    alice.onboarding = 'legacy';
    expect(unlockedPages(w, alice)).toBeNull();
    alice.onboarding = 'new';
    w.config.onboarding = 0;
    expect(unlockedPages(w, alice)).toBeNull();
  });

  it('an account from before the quest line keeps its pages and quests it already met are marked done without paying again', () => {
    ap.buildings = { metalMine: 9, crystalMine: 8, solarPlant: 20, deuteriumSynthesizer: 6, researchLab: 2, roboticsFactory: 3, shipyard: 2 };
    alice.techs = { energy: 2 };
    alice.onboarding = undefined;
    alice.achievements.topTen = T0;                                           // keep the rank achievement's credits out of the sum
    migratePlayer(alice);
    expect(alice.onboarding).toBe('legacy');
    const before = { ...ap.resources }, credits = alice.credits;
    w.messages.length = 0;
    checkProgress(w, alice, T0);
    for (const id of ['o1', 'o2', 'o3', 'o4', 'q-lab', 'o5', 'o6']) expect(alice.objectives[id], id).toBeTruthy();
    expect(ap.resources.metal).toBeLessThanOrEqual(before.metal + 10);      // no reward paid
    expect(alice.credits).toBe(credits);
    expect(w.messages.filter((m) => /Quest complete/.test(m.subject))).toHaveLength(0);
    expect(unlockedPages(w, alice)).toBeNull();
  });

  it('a commander who joined with the quest line is paid for every quest', () => {
    ap.buildings = { metalMine: 4, crystalMine: 4 };
    const before = ap.resources.metal;
    checkProgress(w, alice, T0);
    expect(ap.resources.metal).toBeGreaterThanOrEqual(before + 1500);
    expect(w.messages.some((m) => /Quest complete: Dig in/.test(m.subject))).toBe(true);
  });
});
