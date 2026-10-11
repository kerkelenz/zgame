import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Countdown, Page, fmt } from '../ui';

export function ContractRow({ c, onClaim }: { c: any; onClaim: (id: string) => void }) {
  const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
  return (
    <div className={`contract${c.claimed ? ' claimed' : ''}`}>
      <div className="row between">
        <span><b>{c.label}</b></span>
        <span className="row">
          <span className="energy small">★ {c.credits}{c.streakBonus > 0 && !c.claimed ? ` + ${c.streakBonus}` : ''}</span>
          {c.claimed ? <span className="good small">claimed</span> : <button className={c.done ? 'primary' : ''} disabled={!c.done} onClick={() => onClaim(c.id)}>Claim</button>}
        </span>
      </div>
      <div className="bar" title={`${fmt(c.progress)} / ${fmt(c.target)}`}><div style={{ width: pct + '%' }} /></div>
      <div className="muted small">{fmt(c.progress)} / {fmt(c.target)}</div>
    </div>
  );
}

export function Contracts() {
  const { act, toast } = useGame();
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await get('/contracts')), []);
  useEffect(() => { void load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);
  const claim = async (id: string) => {
    const r = await act(() => post('/contracts/claim', { id }));
    if (!r) return;
    toast(`+${r.credits + r.bonus} Command Credits${r.bonus ? ` (including the ${r.bonus} all-dailies bonus)` : ''}`);
    setD(r.view);
  };
  if (!d) return <Page title="Contracts"><p className="muted">Loading…</p></Page>;
  return (
    <Page title="Contracts">
      <p className="muted">Short jobs that pay Command Credits. Do the things you would do anyway, then claim. Unclaimed contracts are replaced when the timer runs out.</p>
      <Card title="Today" right={<span className="muted small">new ones in <Countdown to={d.nextDailyAt} /></span>}>
        <p className="small">Streak: <b className="energy">{d.streak} day{d.streak === 1 ? '' : 's'}</b> <span className="muted">- claiming a daily on consecutive days adds +{d.streakStep} credits per streak day to each claim (up to +{d.streakCap * d.streakStep}). Finish all three for a bonus of {d.allBonus.credits}{d.allBonus.got ? ' (collected today)' : ''}.</span></p>
        {d.daily.map((c: any) => <ContractRow key={c.id} c={c} onClaim={claim} />)}
        {d.daily.length === 0 && <p className="muted">Nothing available today.</p>}
      </Card>
      <Card title="This week" right={<span className="muted small">new ones in <Countdown to={d.nextWeeklyAt} /></span>}>
        {d.weekly.map((c: any) => <ContractRow key={c.id} c={c} onClaim={claim} />)}
        {d.weekly.length === 0 && <p className="muted">Nothing available this week.</p>}
      </Card>
    </Page>
  );
}
