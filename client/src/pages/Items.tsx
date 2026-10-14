import { useState } from 'react';
import { post } from '../api';
import { Page, copyLink } from '../ui';
import { AdvisorCard } from '../AdvisorCard';
import { PlannerCard } from '../PlannerCard';
import { getOnlyStartable, setOnlyStartable } from '../afford';
import { BuildingCards, TechCards, UnitCards } from '../items/Cards';
import { Queues } from '../items/Queues';
import { useItems, type Kind } from '../items/useItems';

const TITLES: Record<Kind, string> = { building: 'Buildings', tech: 'Research', ship: 'Shipyard', defense: 'Defense' };

/** Buildings, Research, Shipyard and Defense: one page shape, the queues on top and a card for everything that can be built, researched or produced */
export function Items({ kind }: { kind: Kind }) {
  const d = useItems();
  const { planet, act, now, toast, buildQ, researchQ, bBacklog, rBacklog } = d;
  const [only, setOnly] = useState(getOnlyStartable);
  return (
    <Page title={TITLES[kind]}>
      <Queues kind={kind} d={d} />

      {kind === 'defense' && <AdvisorCard />}
      {(kind === 'ship' || kind === 'defense') && <PlannerCard kind={kind} />}
      {(kind === 'building' || kind === 'tech') && (buildQ || bBacklog.length > 0 || researchQ || rBacklog.length > 0) && (
        <button className="link" onClick={async () => { const r = await act(() => post(`/planets/${planet.id}/share-order`)); if (r) await copyLink(r.id, toast); }}>Share my queue as a build order link</button>
      )}
      <label className="row small startable"><input type="checkbox" checked={only} onChange={() => { setOnly(!only); setOnlyStartable(!only); }} /> Only what I can start now</label>
      <div className="items">
        {kind === 'building' && <BuildingCards d={d} only={only} />}
        {kind === 'tech' && <TechCards d={d} only={only} />}
        {(kind === 'ship' || kind === 'defense') && <UnitCards kind={kind} d={d} only={only} />}
      </div>
      <span hidden>{now}</span>
    </Page>
  );
}
