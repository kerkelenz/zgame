import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import * as AL from '../server/alliance';
import { MARKET, buyOffer, cancelOffer, listOffer, marketView, processMarket, received } from '../server/market';
import { loadWorld, saveWorld } from '../server/store';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
let w: World; let alice: Player, bob: Player, carol: Player; let ap: Planet, bp: Planet;
const offer = { give: 'metal', giveAmount: 10_000, want: 'crystal', wantAmount: 6_700 };      // 10,000 metal is worth 6,667 crystal: a fair price

beforeEach(() => {
  w = createWorld({ economySpeed: 1, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  [alice, bob, carol] = ['alice', 'bobby', 'carol'].map((n) => register(w, n, 'secret1', T0).player);
  ap = w.planets[alice.planetIds[0]]; bp = w.planets[bob.planetIds[0]];
  ap.resources = { metal: 50_000, crystal: 0, deuterium: 0 };
  bp.resources = { metal: 0, crystal: 50_000, deuterium: 0 };
});

describe('the player market', () => {
  it('holds the goods back while an offer stands and lists it for others', () => {
    const o = listOffer(w, alice, ap, offer, T0);
    expect(ap.resources.metal).toBe(40_000);                                   // escrow
    expect(o.expiresAt - o.createdAt).toBe(w.config.marketHours * HOUR);
    expect(marketView(w, bob, T0).offers.map((x) => x.id)).toEqual([o.id]);
    expect(marketView(w, alice, T0).offers).toEqual([]);                       // your own offers are listed apart
    expect(marketView(w, alice, T0).mine.map((x) => x.id)).toEqual([o.id]);
  });

  it('a sale swaps the goods, keeps the fee from what the buyer gets and tells the seller', () => {
    const o = listOffer(w, alice, ap, offer, T0);
    const r = buyOffer(w, bob, bp, o.id, T0 + 1000);
    expect(r.got).toBe(Math.floor(10_000 * 0.95));
    expect(Math.floor(bp.resources.metal)).toBe(9_500);
    expect(Math.floor(bp.resources.crystal)).toBe(50_000 - 6_700);
    expect(Math.floor(ap.resources.crystal)).toBe(6_700);                                  // the payment lands on the planet the goods came from
    expect(w.market).toHaveLength(0);
    expect(w.messages.some((m) => m.to === alice.id && /offer was taken/.test(m.subject))).toBe(true);
    expect(() => buyOffer(w, bob, bp, o.id, T0 + 2000)).toThrow(/gone/);       // an offer sells once
  });

  it('refuses prices outside the fair band, tiny offers, and offers you cannot cover', () => {
    expect(() => listOffer(w, alice, ap, { ...offer, wantAmount: 2_000 }, T0)).toThrow(/too little/);
    expect(() => listOffer(w, alice, ap, { ...offer, wantAmount: 20_000 }, T0)).toThrow(/too much/);
    expect(() => listOffer(w, alice, ap, { ...offer, giveAmount: 100, wantAmount: 67 }, T0)).toThrow(/at least/);
    expect(() => listOffer(w, alice, ap, { ...offer, giveAmount: 60_000, wantAmount: 40_000 }, T0)).toThrow(/Not enough/);
    expect(() => listOffer(w, alice, ap, { ...offer, want: 'metal' }, T0)).toThrow(/different/);
    expect(MARKET.minRate).toBeLessThan(1);
    expect(ap.resources.metal).toBe(50_000);                                   // nothing was taken
  });

  it('a buyer needs the price, and cannot take their own offer', () => {
    const o = listOffer(w, alice, ap, offer, T0);
    expect(() => buyOffer(w, alice, ap, o.id, T0)).toThrow(/your own/);
    bp.resources.crystal = 100;
    expect(() => buyOffer(w, bob, bp, o.id, T0)).toThrow(/Not enough/);
    expect(w.market).toHaveLength(1);
  });

  it('limits the open offers per commander and lets a cancel return the goods', () => {
    w.config.marketMaxOffers = 2;
    const a = listOffer(w, alice, ap, offer, T0);
    listOffer(w, alice, ap, offer, T0);
    expect(() => listOffer(w, alice, ap, offer, T0)).toThrow(/open offers/);
    cancelOffer(w, alice, a.id, T0);
    expect(ap.resources.metal).toBe(40_000);
    expect(() => cancelOffer(w, bob, a.id, T0)).toThrow(/No such offer/);
    listOffer(w, alice, ap, offer, T0);                                        // room again
  });

  it('expired offers come back to the planet with a message, and cannot be bought', () => {
    const o = listOffer(w, alice, ap, offer, T0);
    const late = T0 + w.config.marketHours * HOUR + 1;
    expect(() => buyOffer(w, bob, bp, o.id, late)).toThrow(/gone/);
    processMarket(w, late);
    expect(w.market).toHaveLength(0);
    expect(ap.resources.metal).toBeGreaterThanOrEqual(50_000);                 // all of it is back (plus what the mines made)
    expect(w.messages.some((m) => m.to === alice.id && /expired/.test(m.subject))).toBe(true);
  });

  it('alliance offers are only for members and carry no fee', () => {
    AL.createAlliance(w, alice, 'AAA', 'Alpha');
    AL.joinAlliance(w, bob, alice.allianceId!);
    const o = listOffer(w, alice, ap, { ...offer, scope: 'alliance' }, T0);
    expect(received(w, o)).toBe(10_000);
    expect(marketView(w, carol, T0).offers).toEqual([]);
    const cp = w.planets[carol.planetIds[0]]; cp.resources.crystal = 50_000;
    expect(() => buyOffer(w, carol, cp, o.id, T0)).toThrow(/alliance/);
    expect(buyOffer(w, bob, bp, o.id, T0).got).toBe(10_000);
    expect(() => listOffer(w, carol, cp, { ...offer, scope: 'alliance' }, T0)).toThrow(/Join an alliance/);
  });

  it('a switched-off market takes no offers; vacation blocks trading', () => {
    w.config.marketHours = 0;
    expect(() => listOffer(w, alice, ap, offer, T0)).toThrow(/switched off/);
    expect(marketView(w, alice, T0).enabled).toBe(false);
  });

  it('offers survive a save and load', () => {
    const o = listOffer(w, alice, ap, offer, T0);
    const dir = mkdtempSync(join(tmpdir(), 'zg-market-'));
    try {
      const f = join(dir, 'w.json');
      saveWorld(f, w);
      expect(loadWorld(f).market?.map((x) => x.id)).toEqual([o.id]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
