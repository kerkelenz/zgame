import { useMemo, useState } from 'react';
import { lvl } from '../../../shared/formulas';
import { BUILDINGS } from '../../../shared/data';
import { FLOWS, TREE, ancestors, descendants, nodeOf, type TreeNode } from '../../../shared/techtree';
import type { BuildingId, TechId, UnitId } from '../../../shared/types';
import { Art } from '../art';
import { useGame } from '../game';
import { Card, ItemLink, Page } from '../ui';

type Filter = 'all' | 'building' | 'tech' | 'ship' | 'defense';
const FILTERS: [Filter, string][] = [['all', 'Everything'], ['building', 'Buildings'], ['tech', 'Research'], ['ship', 'Ships'], ['defense', 'Defenses']];

export function TechTree() {
  const { planet, me, openItem } = useGame();
  const [view, setView] = useState<'tree' | 'flows'>('tree');
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string | null>(null);

  const have = (n: { id: string; kind: string }): number =>
    n.kind === 'building' ? lvl(planet.buildings, n.id as BuildingId) : n.kind === 'tech' ? lvl(me.techs, n.id as TechId) : n.kind === 'ship' ? planet.fleet[n.id as UnitId] || 0 : planet.defenses[n.id as UnitId] || 0;
  const haveId = (id: string) => have({ id, kind: id in BUILDINGS ? 'building' : 'tech' });
  const unlocked = (n: TreeNode) => n.requires.every((r) => haveId(r.id) >= r.level);
  const count = (id: string) => { const n = nodeOf(id)!; return n.kind === 'ship' || n.kind === 'defense' ? `×${have(n)}` : String(have(n)); };

  const anc = useMemo(() => (sel ? ancestors(sel) : new Map<string, number>()), [sel]);
  const desc = useMemo(() => (sel ? descendants(sel) : new Set<string>()), [sel]);
  const tiers = useMemo(() => {
    const out: TreeNode[][] = [];
    for (const n of TREE) if (filter === 'all' || n.kind === filter) (out[n.tier] ||= []).push(n);
    return out.map((list, i) => ({ tier: i, list: list ?? [] })).filter((t) => t.list.length);
  }, [filter]);

  const node = (n: TreeNode) => {
    const owned = have(n);
    const cls = ['tnode', n.kind, owned > 0 ? 'owned' : unlocked(n) ? 'ready' : 'locked', sel === n.id ? 'sel' : '', anc.has(n.id) ? 'anc' : '', desc.has(n.id) ? 'desc' : '', sel && sel !== n.id && !anc.has(n.id) && !desc.has(n.id) ? 'dim' : ''].filter(Boolean).join(' ');
    return (
      <button key={n.id} className={cls} onClick={() => setSel(sel === n.id ? null : n.id)} title={n.moonOnly ? `${n.name} (moons only)` : n.name}>
        <img className="icon" src={Art.icon(n.kind, n.id, n.name)} alt="" />
        <span className="tname">{n.name}{n.moonOnly ? ' 🌙' : ''}</span>
        {owned > 0 && <span className="lvl">{n.kind === 'ship' || n.kind === 'defense' ? `×${owned}` : owned}</span>}
      </button>
    );
  };

  const selNode = sel ? nodeOf(sel) : undefined;
  const unlocks = selNode ? TREE.filter((n) => n.requires.some((r) => r.id === selNode.id)) : [];
  const chain = [...anc.entries()].sort((a, b) => (nodeOf(a[0])?.tier ?? 0) - (nodeOf(b[0])?.tier ?? 0));

  return (
    <Page title="Tech tree">
      <div className="row wrap">
        <button className={view === 'tree' ? 'primary' : ''} onClick={() => setView('tree')}>Requirements</button>
        <button className={view === 'flows' ? 'primary' : ''} onClick={() => setView('flows')}>Production and effects</button>
      </div>

      {view === 'tree' && (
        <>
          <p className="muted small">Everything you can build, research or train, from what you start with (top) to the end of the line. Click an item to see what it needs (<span className="tlegend anc">needed first</span>) and what it opens up (<span className="tlegend desc">unlocks</span>). Levels shown are for the selected planet and your research. <span className="tlegend owned">have it</span> <span className="tlegend ready">ready to start</span> <span className="tlegend locked">locked</span></p>
          <div className="row wrap">
            {FILTERS.map(([f, label]) => <button key={f} className={filter === f ? 'primary' : ''} onClick={() => setFilter(f)}>{label}</button>)}
          </div>

          {selNode && (
            <Card title={<>{selNode.name} <span className="muted small">{selNode.kind === 'tech' ? 'research' : selNode.kind}</span></>} right={<span className="row"><button onClick={() => openItem(selNode.id)}>Details</button><button onClick={() => setSel(null)}>Clear</button></span>}>
              <div className="treeinfo">
                <div>
                  <b>Needs directly</b>
                  {selNode.requires.length === 0 && <div className="muted small">Nothing: available from the start.</div>}
                  {selNode.requires.map((r) => (
                    <div key={r.id} className={haveId(r.id) >= r.level ? 'good' : 'bad'}>
                      <ItemLink id={r.id} /> level {r.level} <span className="muted small">(you: {haveId(r.id)})</span>
                    </div>
                  ))}
                  {chain.length > selNode.requires.length && (
                    <div className="muted small">Whole chain: {chain.map(([id, l]) => `${nodeOf(id)?.name} ${l}`).join(', ')}.</div>
                  )}
                </div>
                <div>
                  <b>Opens up</b>
                  {unlocks.length === 0 && <div className="muted small">Nothing else needs it.</div>}
                  {unlocks.map((n) => {
                    const req = n.requires.find((r) => r.id === selNode.id)!;
                    const also = n.requires.filter((r) => r.id !== selNode.id);
                    return <div key={n.id}><ItemLink id={n.id} /> <span className="muted small">at level {req.level}{also.length ? `, with ${also.map((r) => `${nodeOf(r.id)?.name} ${r.level}`).join(', ')}` : ''}</span></div>;
                  })}
                </div>
              </div>
            </Card>
          )}

          {tiers.map((t) => (
            <div key={t.tier} className="tier">
              <div className="tierlabel">{t.tier === 0 ? 'Start' : `Step ${t.tier}`}</div>
              <div className="tiernodes">{t.list.map(node)}</div>
            </div>
          ))}
        </>
      )}

      {view === 'flows' && (
        <>
          <p className="muted small">How the pieces feed each other: what raises each output, and what holds it back. Your level on the selected planet is shown next to each item.</p>
          <div className="items">
            {FLOWS.map((f) => (
              <Card key={f.id} title={f.title}>
                <p className="muted">{f.summary}</p>
                <b className="small">Raised by</b>
                <ul className="flow">{f.boosts.map((b, i) => <li key={i}>{b.id && <><ItemLink id={b.id} /> <span className="lvl">{count(b.id)}</span> - </>}{b.text}</li>)}</ul>
                {f.limits && (
                  <>
                    <b className="small">Limited by</b>
                    <ul className="flow">{f.limits.map((b, i) => <li key={i}>{b.id && <><ItemLink id={b.id} /> <span className="lvl">{count(b.id)}</span> - </>}{b.text}</li>)}</ul>
                  </>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
