import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { processPlayer, queueBuilding, queueResearch } from '../server/economy';
import { IDLE, checkIdle } from '../server/idle';
import { resetLimits, setSender } from '../server/external';
import { createWorld, type Player, type Planet, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const DISCORD = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789-_ABCD';
let w: World; let alice: Player; let ap: Planet; let sent: string[] = [];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetLimits();
  sent = [];
  setSender(async (_url, init) => { sent.push(JSON.parse(init.body).content as string); return { ok: true, status: 204 }; });
  w = createWorld({ economySpeed: 1000, raidIntervalMin: 0, npcDensity: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  alice.notify.discord = DISCORD;
  alice.notify.onlyWhenAway = false;
  ap = w.planets[alice.planetIds[0]];
  ap.resources = { metal: 1e9, crystal: 1e9, deuterium: 1e9 };
});
afterEach(() => setSender(null));

describe('queues running dry', () => {
  it('tells the player once when the building queue has been empty for half an hour', async () => {
    queueBuilding(w, alice, ap, 'metalMine', T0);
    processPlayer(w, alice, T0 + 60 * MIN);                       // done long ago, nothing behind it
    expect(ap.idleSince).toBeDefined();
    checkIdle(w, ap.idleSince! + (IDLE.minutes - 1) * MIN); await flush();
    expect(sent).toHaveLength(0);                                 // not yet
    checkIdle(w, ap.idleSince! + IDLE.minutes * MIN); await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/Buildings idle[\s\S]*Homeworld/);
    checkIdle(w, ap.idleSince! + 90 * MIN); await flush();
    expect(sent).toHaveLength(1);                                 // once per time it runs dry
  });

  it('starts counting again after something is queued and finishes', async () => {
    queueBuilding(w, alice, ap, 'metalMine', T0);
    processPlayer(w, alice, T0 + 60 * MIN);
    const first = ap.idleSince!;
    checkIdle(w, first + 40 * MIN); await flush();
    queueBuilding(w, alice, ap, 'solarPlant', first + 41 * MIN);
    expect(ap.idleSince).toBeUndefined();
    expect(ap.idleAlerted).toBe(false);
    processPlayer(w, alice, first + 200 * MIN);
    expect(ap.idleSince).toBeGreaterThan(first);
    checkIdle(w, ap.idleSince! + 31 * MIN); await flush();
    expect(sent).toHaveLength(2);
  });

  it('never alerts a queue that is busy, a fresh account, or a player on vacation or with the alert off', async () => {
    checkIdle(w, T0 + 500 * MIN); await flush();
    expect(sent).toHaveLength(0);                                 // a new planet has never run dry
    queueBuilding(w, alice, ap, 'metalMine', T0);
    processPlayer(w, alice, T0 + 60 * MIN);
    alice.notify.events.idle = false;
    checkIdle(w, ap.idleSince! + 60 * MIN); await flush();
    expect(sent).toHaveLength(0);
    alice.notify.events.idle = true; ap.idleAlerted = false;
    alice.vacation = { since: T0, minUntil: T0 + 1 };
    checkIdle(w, ap.idleSince! + 60 * MIN); await flush();
    expect(sent).toHaveLength(0);
  });

  it('also watches research, once a lab exists', async () => {
    ap.buildings = { ...ap.buildings, researchLab: 3 };
    queueResearch(w, alice, ap, 'energy', T0);
    processPlayer(w, alice, T0 + 120 * MIN);
    expect(alice.researchIdleSince).toBeDefined();
    checkIdle(w, alice.researchIdleSince! + IDLE.minutes * MIN); await flush();
    expect(sent.some((s) => /Research idle/.test(s))).toBe(true);
    const n = sent.length;
    checkIdle(w, alice.researchIdleSince! + 100 * MIN); await flush();
    expect(sent.length).toBe(n);
  });
});
