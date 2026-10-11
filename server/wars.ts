import { addRes } from '../shared/formulas';
import { bus } from './bus';
import { notifyPlayer } from './messages';
import { GameError, uid, type Alliance, type War, type World } from './world';

const HOUR = 3_600_000;

/**
 * Scored alliance wars. A war runs for a fixed time window; each side scores for the value of the enemy's units destroyed in battles
 * between the two alliances and for every system it holds. The higher score at the end wins.
 */
export const WAR = {
  /** both alliances need this many members to fight a war */
  minMembers: 2,
  /** one point for every this much resource value of enemy units destroyed */
  valuePerPoint: 1000,
  /** points an alliance earns per held system per hour */
  heldPerHour: 15,
  /** the winner takes this share of what the loser's side lost, into the alliance bank */
  lootShare: 0.25,
  lootCap: 5_000_000,
  /** Command Credits shared among the winning side's fighters */
  creditPool: 400,
  creditFloor: 20,
  /** no prize unless this many points were scored by fighting (not just by holding systems), so empty wars pay nothing */
  minFightPoints: 50,
  /** hours before the same two alliances can fight again */
  rematchHours: 24,
  /** wars kept in the history */
  history: 12,
};

const tagOf = (w: World, id: string) => w.alliances[id]?.tag ?? '?';
const blankSide = () => ({ kills: 0, held: 0, by: {} as Record<string, number> });
export const activeWar = (w: World, allianceId: string | null | undefined): War | undefined =>
  allianceId ? (w.wars ?? []).find((x) => !x.endedAt && (x.aId === allianceId || x.bId === allianceId)) : undefined;
export const warScore = (s: { kills: number; held: number }) => s.kills + s.held;

function tell(w: World, a: Alliance | undefined, subject: string, body: string) {
  if (!a) return;
  a.log.push({ at: Date.now(), text: body });
  if (a.log.length > 100) a.log.shift();
  for (const m of a.members) notifyPlayer(w, m.playerId, 'alliance', subject, body);
}

export function startWar(w: World, a: Alliance, o: Alliance, now = Date.now()): War {
  if (w.config.warHours <= 0) throw new GameError('Wars are switched off on this server');
  if (a.members.length < WAR.minMembers || o.members.length < WAR.minMembers) throw new GameError(`Both alliances need at least ${WAR.minMembers} members to fight a war`);
  if (activeWar(w, a.id)) throw new GameError('Your alliance is already at war');
  if (activeWar(w, o.id)) throw new GameError(`[${o.tag}] is already at war with someone else`);
  const last = (w.wars ?? []).find((x) => x.endedAt && ((x.aId === a.id && x.bId === o.id) || (x.aId === o.id && x.bId === a.id)));
  if (last && now < last.endedAt! + WAR.rematchHours * HOUR) throw new GameError(`You fought [${o.tag}] recently; wait ${Math.ceil((last.endedAt! + WAR.rematchHours * HOUR - now) / HOUR)} more hours`);
  const war: War = { id: uid(), aId: a.id, bId: o.id, tags: { [a.id]: a.tag, [o.id]: o.tag }, startedAt: now, endsAt: now + w.config.warHours * HOUR, heldAt: now, score: { [a.id]: blankSide(), [o.id]: blankSide() } };
  (w.wars ||= []).unshift(war);
  (a.diplomacy ||= {})[o.id] = { kind: 'war', since: now, warId: war.id };
  (o.diplomacy ||= {})[a.id] = { kind: 'war', since: now, warId: war.id };
  a.proposals = a.proposals?.filter((x) => x.fromId !== o.id);
  o.proposals = o.proposals?.filter((x) => x.fromId !== a.id);
  bus.push({ to: '*', type: 'refresh' });
  return war;
}

