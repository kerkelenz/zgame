import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { editProfile, profileView } from '../server/profile';
import { avatarGallery, isAvatar } from '../shared/profile';
import { createWorld, type Player, type World } from '../server/world';

const T0 = 1_700_000_000_000;
let w: World; let alice: Player; let bob: Player;
beforeEach(() => {
  w = createWorld({ npcDensity: 0, raidIntervalMin: 0 }, T0);
  alice = register(w, 'alice', 'secret1', T0).player;
  bob = register(w, 'bob', 'secret1', T0).player;
  alice.achievements = { firstBlood: T0, explorer: T0 + 1, colonist: T0 + 2 };
});

describe('the public profile: picture, pinned achievements, featured world', () => {
  it('the gallery has ships, defenses, planets and moons, and only those are accepted', () => {
    const g = avatarGallery();
    for (const kind of ['ship', 'defense', 'planet', 'moon']) expect(g.some((a) => a.kind === kind), kind).toBe(true);
    expect(isAvatar('ship:battleship')).toBe(true);
    expect(isAvatar('ship:nothing')).toBe(false);
    expect(isAvatar('http://evil.example/x.png')).toBe(false);
  });

  it('a commander picks a picture, pins earned achievements in order and features one of their worlds', () => {
    const home = w.planets[alice.planetIds[0]];
    editProfile(w, alice, { avatar: 'ship:battleship', pinned: ['explorer', 'firstBlood'], featured: home.id });
    const v = profileView(w, alice.id, T0);
    expect(v.avatar).toBe('ship:battleship');
    expect(v.pinned).toEqual(['explorer', 'firstBlood']);
    expect(v.featured).toMatchObject({ id: home.id, name: home.name, coords: home.coords });
    expect(v.featured!.look).toBeTruthy();
    expect(profileView(w, bob.id, T0)).toMatchObject({ avatar: null, pinned: [], featured: null });
  });

  it('refuses a made-up picture, unearned or too many pins, and someone else\'s world', () => {
    expect(() => editProfile(w, alice, { avatar: 'planet:../../etc' })).toThrow(/Unknown picture/);
    expect(() => editProfile(w, alice, { pinned: ['warlord'] })).toThrow(/earned/);
    alice.achievements = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => [k, T0]));
    expect(() => editProfile(w, alice, { pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })).toThrow(/up to 6/);
    expect(() => editProfile(w, alice, { featured: bob.planetIds[0] })).toThrow(/own worlds/);
  });

  it('only earned achievements show as pinned, and a world given away stops being featured', () => {
    const home = w.planets[alice.planetIds[0]];
    editProfile(w, alice, { pinned: ['firstBlood'], featured: home.id });
    delete alice.achievements.firstBlood;
    home.ownerId = bob.id;
    const v = profileView(w, alice.id, T0);
    expect(v.pinned).toEqual([]);
    expect(v.featured).toBeNull();
  });

  it('clearing the picture and the featured world works', () => {
    editProfile(w, alice, { avatar: 'ship:battleship', featured: alice.planetIds[0] });
    editProfile(w, alice, { avatar: null, featured: null });
    expect(profileView(w, alice.id, T0)).toMatchObject({ avatar: null, featured: null });
  });
});
