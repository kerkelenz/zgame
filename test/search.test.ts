import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { SEARCH, playerNames, searchPlayers } from '../server/search';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let names: Record<string, Player>;

beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  names = {};
  for (const n of ['Stardust', 'Dusty', 'Zealoteer', 'Zeal_Two', 'Casual_Zeal', 'bob']) names[n] = register(w, n, 'secret1', T0).player;
});

describe('player search', () => {
  it('finds commanders by part of the name, ignoring case', () => {
    expect(searchPlayers(w, 'zeal').map((h) => h.username).sort()).toEqual(['Casual_Zeal', 'Zeal_Two', 'Zealoteer']);
    expect(searchPlayers(w, 'ZEALOTEER')[0]).toMatchObject({ id: names.Zealoteer.id, username: 'Zealoteer' });
  });

  it('puts exact matches first, then names that start with it, then names that contain it', () => {
    expect(searchPlayers(w, 'dust').map((h) => h.username)).toEqual(['Dusty', 'Stardust']);          // starts with, then contains
    expect(searchPlayers(w, 'zeal')[2].username).toBe('Casual_Zeal');
    names.Zealoteer.stats.battlesWon = 0;
    expect(searchPlayers(w, 'dusty')[0].username).toBe('Dusty');
  });

  it('needs at least two characters, and returns nothing for nonsense', () => {
    expect(searchPlayers(w, '')).toEqual([]);
    expect(searchPlayers(w, ' z ')).toEqual([]);
    expect(searchPlayers(w, 'qqqqq')).toEqual([]);
    expect(SEARCH.minChars).toBe(2);
  });

  it('limits the number of results, and puts stronger commanders first among equals', () => {
    for (let i = 0; i < 15; i++) register(w, `Rival${i}`, 'secret1', T0);
    expect(searchPlayers(w, 'rival')).toHaveLength(SEARCH.limit);
    const strong = w.planets[names.bob.planetIds[0]];
    strong.buildings = { metalMine: 20, crystalMine: 20 };
    const duo = register(w, 'Pair_A', 'secret1', T0).player, trio = register(w, 'Pair_B', 'secret1', T0).player;
    w.planets[trio.planetIds[0]].buildings = { metalMine: 15, solarPlant: 12 };
    expect(searchPlayers(w, 'pair_').map((h) => h.username)).toEqual(['Pair_B', 'Pair_A']);
    expect(duo.id).toBeTruthy();
  });

  it('shows the alliance tag, and finds members by tag', () => {
    AL.createAlliance(w, names.bob, 'TEAM', 'The Team');
    expect(searchPlayers(w, 'bob')[0]).toMatchObject({ username: 'bob', alliance: 'TEAM' });
    expect(searchPlayers(w, '[team]').map((h) => h.username)).toEqual(['bob']);
  });

  it('leaves out banned accounts and commanders without a planet, but includes computer empires', () => {
    names.Dusty.banned = { until: null, reason: 'test' };
    expect(searchPlayers(w, 'dusty')).toEqual([]);
    const npc = register(w, 'Emperor_Zog', 'secret1', T0).player;
    npc.npc = { status: 'active', seedPoints: 1, faction: null };
    expect(searchPlayers(w, 'zog')[0]).toMatchObject({ username: 'Emperor_Zog', npc: 'active' });
    npc.planetIds = [];
    expect(searchPlayers(w, 'zog')).toEqual([]);
  });
});

describe('the name list behind the links in messages', () => {
  it('lists every commander and computer empire that has a profile, by name, without banned accounts', () => {
    names.Dusty.banned = { until: null, reason: 'test' };
    const npc = register(w, 'Emperor_Zog', 'secret1', T0).player;
    npc.npc = { status: 'active', seedPoints: 1, faction: null };
    const list = playerNames(w);
    expect(list.map((x) => x.name)).toEqual([...list.map((x) => x.name)].sort((a, b) => a.localeCompare(b)));
    expect(list.find((x) => x.name === 'Zealoteer')).toEqual({ id: names.Zealoteer.id, name: 'Zealoteer' });
    expect(list.some((x) => x.name === 'Emperor_Zog')).toBe(true);
    expect(list.some((x) => x.name === 'Dusty')).toBe(false);
    npc.planetIds = [];
    expect(playerNames(w).some((x) => x.name === 'Emperor_Zog')).toBe(false);
  });
});
