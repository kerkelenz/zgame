import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { allianceEvent } from '../server/allianceLog';
import { createAlliance, joinAlliance, requestHelp } from '../server/alliance';
import { spawnRaid } from '../server/npc';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player, bob: Player, carol: Player;
beforeEach(() => {
  w = createWorld({ npcDensity: 0, protectionPoints: 0, raidIntervalMin: 0 }, T0 - 30 * 86_400_000);
  alice = register(w, 'alice', 'secret1', T0 - 30 * 86_400_000).player;
  bob = register(w, 'bobby', 'secret2', T0 - 30 * 86_400_000).player;
  carol = register(w, 'carol', 'secret3', T0 - 30 * 86_400_000).player;
  createAlliance(w, alice, 'ABC', 'Alpha');
  w.alliances[alice.allianceId!].open = true;
  joinAlliance(w, bob, alice.allianceId!, '');
});
const log = () => w.alliances[alice.allianceId!].log;

describe('the alliance feed', () => {
  it('keeps typed lines about members, ignores players without an alliance and repeats within a minute', () => {
    allianceEvent(w, bob.id, 'build', 'bobby built a Shipyard.', T0);
    allianceEvent(w, bob.id, 'build', 'bobby built a Shipyard.', T0 + 5_000);
    allianceEvent(w, carol.id, 'build', 'carol built something.', T0);
    const mine = log().filter((l) => l.kind === 'build');
    expect(mine).toHaveLength(1);
    expect(mine[0].by).toBe(bob.id);
  });
  it('shows a raid on a member', () => {
    const m = spawnRaid(w, T0, () => 0.3, { targetPlayerId: bob.id });
    expect(m).not.toBeNull();
    expect(log().some((l) => l.kind === 'raid' && /bobby/.test(l.text))).toBe(true);
  });
  it('lets a member under attack ask the alliance for help, once, and tells the others', () => {
    const m = spawnRaid(w, T0, () => 0.3, { targetPlayerId: bob.id })!;
    const before = w.messages.filter((x) => x.to === alice.id).length;
    requestHelp(w, bob, m.id, T0 + 60_000);
    expect(m.helpAsked).toBe(true);
    expect(log().some((l) => l.kind === 'help')).toBe(true);
    const got = w.messages.filter((x) => x.to === alice.id);
    expect(got.length).toBe(before + 1);
    expect(got[got.length - 1].subject).toMatch(/^Ally under raid! bobby asks for help/);
    expect(() => requestHelp(w, bob, m.id, T0 + 70_000)).toThrow(/already asked/);
  });
  it('refuses help for a fleet that is not heading for you, or when you have no alliance', () => {
    const m = spawnRaid(w, T0, () => 0.3, { targetPlayerId: bob.id })!;
    expect(() => requestHelp(w, alice, m.id, T0)).toThrow(/No hostile fleet/);
    expect(() => requestHelp(w, carol, m.id, T0)).toThrow(/not in an alliance/);
    expect(() => requestHelp(w, bob, 'nope', T0)).toThrow(/No hostile fleet/);
  });
});
