import { canAfford, buildingCost, buildingTime, lvl, researchTime, techCost } from '../../../shared/formulas';
import type { BuildingId, Res, TechId } from '../../../shared/types';
import { useGame } from '../game';
import { fmtDur } from '../ui';
import { affordWait } from '../afford';

export type Kind = 'building' | 'tech' | 'ship' | 'defense';

/** What the Buildings, Research, Shipyard and Defense pages share: the selected planet's queues and timers, what you have, and the time factors that apply. */
export function useItems() {
  const { me, planet, act, live, now, toast } = useGame();
  // a cancel or removal can be taken back for a few seconds: Undo puts the same thing in again (a running job starts over from the beginning)
  const withUndo = async (doIt: () => Promise<unknown>, text: string, undo: () => Promise<unknown>) => {
    const r = await act(doIt);
    if (r !== undefined) toast(text, 'info', { label: 'Undo', run: () => void act(undo, 'Restored') });
  };
  const cfg = me.config;
  const techs = me.player.techs;
  const have = { metal: live.metal, crystal: live.crystal, deuterium: live.deuterium };
  // for a card that cannot be paid yet: when it can, at this planet's production
  const hint = (cost: Res, missing: unknown[]) => {
    if (missing.length || canAfford(have, cost)) return null;
    const w = affordWait(cost, have, planet.production, planet.capacity);
    return <div className="muted small">{w.ms === null ? (w.why === 'storage' ? 'Does not fit the storage: build more first' : 'A missing resource has no income here') : <>Affordable in {fmtDur(w.ms)}</>}</div>;
  };

  // the Chief Engineer shortens every timer; the server applies the same factor
  const timeFactor = planet.detail.timeFactor as number;
  const researchFactor = planet.detail.researchFactor as number; // Discoverer: research only
  const robotics = lvl(planet.buildings, 'roboticsFactory');
  const nanite = lvl(planet.buildings, 'naniteFactory');
  const shipyard = lvl(planet.buildings, 'shipyard');
  const lab = lvl(planet.buildings, 'researchLab');

  const buildQ = planet.buildQueue;
  const researchQ = me.player.research;
  const bBacklog: string[] = planet.buildBacklog ?? [];
  const rBacklog: { id: string }[] = me.player.researchBacklog ?? [];
  const MAXQ = 4;

  // how long the whole queue takes: the running job's time left plus every queued job, worked out at today's levels (a queued Robotics Factory or Lab
  // would shorten the ones behind it, so the total is an estimate)
  const seenB: Record<string, number> = buildQ ? { [buildQ.id]: 1 } : {};
  const bTimes = bBacklog.map((id) => {
    const level = lvl(planet.buildings, id as BuildingId) + (seenB[id] ?? 0) + 1;
    seenB[id] = (seenB[id] ?? 0) + 1;
    return buildingTime(buildingCost(id as BuildingId, level), robotics, nanite, cfg.economySpeed * cfg.constructionBoost, timeFactor) * 1000;
  });
  const bTotal = (buildQ ? Math.max(0, buildQ.end - now) : 0) + bTimes.reduce((a, b) => a + b, 0);
  const seenR: Record<string, number> = researchQ ? { [researchQ.id]: 1 } : {};
  const rTimes = rBacklog.map((q) => {
    const level = lvl(techs, q.id as TechId) + (seenR[q.id] ?? 0) + 1;
    seenR[q.id] = (seenR[q.id] ?? 0) + 1;
    return researchTime(techCost(q.id as TechId, level), lab, cfg.economySpeed * cfg.researchBoost, me.allianceBonuses.research, timeFactor * researchFactor) * 1000;
  });
  const rTotal = (researchQ ? Math.max(0, researchQ.end - now) : 0) + rTimes.reduce((a, b) => a + b, 0);
  // the shipyard: a row finishes after its running unit plus the rest; the whole queue is every row one after the other
  const rowTimes: number[] = planet.shipyardQueue.map((j: any, i: number) => (i === 0 ? Math.max(0, j.start + j.unitMs - now) + Math.max(0, j.remaining - 1) * j.unitMs : j.remaining * j.unitMs));
  const yardTotal = rowTimes.reduce((a, b) => a + b, 0);
  return { me, planet, act, live, now, toast, withUndo, cfg, techs, have, hint, timeFactor, researchFactor, robotics, nanite, shipyard, lab, buildQ, researchQ, bBacklog, rBacklog, MAXQ, bTimes, bTotal, rTimes, rTotal, rowTimes, yardTotal };
}
export type ItemsData = ReturnType<typeof useItems>;
