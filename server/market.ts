import { TRADE_VALUE, resName } from '../shared/data';
import { bus } from './bus';
import { planetProduction, updatePlanet } from './economy';
import { notifyPlayer } from './messages';
import { assertActive } from './vacation';
import { GameError, uid, type Planet, type Player, type World } from './world';

const HOUR = 3_600_000;
type ResKey = keyof typeof TRADE_VALUE;
const KEYS = Object.keys(TRADE_VALUE) as ResKey[];

/**
 * The player market: commanders offer a pile of one resource for a pile of another and anyone can take the offer whole. What is offered is
 * held back from the planet while the offer stands (escrow), so a sale is always covered. The asking price must stay near the fair rate of the
 * merchant (so the market cannot be used to hand resources to another account for nothing); the market keeps a fee from what the buyer
 * receives, except on offers to your own alliance. Offers expire and come back to their planet.
 */
export const MARKET = {
  /** the asking price, as a share of the fair rate, may not go outside this band */
  minRate: 0.8, maxRate: 1.25,
  minAmount: 1000, maxAmount: 100_000_000,
  /** the most a commander can gain in a day from offers priced below the fair rate: this many hours of the paying planet's production, never less than the floor (times the square root of the economy speed) */
  bargainHours: 3, bargainFloor: 40_000,
};

export interface MarketOffer {
  id: string;
  sellerId: string;
  /** the planet the goods were taken from, and where the payment arrives */
  planetId: string;
  give: ResKey; giveAmount: number;
  want: ResKey; wantAmount: number;
  createdAt: number; expiresAt: number;
  /** 'alliance' offers can only be seen and taken by members of the seller's alliance, and carry no fee */
  scope: 'all' | 'alliance';
  allianceId?: string;
}

const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
const offers = (w: World) => (w.market ??= []);
const value = (k: ResKey, n: number) => n * TRADE_VALUE[k];

/** the asking price against the fair rate: 1 is fair, above 1 asks more than the merchant would give */
export const askRate = (give: ResKey, giveAmount: number, want: ResKey, wantAmount: number) => value(want, wantAmount) / Math.max(1, value(give, giveAmount));

const fee = (w: World, o: MarketOffer) => (o.scope === 'alliance' ? 0 : Math.max(0, Math.min(50, w.config.marketFeePercent)) / 100);
/** what the buyer actually receives */
export const received = (w: World, o: MarketOffer) => Math.floor(o.giveAmount * (1 - fee(w, o)));

/** where goods go back to (or payment lands): the planet they came from, or the seller's first world when it is gone */
function landing(w: World, o: MarketOffer): Planet | undefined {
  const own = w.planets[o.planetId];
  if (own && own.ownerId === o.sellerId) return own;
  const seller = w.players[o.sellerId];
  return seller ? w.planets[seller.planetIds[0]] : undefined;
}

function visibleTo(w: World, o: MarketOffer, p: Player): boolean {
  return o.scope === 'all' || (!!p.allianceId && p.allianceId === o.allianceId);
}

export function marketView(w: World, p: Player, now: number) {
  const open = offers(w).filter((o) => o.expiresAt > now);
  const row = (o: MarketOffer) => {
    const seller = w.players[o.sellerId];
    return {
      id: o.id, seller: seller?.username ?? 'Unknown', sellerId: o.sellerId, mine: o.sellerId === p.id,
      give: o.give, giveAmount: o.giveAmount, want: o.want, wantAmount: o.wantAmount, receive: received(w, o),
      rate: Math.round(askRate(o.give, o.giveAmount, o.want, o.wantAmount) * 100) / 100,
      scope: o.scope, expiresAt: o.expiresAt, createdAt: o.createdAt,
    };
  };
  return {
    enabled: w.config.marketHours > 0,
    feePercent: w.config.marketFeePercent, hours: w.config.marketHours, maxOffers: w.config.marketMaxOffers,
    band: { min: MARKET.minRate, max: MARKET.maxRate }, minAmount: MARKET.minAmount,
    values: TRADE_VALUE,
    inAlliance: !!p.allianceId,
    offers: open.filter((o) => o.sellerId !== p.id && visibleTo(w, o, p)).sort((a, b) => askRate(a.give, a.giveAmount, a.want, a.wantAmount) - askRate(b.give, b.giveAmount, b.want, b.wantAmount)).map(row),
    mine: open.filter((o) => o.sellerId === p.id).sort((a, b) => a.expiresAt - b.expiresAt).map(row),
  };
}