/** Points for the units one battle destroyed. `sides` holds the human fighters on each side with the value each lost. */
export function recordBattle(w: World, attackers: { playerId: string; lost: number }[], defenders: { playerId: string; lost: number }[], now = Date.now()) {
  if (!w.wars?.length) return;
  const group = (list: typeof attackers) => {
    const by = new Map<string, { lost: number; ids: string[] }>();
    for (const x of list) {
      const al = w.players[x.playerId]?.allianceId;
      if (!al) continue;
      const g = by.get(al) ?? { lost: 0, ids: [] };
      g.lost += x.lost; g.ids.push(x.playerId);
      by.set(al, g);
    }
    return by;
  };
  const att = group(attackers), def = group(defenders);
  if (!att.size || !def.size) return;
  for (const war of w.wars) {
    if (war.endedAt || now >= war.endsAt) continue;
    for (const [mine, theirs] of [[war.aId, war.bId], [war.bId, war.aId]] as const) {
      // `mine` scores the units `theirs` lost, when the two stood on opposite sides of the battle
      for (const [x, y] of [[att, def], [def, att]] as const) {
        const me = x.get(mine), foe = y.get(theirs);
        if (!me || !foe || foe.lost <= 0) continue;
        const pts = foe.lost / WAR.valuePerPoint;
        const side = war.score[mine];
        side.kills += pts;
        for (const id of me.ids) side.by[id] = (side.by[id] ?? 0) + pts / me.ids.length;
      }
    }
  }
}

/** Systems held earn points by the hour; wars past their end are settled. */
export function processWars(w: World, now: number) {
  if (!w.wars?.length) return;
  for (const war of w.wars) {
    if (war.endedAt) continue;
    const a = w.alliances[war.aId], b = w.alliances[war.bId];
    const upTo = Math.min(now, war.endsAt);
    if (upTo > war.heldAt) {
      const hours = (upTo - war.heldAt) / HOUR;
      if (a) war.score[war.aId].held += (a.territory ?? 0) * WAR.heldPerHour * hours;
      if (b) war.score[war.bId].held += (b.territory ?? 0) * WAR.heldPerHour * hours;
      war.heldAt = upTo;
    }
    if (!a || !b) finishWar(w, war, now, 'dissolved');
    else if (now >= war.endsAt) finishWar(w, war, now, 'time');
  }
}

/** Ending the treaty during a war is a surrender: the other side wins on the spot. */
export function concedeWar(w: World, war: War, loserId: string, now = Date.now()) {
  finishWar(w, war, now, 'conceded', loserId === war.aId ? war.bId : war.aId);
}

