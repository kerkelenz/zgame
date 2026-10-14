import { BUILDINGS, TECHS, buildingAllowed } from '../../shared/data';
import { buildingCost, canAfford, lvl, techCost } from '../../shared/formulas';
import type { BuildingId, TechId } from '../../shared/types';
import { post } from './api';
import { useGame } from './game';

/** A small "Upgrade" / "Research" button that can sit next to an item name anywhere (tech tree, requirement lists), so you need not go to its page first. */
export function QuickStart({ id, onlyIfReady }: { id: string; onlyIfReady?: boolean }) {
  const { planet, me, act, live } = useGame();
  const isB = id in BUILDINGS;
  if (!isB && !(id in TECHS)) return null;
  const def = isB ? BUILDINGS[id as BuildingId] : TECHS[id as TechId];
  const techs = me.player.techs;
  const buildQ = planet.buildQueue, researchQ = me.player.research;
  const backlog: string[] = isB ? planet.buildBacklog ?? [] : (me.player.researchBacklog ?? []).map((x: { id: string }) => x.id);
  const running = isB ? buildQ?.id === id : researchQ?.id === id;
  const level = (isB ? lvl(planet.buildings, id as BuildingId) : lvl(techs, id as TechId)) + (running ? 1 : 0) + backlog.filter((x) => x === id).length;
  const cost = isB ? buildingCost(id as BuildingId, level + 1) : techCost(id as TechId, level + 1);
  const missing = def.requires.filter((r) => (r.id in BUILDINGS ? lvl(planet.buildings, r.id as BuildingId) : lvl(techs, r.id as TechId)) < r.level);
  const busy = isB ? !!buildQ : !!researchQ;
  const energyReq = !isB ? TECHS[id as TechId].energyReq : undefined;
  const why = !(!isB || buildingAllowed(id as BuildingId, !!planet.isMoon)) ? 'Cannot be built here'
    : missing.length ? 'Something it needs is missing'
      : energyReq && planet.production.energyProduced < energyReq * 3 ** level ? 'Not enough energy production'
        : isB && id !== 'terraformer' && planet.usedFields + backlog.length >= planet.fields ? 'No free building field'
          : busy && backlog.length >= 4 ? 'The queue is full'
            : !canAfford(live, cost) ? 'Not enough resources yet' : '';
  if (onlyIfReady && why) return null;
  return (
    <button className="quickstart" disabled={!!why} title={why || `${def.name} to level ${level + 1} on ${isB ? planet.name : 'your empire'}`}
      onClick={() => void act(() => post(isB ? `/planets/${planet.id}/build` : `/planets/${planet.id}/research`, { id }), `${def.name}: ${busy ? 'queued' : 'started'}`)}>
      {busy ? 'Queue' : isB ? (level === 0 ? 'Build' : 'Upgrade') : 'Research'} {level + 1}
    </button>
  );
}
