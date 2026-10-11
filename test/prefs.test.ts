import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { reportNews } from '../server/empires';
import { notifyPlayer } from '../server/messages';
import { meView } from '../server/views';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player, bob: Player, cara: Player, npc: Player, npc2: Player;
const count = (p: Player, subject: RegExp) => w.messages.filter((m) => m.to === p.id && subject.test(m.subject)).length;

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  [alice, bob, cara, npc, npc2] = ['alice', 'bobby', 'carol', 'raider_npc', 'victim_npc'].map((n) => register(w, n, 'secret1', T0).player);
  npc.npc = { status: 'aggressive', seedPoints: 1, faction: null };
  npc2.npc = { status: 'active', seedPoints: 1, faction: null };
  AL.createAlliance(w, alice, 'AAA', 'Alpha'); AL.joinAlliance(w, bob, alice.allianceId!);   // alice and bobby are allies, carol is a stranger
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

describe('no messages when something finishes', () => {
  it('skips the in-game message for finished buildings, research and production, but only when switched on', () => {
    notifyPlayer(w, alice.id, 'system', 'Construction complete', 'x');
    expect(count(alice, /Construction complete/)).toBe(1);                       // default: you hear about it
    alice.prefs = { quietCompletions: true };
    notifyPlayer(w, alice.id, 'system', 'Construction complete', 'x');
    notifyPlayer(w, alice.id, 'system', 'Research complete', 'x');
    notifyPlayer(w, alice.id, 'system', 'Production complete', 'x');
    expect(count(alice, /^(Construction|Research|Production) complete/)).toBe(1);   // still only the first one
    notifyPlayer(w, alice.id, 'system', 'Hostile fleet detected', 'x');          // everything else still arrives
    notifyPlayer(w, alice.id, 'system', 'Repairs complete', 'x');
    expect(count(alice, /Hostile fleet detected|Repairs complete/)).toBe(2);
    expect(count(bob, /complete/)).toBe(0);
  });

  it('is part of what the client reads about you', () => {
    expect(meView(w, alice, T0).prefs).toEqual({ quietCompletions: false, worldNews: false });
    alice.prefs = { quietCompletions: true, worldNews: true };
    expect(meView(w, alice, T0).prefs).toEqual({ quietCompletions: true, worldNews: true });
  });
});

describe('news about who attacks whom', () => {
  const target = () => w.planets[bob.planetIds[0]];

  it('goes to members of the defender\'s alliance, not to strangers', () => {
    expect(reportNews(w, npc, bob, target(), 'attacker', 500_000, 1000, false)).toBe(true);
    expect(count(alice, /raided/)).toBe(1);                                      // same alliance as the one attacked
    expect(count(bob, /raided/)).toBe(1);
    expect(count(cara, /raided/)).toBe(0);                                       // does not know them
  });

  it('tells nobody about an attack on a computer empire, unless world news is switched on', () => {
    const victim = w.planets[npc2.planetIds[0]];
    expect(reportNews(w, npc, npc2, victim, 'attacker', 500_000, 1000, false)).toBe(false);
    expect(w.messages.some((m) => /raided/.test(m.subject))).toBe(false);
    cara.prefs = { worldNews: true };
    expect(reportNews(w, npc, npc2, victim, 'attacker', 500_000, 1000, false)).toBe(true);
    expect(count(cara, /raided/)).toBe(1);
    expect(count(alice, /raided/)).toBe(0);
  });

  it('gives a stranger the news about commanders too when they switch it on', () => {
    cara.prefs = { worldNews: true };
    reportNews(w, npc, bob, target(), 'attacker', 500_000, 1000, false);
    expect(count(cara, /raided/)).toBe(1);
    expect(count(alice, /raided/)).toBe(1);
  });
});