function finishWar(w: World, war: War, now: number, how: 'time' | 'conceded' | 'dissolved', forcedWinner?: string) {
  war.endedAt = now;
  war.how = how;
  const a = w.alliances[war.aId], b = w.alliances[war.bId];
  if (a?.diplomacy?.[war.bId]?.warId === war.id) delete a.diplomacy[war.bId];
  if (b?.diplomacy?.[war.aId]?.warId === war.id) delete b.diplomacy[war.aId];
  const sa = warScore(war.score[war.aId]), sb = warScore(war.score[war.bId]);
  let winnerId: string | null = forcedWinner ?? (Math.abs(sa - sb) < 1 ? null : sa > sb ? war.aId : war.bId);
  if (how === 'dissolved') winnerId = a ? war.aId : b ? war.bId : null;
  war.winnerId = winnerId;
  const loserId = winnerId ? (winnerId === war.aId ? war.bId : war.aId) : null;
  const winner = winnerId ? w.alliances[winnerId] : undefined;
  const loser = loserId ? w.alliances[loserId] : undefined;
  const fight = winnerId ? war.score[winnerId].kills : 0;
  const line = `[${war.tags[war.aId]}] ${Math.round(sa)} - ${Math.round(sb)} [${war.tags[war.bId]}]`;

  if (how === 'dissolved') {
    tell(w, a, 'War over', `The war with [${war.tags[war.bId]}] ended: the other alliance no longer exists.`);
    tell(w, b, 'War over', `The war with [${war.tags[war.aId]}] ended: the other alliance no longer exists.`);
  } else if (!winner) {
    tell(w, a, 'War ended in a draw', `The war with [${war.tags[war.bId]}] ended level (${line}).`);
    tell(w, b, 'War ended in a draw', `The war with [${war.tags[war.aId]}] ended level (${line}).`);
  } else if (fight >= WAR.minFightPoints) {
    const lostBySide = Math.round(war.score[winnerId!].kills * WAR.valuePerPoint);
    const loot = Math.min(WAR.lootCap, Math.round(lostBySide * WAR.lootShare));
    winner.bank = addRes(winner.bank, { metal: Math.round(loot * 0.5), crystal: Math.round(loot * 0.35), deuterium: loot - Math.round(loot * 0.5) - Math.round(loot * 0.35) });
    const fighters = Object.entries(war.score[winnerId!].by).filter(([id]) => winner.members.some((m) => m.playerId === id));
    const total = fighters.reduce((s, [, v]) => s + v, 0) || 1;
    war.reward = { loot, credits: 0 };
    for (const [id, v] of fighters) {
      const c = Math.max(WAR.creditPool * (v / total) | 0, WAR.creditFloor);
      const p = w.players[id];
      if (p) { p.credits += c; war.reward.credits += c; notifyPlayer(w, id, 'alliance', 'War won', `[${winner.tag}] won the war against [${loser?.tag}] (${line}). Your share: ${c} Command Credits.`); }
    }
    tell(w, winner, 'War won', `Victory over [${loser?.tag}] (${line})${how === 'conceded' ? ' - they conceded' : ''}. ${loot.toLocaleString('en-US')} resources of spoils were added to the alliance bank.`);
    tell(w, loser, 'War lost', `[${winner.tag}] won the war (${line}).`);
  } else {
    tell(w, winner, 'War won', `[${winner.tag}] won the war against [${loser?.tag}] (${line}), but too little was fought for a prize.`);
    tell(w, loser, 'War lost', `[${winner.tag}] won the war (${line}), but too little was fought for a prize.`);
  }
  const done = w.wars!.filter((x) => x.endedAt);
  if (done.length > WAR.history) {
    const drop = new Set(done.slice(WAR.history).map((x) => x.id));
    w.wars = w.wars!.filter((x) => !drop.has(x.id));
  }
  bus.push({ to: '*', type: 'refresh' });
}

/** what the Alliance page shows: the current war and the last few */
export function warsView(w: World, a: Alliance) {
  const side = (war: War, id: string) => ({ id, tag: war.tags[id], kills: Math.round(war.score[id].kills), held: Math.round(war.score[id].held), total: Math.round(warScore(war.score[id])) });
  const shape = (war: War) => {
    const other = war.aId === a.id ? war.bId : war.aId;
    const mine = war.score[a.id];
    return {
      id: war.id, startedAt: war.startedAt, endsAt: war.endsAt, endedAt: war.endedAt ?? null, how: war.how ?? null,
      us: side(war, a.id), them: side(war, other), winner: war.winnerId === undefined ? null : war.winnerId === null ? 'draw' : war.winnerId === a.id ? 'us' : 'them',
      reward: war.reward ?? null,
      top: Object.entries(mine.by).filter(([id]) => w.players[id]).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, v]) => ({ id, username: w.players[id].username, points: Math.round(v) })),
    };
  };
  const mine = (w.wars ?? []).filter((x) => x.aId === a.id || x.bId === a.id);
  const current = mine.find((x) => !x.endedAt);
  return { current: current ? shape(current) : null, history: mine.filter((x) => x.endedAt).slice(0, 5).map(shape), rules: { hours: w.config.warHours, minMembers: WAR.minMembers, heldPerHour: WAR.heldPerHour, valuePerPoint: WAR.valuePerPoint, rematchHours: WAR.rematchHours, minFightPoints: WAR.minFightPoints, lootShare: WAR.lootShare, creditPool: WAR.creditPool } };
}