export function listOffer(w: World, p: Player, planet: Planet, i: { give: string; giveAmount: number; want: string; wantAmount: number; scope?: string }, now: number): MarketOffer {
  if (w.config.marketHours <= 0) throw new GameError('The market is switched off on this server');
  assertActive(p, 'market');
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  if (!KEYS.includes(i.give as ResKey) || !KEYS.includes(i.want as ResKey)) throw new GameError('Unknown resource');
  if (i.give === i.want) throw new GameError('Offer one resource for a different one');
  const give = i.give as ResKey, want = i.want as ResKey;
  const giveAmount = Math.floor(Number(i.giveAmount)), wantAmount = Math.floor(Number(i.wantAmount));
  if (!(giveAmount >= MARKET.minAmount) || !(wantAmount >= 1)) throw new GameError(`Offer at least ${fmtN(MARKET.minAmount)} and ask for something in return`);
  if (giveAmount > MARKET.maxAmount || wantAmount > MARKET.maxAmount * 4) throw new GameError('That is too much for one offer');
  const rate = askRate(give, giveAmount, want, wantAmount);
  if (rate < MARKET.minRate) throw new GameError(`You are asking too little: at least ${Math.round(MARKET.minRate * 100)}% of the fair rate (the market is not for giving things away)`);
  if (rate > MARKET.maxRate) throw new GameError(`You are asking too much: at most ${Math.round(MARKET.maxRate * 100)}% of the fair rate, or nobody will take it`);
  const scope = i.scope === 'alliance' ? 'alliance' : 'all';
  if (scope === 'alliance' && !p.allianceId) throw new GameError('Join an alliance to offer to your alliance');
  if (offers(w).filter((o) => o.sellerId === p.id && o.expiresAt > now).length >= w.config.marketMaxOffers) throw new GameError(`You can have ${w.config.marketMaxOffers} open offers; cancel one first`);
  updatePlanet(w, planet, now);
  if (planet.resources[give] < giveAmount) throw new GameError(`Not enough ${resName(give)} on ${planet.name}`);
  planet.resources[give] -= giveAmount;                           // escrow
  const o: MarketOffer = { id: uid(), sellerId: p.id, planetId: planet.id, give, giveAmount, want, wantAmount, createdAt: now, expiresAt: now + w.config.marketHours * HOUR, scope, allianceId: scope === 'alliance' ? p.allianceId ?? undefined : undefined };
  offers(w).push(o);
  p.stats.marketDeals = (p.stats.marketDeals ?? 0) + 1;
  bus.push({ to: '*', type: 'refresh' });
  return o;
}

function giveBack(w: World, o: MarketOffer, now: number): void {
  const home = landing(w, o);
  if (home) { updatePlanet(w, home, now); home.resources[o.give] += o.giveAmount; }
}

export function cancelOffer(w: World, p: Player, id: string, now: number): void {
  const list = offers(w);
  const o = list.find((x) => x.id === id);
  if (!o || o.sellerId !== p.id) throw new GameError('No such offer', 404);
  list.splice(list.indexOf(o), 1);
  giveBack(w, o, now);
  bus.push({ to: '*', type: 'refresh' });
}

export function buyOffer(w: World, p: Player, planet: Planet, id: string, now: number): { got: number; paid: number; res: ResKey; paidRes: ResKey } {
  assertActive(p, 'market');
  if (planet.ownerId !== p.id) throw new GameError('Not your planet', 403);
  const list = offers(w);
  const o = list.find((x) => x.id === id && x.expiresAt > now);
  if (!o) throw new GameError('That offer is gone', 404);
  if (o.sellerId === p.id) throw new GameError('That is your own offer: cancel it instead');
  if (!visibleTo(w, o, p)) throw new GameError('That offer is for an alliance you are not in', 403);
  updatePlanet(w, planet, now);
  if (planet.resources[o.want] < o.wantAmount) throw new GameError(`Not enough ${resName(o.want)} on ${planet.name}: the offer costs ${fmtN(o.wantAmount)}`);
  const seller = w.players[o.sellerId];
  const home = landing(w, o);
  if (!seller || !home) { list.splice(list.indexOf(o), 1); throw new GameError('The seller is gone; the offer was removed'); }
  const got = received(w, o);
  // a cheap offer is a bargain for the buyer; how much bargain one commander can take in a day is limited, so the market cannot be used to feed resources to another account
  const surplus = Math.max(0, value(o.give, got) - value(o.want, o.wantAmount));
  if (surplus > 0) {
    const day = Math.floor(now / 86_400_000);
    const b = p.bargains && p.bargains.day === day ? p.bargains : { day, value: 0 };
    const prod = planetProduction(w, planet);
    const cap = Math.max(MARKET.bargainFloor * Math.sqrt(Math.max(1, w.config.economySpeed)), MARKET.bargainHours * KEYS.reduce((t, k) => t + Math.max(0, prod[k]) * TRADE_VALUE[k], 0));
    if (b.value + surplus > cap) throw new GameError(`That offer is too cheap: you can take about ${fmtN(cap)} of bargains a day (${MARKET.bargainHours} hours of this planet's production) and have taken ${fmtN(b.value)}. Pick an offer closer to the fair price, or come back tomorrow.`);
    p.bargains = { day, value: b.value + surplus };
  }
  list.splice(list.indexOf(o), 1);
  planet.resources[o.want] -= o.wantAmount;
  planet.resources[o.give] += got;
  updatePlanet(w, home, now);
  home.resources[o.want] += o.wantAmount;
  p.stats.marketDeals = (p.stats.marketDeals ?? 0) + 1;
  notifyPlayer(w, seller.id, 'transport', 'Market: your offer was taken', `${p.username} took your offer: you sold ${fmtN(o.giveAmount)} ${resName(o.give)} and received ${fmtN(o.wantAmount)} ${resName(o.want)} on ${home.name}.`);
  bus.push({ to: '*', type: 'refresh' });
  return { got, paid: o.wantAmount, res: o.give, paidRes: o.want };
}

/** Runs about once a minute: offers whose time is up return to their planet */
export function processMarket(w: World, now: number): void {
  const list = w.market;
  if (!list?.length) return;
  const gone = list.filter((o) => o.expiresAt <= now);
  if (!gone.length) return;
  w.market = list.filter((o) => o.expiresAt > now);
  for (const o of gone) {
    giveBack(w, o, now);
    if (w.players[o.sellerId]) notifyPlayer(w, o.sellerId, 'transport', 'Market: offer expired', `Nobody took your offer of ${fmtN(o.giveAmount)} ${resName(o.give)} for ${fmtN(o.wantAmount)} ${resName(o.want)}. The goods are back on your planet.`);
  }
}
