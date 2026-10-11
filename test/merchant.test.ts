import { beforeEach, describe, expect, it } from 'vitest';
import { register } from '../server/accounts';
import { merchantDeal, tradeResources } from '../server/economy';
import { createWorld, type Planet, type Player, type World } from '../server/world';
import { DEAL_FEE, TRADE_FEE, dailyDeal, tradeQuote } from '../shared/data';

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
let w: World; let a: Player; let p: Planet;

beforeEach(() => {
  w = createWorld({ economySpeed: 20, protectionPoints: 0, raidIntervalMin: 0, npcDensity: 0 }, T0);
  a = register(w, 'alice', 'secret1', T0).player;
  p = w.planets[a.planetIds[0]];
  p.resources = { metal: 1e12, crystal: 1e12, deuterium: 1e12 };
});

describe('daily merchant deal', () => {
  it('is deterministic per day, always a valid pair, and changes over time', () => {
    const seen = new Set<string>();
    for (let d = 19000; d < 19100; d++) {
      const x = dailyDeal(d), y = dailyDeal(d);
      expect(x).toEqual(y);
      expect(x.give).not.toBe(x.get);
      seen.add(`${x.give}>${x.get}`);
    }
    expect(seen.size).toBe(6);
  });

  it('charges the token fee up to the allowance, then the normal fee', () => {
    const deal = merchantDeal(w, a, T0);
    expect(deal.cap).toBe(500_000 * 20);
    const amount = deal.cap + 1_000_000;
    const out = tradeResources(w, p, deal.give, deal.get, amount, T0);
    expect(out).toBe(tradeQuote(deal.give, deal.get, deal.cap, DEAL_FEE) + tradeQuote(deal.give, deal.get, 1_000_000, TRADE_FEE));
    expect(merchantDeal(w, a, T0).left).toBe(0);
    const again = tradeResources(w, p, deal.give, deal.get, 1_000_000, T0);
    expect(again).toBe(tradeQuote(deal.give, deal.get, 1_000_000, TRADE_FEE));
  });

  it('other trades pay the normal fee and do not use the allowance', () => {
    const deal = merchantDeal(w, a, T0);
    const other = (['metal', 'crystal', 'deuterium'] as const).find((k) => k !== deal.give && k !== deal.get)!;
    tradeResources(w, p, other, deal.get, 1000, T0);
    expect(merchantDeal(w, a, T0).left).toBe(deal.cap);
  });

  it('the allowance renews every day', () => {
    const deal = merchantDeal(w, a, T0);
    tradeResources(w, p, deal.give, deal.get, deal.cap, T0);
    expect(merchantDeal(w, a, T0).left).toBe(0);
    const next = merchantDeal(w, a, (Math.floor(T0 / DAY) + 1) * DAY);
    expect(next.left).toBe(next.cap);
    expect(next.day).toBe(deal.day + 1);
  });

  it('Collectors keep their cheaper normal rate on the overflow', () => {
    a.charClass = 'collector';
    const deal = merchantDeal(w, a, T0);
    const out = tradeResources(w, p, deal.give, deal.get, deal.cap + 100_000, T0);
    expect(out).toBe(tradeQuote(deal.give, deal.get, deal.cap, DEAL_FEE) + tradeQuote(deal.give, deal.get, 100_000, 0.08));
  });
});
