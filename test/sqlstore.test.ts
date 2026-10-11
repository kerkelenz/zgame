import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { SqlStore } from '../server/sqlstore';
import { notifyPlayer } from '../server/messages';
import { createWorld, type World } from '../server/world';

const T0 = 1_700_000_000_000;
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sf-sql-')); dirs.push(d); return join(d, 'world.sqlite'); };
const stores: SqlStore[] = [];
const open = (file: string) => { const s = new SqlStore(file); stores.push(s); return s; };
afterEach(() => {
  for (const s of stores.splice(0)) { try { s.close(); } catch { /* already closed */ } }
  for (const d of dirs.splice(0)) { try { rmSync(d.replace(/world\.sqlite$/, ''), { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp dir is cleaned by the OS */ } }
});
const byId = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => (x.id < y.id ? -1 : 1));

function populated(): World {
  const w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0.1 }, T0);
  const a = register(w, 'alice', 'secret1', T0).player;
  const b = register(w, 'bobby', 'secret2', T0).player;
  AL.createAlliance(w, a, 'TEAM', 'The Team');
  AL.joinAlliance(w, b, a.allianceId!);
  w.debris['1:2:3'] = { metal: 5, crystal: 6 };
  notifyPlayer(w, a.id, 'system', 'Hello', 'world');
  w.chat.push({ id: 'c1', channel: 'global', from: 'alice', text: 'hi', at: T0 });
  return w;
}

describe('sqlite store', () => {
  it('round-trips a whole universe', () => {
    const file = tmp();
    const w = populated();
    const s = open(file);
    expect(s.isEmpty()).toBe(true);
    s.save(w);
    s.close();
    const back = open(file).load();
    expect(back.players).toEqual(w.players);
    expect(back.planets).toEqual(w.planets);
    expect(back.alliances).toEqual(w.alliances);
    expect(byId(back.messages)).toEqual(byId(w.messages));
    expect(back.chat).toEqual(w.chat);
    expect(back.debris).toEqual(w.debris);
    expect(back.config).toEqual(w.config);
    expect(back.rngSeed).toBe(w.rngSeed);
    expect(back.sessions).toEqual(w.sessions);
  });

  it('only writes what changed', () => {
    const w = populated();
    const s = open(tmp());
    const first = s.save(w);
    expect(first.written).toBe(first.total);
    expect(s.save(w)).toMatchObject({ written: 0, deleted: 0 });
    const planet = Object.values(w.planets)[0];
    planet.resources.metal += 1;
    expect(s.save(w)).toMatchObject({ written: 1, deleted: 0 });
    notifyPlayer(w, Object.keys(w.players)[0], 'system', 'Second', 'x');
    expect(s.save(w)).toMatchObject({ written: 1, deleted: 0 });
  });

  it('deletes rows that disappeared and keeps the file consistent after a reload', () => {
    const file = tmp();
    const w = populated();
    const s = open(file);
    s.save(w);
    const victim = Object.values(w.planets).find((p) => !w.players[p.ownerId].npc)!;
    delete w.planets[victim.id];
    const msgs = w.messages.length;
    w.messages.length = 0;
    expect(s.save(w).deleted).toBe(1 + msgs); // the planet and every message
    s.close();
    const back = open(file).load();
    expect(back.planets[victim.id]).toBeUndefined();
    expect(back.messages).toEqual([]);
  });

  it('a reloaded store keeps skipping unchanged rows and migrates old players', () => {
    const file = tmp();
    const w = populated();
    const s1 = open(file);
    s1.save(w);
    s1.close();
    const s2 = open(file);
    const loaded = s2.load({ economySpeed: 99 });
    expect(loaded.config.economySpeed).toBe(99); // overrides win
    expect(s2.save({ ...loaded, config: w.config })).toMatchObject({ written: 0, deleted: 0 });
  });

  it('keeps messages in time order across a reload', () => {
    const file = tmp();
    const w = populated();
    const pid = Object.values(w.players).find((p) => !p.npc)!.id;
    w.messages.length = 0;
    for (let i = 0; i < 5; i++) w.messages.push({ id: 'm' + (9 - i), to: pid, from: null, kind: 'system', subject: 's' + i, body: '', at: T0 + i, read: false });
    const s = open(file);
    s.save(w);
    expect(open(file).load().messages.map((m) => m.subject)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });
});
