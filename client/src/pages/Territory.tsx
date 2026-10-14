import { useCallback, useEffect, useMemo, useState } from 'react';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Page, fmt, Loading } from '../ui';

/** a stable colour per alliance tag */
const hue = (tag: string) => { let h = 0; for (const c of tag) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const tint = (tag: string, mine = false) => `hsl(${hue(tag)} ${mine ? 80 : 55}% ${mine ? 52 : 42}%)`;

export function Territory() {
  const { me, showInGalaxy } = useGame();
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await get('/sectors')), []);
  useEffect(() => { void load(); const t = setInterval(load, 20_000); return () => clearInterval(t); }, [load]);
  const byKey = useMemo(() => new Map<string, any>((d?.sectors ?? []).map((s: any) => [`${s.g}:${s.s}`, s])), [d]);
  const standings = useMemo(() => {
    const m = new Map<string, { tag: string; count: number }>();
    for (const s of d?.sectors ?? []) if (s.owner) { const e = m.get(s.owner.id) ?? { tag: s.owner.tag, count: 0 }; e.count++; m.set(s.owner.id, e); }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [d]);
  if (!d) return <Page title="Territory"><Loading /></Page>;
  const cfg = d.config;
  const myId = me.alliance?.id ?? null;
  return (
    <Page title="Territory">
      <p className="muted">An alliance holds a system when its members' planets there clearly out-weigh everyone else's. Held systems give every member a production bonus. Weight counts each planet (at least {cfg.claimMin / 3}) plus what is built and stationed on it, so raiding and defending decide who keeps a sector.</p>
      {d.mine ? (
        <Card title="Your alliance">
          <p>[{me.alliance.tag}] holds <b>{d.mine.count}</b> system{d.mine.count === 1 ? '' : 's'}: <b className="good">+{(d.mine.bonus * 100).toFixed(1)}%</b> mine output for every member (+{cfg.perSector * 100}% per system, up to +{cfg.cap * 100}%).</p>
        </Card>
      ) : <Card title="Your alliance"><p className="muted">Join an alliance to claim systems with your planets.</p></Card>}
      {standings.length > 0 && (
        <Card title="Who holds what">
          <div className="chips">{standings.map(([id, e]) => <span key={id} className="tag" style={{ borderColor: tint(e.tag, id === myId), color: tint(e.tag, id === myId) }}>[{e.tag}] {e.count}</span>)}</div>
        </Card>
      )}
      {Array.from({ length: cfg.galaxies }, (_, gi) => gi + 1).map((g) => (
        <Card key={g} title={`Galaxy ${g}`} right={<span className="muted small">click a system to open it</span>}>
          <div className="sectormap">
            {Array.from({ length: cfg.systems }, (_, si) => si + 1).map((s) => {
              const c = byKey.get(`${g}:${s}`);
              const top = c?.influence?.[0];
              const style = c?.owner ? { background: tint(c.owner.tag, c.owner.id === myId) } : top ? { background: 'transparent', border: `1px dashed ${tint(top.tag)}` } : undefined;
              const tip = !c ? `${g}:${s} - empty` : `${g}:${s}${c.owner ? ` - held by [${c.owner.tag}]` : ' - unclaimed'}${c.influence.length ? '\n' + c.influence.map((i: any) => `[${i.tag}] ${fmt(i.value)} (${i.planets} planet${i.planets === 1 ? '' : 's'})`).join('\n') : ''}`;
              return (
                <button key={s} className={`sector${c?.contested ? ' contested' : ''}${c?.owner?.id === myId ? ' mine' : ''}`} style={style} title={tip} onClick={() => showInGalaxy({ g, s })}>
                  <span>{s}</span>{c?.owner && <i>{c.owner.tag}</i>}
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <p className="muted small">Solid colour: held (a gold outline marks your alliance's systems). Dashed outline: presence but no holder yet. ⚔ marks a system where two alliances are present. Hover a system for the details.</p>
    </Page>
  );
}
