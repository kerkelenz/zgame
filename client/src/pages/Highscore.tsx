import { useEffect, useState } from 'react';
import { get } from '../api';
import { useGame } from '../game';
import { Card, Page, fmt } from '../ui';

export function Highscore() {
  const { me } = useGame();
  const [data, setData] = useState<any>(null);
  useEffect(() => { void get('/highscore').then(setData); }, []);
  if (!data) return <Page title="Highscore"><p className="muted">Loading…</p></Page>;
  return (
    <Page title="Highscore">
      <Card title="Players">
        <table className="table">
          <thead><tr><th>#</th><th>Commander</th><th>Alliance</th><th>Planets</th><th>Buildings</th><th>Research</th><th>Fleet</th><th>Defense</th><th>Total</th></tr></thead>
          <tbody>
            {data.players.map((p: any) => (
              <tr key={p.id} className={p.id === me.player.id ? 'mine' : ''}>
                <td>{p.rank}</td><td>{p.username}</td><td>{p.alliance ? `[${p.alliance}]` : ''}</td><td>{p.planets}</td>
                <td>{fmt(p.buildings)}</td><td>{fmt(p.research)}</td><td>{fmt(p.fleet)}</td><td>{fmt(p.defense)}</td><td><b>{fmt(p.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Alliances">
        {data.alliances.length === 0 ? <p className="muted">No alliances yet.</p> : (
          <table className="table">
            <thead><tr><th>#</th><th>Tag</th><th>Name</th><th>Members</th><th>Total</th></tr></thead>
            <tbody>{data.alliances.map((a: any) => <tr key={a.id}><td>{a.rank}</td><td>[{a.tag}]</td><td>{a.name}</td><td>{a.members}</td><td>{fmt(a.total)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
