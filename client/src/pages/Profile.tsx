import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, CoordLink, coordStr, fmt, Page, PlanetLink, when, Loading } from '../ui';
import { LineChart } from './Highscore';
import { WorldBanner } from '../WorldBanner';
import { Avatar, Medal } from '../Badge';
import { PIN_MAX, avatarGallery, type AvatarKind } from '../../../shared/profile';

const GALLERY_TABS: { kind: AvatarKind; label: string }[] = [{ kind: 'ship', label: 'Ships' }, { kind: 'defense', label: 'Defenses' }, { kind: 'planet', label: 'Planets' }, { kind: 'moon', label: 'Moons' }];

const ACTIVITY: Record<string, string> = { online: 'online now', active: 'active', inactive: 'inactive for a week or more', longInactive: 'inactive for a month or more' };

export function Profile() {
  const { profileId, goBack, setPage, me, showInGalaxy, act } = useGame();
  const [p, setP] = useState<any>(null);
  const [soc, setSoc] = useState<any>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<AvatarKind>('ship');
  const [draft, setDraft] = useState<{ avatar: string | null; pinned: string[]; featured: string }>({ avatar: null, pinned: [], featured: '' });
  useEffect(() => {
    if (!profileId) return;
    setP(null); setErr('');
    get(`/players/${profileId}`).then(setP).catch((e) => setErr(String(e.message || e)));
    get('/social').then((s) => { setSoc(s); setNote(s.notes[`p:${profileId}`] ?? ''); }).catch(() => undefined);
  }, [profileId]);
  const back = <button onClick={() => goBack('highscore')}>← Back</button>;
  if (err) return <Page title="Commander"><div className="row">{back}</div><div className="error">{err}</div></Page>;
  if (!p) return <Page title="Commander"><Loading /></Page>;
  const mine = p.id === me.player.id;
  const s = p.stats;
  const isBuddy = !!soc?.buddies.some((b: any) => b.id === p.id);
  const isBlocked = !!soc?.blocked.some((b: any) => b.id === p.id);
  const startEdit = () => { setDraft({ avatar: p.avatar, pinned: p.pinned, featured: p.featured?.id ?? '' }); setEditing(true); };
  const saveEdit = async () => {
    const r = await act(() => post('/profile/edit', { avatar: draft.avatar, pinned: draft.pinned, featured: draft.featured || null }), 'Profile saved');
    if (r) { setP(r); setEditing(false); }
  };
  const togglePin = (id: string) => setDraft((d) => ({ ...d, pinned: d.pinned.includes(id) ? d.pinned.filter((x) => x !== id) : d.pinned.length < PIN_MAX ? [...d.pinned, id] : d.pinned }));
  const social = async (path: string, body: unknown, ok: string) => { const r = await act(() => post(path, body), ok); if (r) setSoc(r); };
  return (
    <Page title={p.username}>
      <div className="row">{back}{p.home && !mine && <button onClick={() => showInGalaxy(p.home)}>Find in galaxy {coordStr(p.home)}</button>}</div>
      <div className="profhead">
        <Avatar id={p.avatar} size={112} fallbackLook={p.homeLook} />
        <div className="grow">
          <h2 className="profname">{p.username}</h2>
          <div className="muted small">{p.npc ? `Computer empire (${p.npc})` : 'Commander'}{p.alliance && <> · [{p.alliance.tag}] {p.alliance.name}</>}{p.faction && <> · {p.faction}</>}{p.charClass && <> · {p.charClass}</>}</div>
          {p.pinned.length > 0 ? (
            <div className="medals" aria-label="Pinned achievements">{p.pinned.map((id: string) => { const a = p.achievements.find((x: any) => x.id === id); return a ? <Medal key={id} id={id} name={a.name} desc={a.desc} size={60} /> : null; })}</div>
          ) : mine && <div className="muted small">Pin up to {PIN_MAX} achievements here with Edit profile.</div>}
        </div>
        {mine && !p.npc && <button onClick={() => (editing ? setEditing(false) : startEdit())}>{editing ? 'Close editor' : 'Edit profile'}</button>}
      </div>
      {mine && editing && (
        <Card title="Edit your profile">
          <div className="bt-h">Picture</div>
          <div className="row wrap">{GALLERY_TABS.map((t) => <button key={t.kind} className={tab === t.kind ? 'on' : ''} onClick={() => setTab(t.kind)}>{t.label}</button>)}<button onClick={() => setDraft({ ...draft, avatar: null })} disabled={!draft.avatar}>Use my home world</button></div>
          <div className="avgrid" role="listbox" aria-label="Profile pictures">
            {avatarGallery().filter((a) => a.kind === tab).map((a) => (
              <button key={a.id} role="option" aria-selected={draft.avatar === a.id} className={`avpick${draft.avatar === a.id ? ' on' : ''}`} title={a.name} onClick={() => setDraft({ ...draft, avatar: a.id })}><Avatar id={a.id} size={56} /></button>
            ))}
          </div>
          <div className="bt-h">Pinned achievements <span className="muted small">({draft.pinned.length} of {PIN_MAX}; the order you click is the order shown)</span></div>
          {p.achievements.length === 0 ? <p className="muted small">Earn an achievement first.</p> : (
            <div className="medals">{p.achievements.map((a: any) => <button key={a.id} className={`medalbtn${draft.pinned.includes(a.id) ? ' on' : ''}`} onClick={() => togglePin(a.id)} title={`${a.name}: ${a.desc}`} aria-pressed={draft.pinned.includes(a.id)}><Medal id={a.id} name={a.name} size={48} dim={!draft.pinned.includes(a.id)} /></button>)}</div>
          )}
          <div className="bt-h">Featured world</div>
          <select value={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.value })}>
            <option value="">None</option>
            {p.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name} {coordStr(l.coords)}{l.moon ? ' (moon)' : ''}</option>)}
          </select>
          <div className="row wrap"><button className="primary" onClick={() => void saveEdit()}>Save profile</button><button onClick={() => setEditing(false)}>Cancel</button></div>
        </Card>
      )}
      {p.featured ? <WorldBanner look={p.featured.look} isMoon={p.featured.moon}><b>{p.featured.name}</b><CoordLink c={p.featured.coords} /><span>Featured world</span></WorldBanner>
        : p.homeLook && <WorldBanner look={p.homeLook}><b>{p.homeName}</b>{p.home && <CoordLink c={p.home} />}<span>Home world</span></WorldBanner>}
      {!mine && !p.npc && soc && (
        <div className="row wrap">
          {isBuddy ? <button onClick={() => void social('/social/buddy/remove', { id: p.id }, 'Removed from buddies')}>Remove buddy</button> : <button onClick={() => void social('/social/buddy', { id: p.id }, 'Added to buddies')} disabled={isBlocked}>Add buddy</button>}
          {isBlocked ? <button onClick={() => void social('/social/unblock', { id: p.id }, 'Unblocked')}>Unblock</button> : <button onClick={() => confirm(`Block ${p.username}? They can no longer message you.`) && void social('/social/block', { id: p.id }, 'Blocked')}>Block</button>}
          <button onClick={() => { const reason = prompt(`Report ${p.username} to the admins. What happened?`); if (reason) void act(() => post('/report', { id: p.id, reason }), 'Report sent'); }}>Report</button>
        </div>
      )}
      <p className="muted small">
        {p.planets} planet{p.planets === 1 ? '' : 's'}
        {p.activity && <> · {ACTIVITY[p.activity]}</>}{p.vacation && <> · on vacation</>}
        {' · '}joined {when(p.joinedAt)}
      </p>
      {!mine && soc && (
        <Card title="Your private note">
          <div className="row"><input className="grow" maxLength={500} placeholder="Only you can see this" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={() => void social('/social/note', { key: `p:${p.id}`, text: note }, note.trim() ? 'Note saved' : 'Note removed')}>Save</button></div>
        </Card>
      )}
      {p.locations?.length > 0 && (
        <Card title={`Planets (${p.locations.length})`}>
          {p.locations.map((l: any, i: number) => (
            <div key={i} className="row between">
              <span><PlanetLink name={l.name} coords={l.coords} moon={l.moon}><b>{l.name}</b></PlanetLink> <span className="muted"><CoordLink c={l.coords} /></span></span>
              <button onClick={() => showInGalaxy(l.coords)}>Galaxy</button>
            </div>
          ))}
        </Card>
      )}
      <Card title="Standing">
        <div className="rank-grid">
          {p.ranks.map((r: any) => (
            <div key={r.id} className="rank-tile">
              <span className="muted small">{r.label}</span>
              <b>{r.rank ? '#' + fmt(r.rank) : '-'}</b>
              <span className="muted small">{r.value ? `${fmt(r.value)} ${r.unit}` : 'no score yet'}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Points">
        <table className="kv"><tbody>
          <tr><td>Economy</td><td>{fmt(p.points.buildings)}</td></tr><tr><td>Research</td><td>{fmt(p.points.research)}</td></tr>
          <tr><td>Fleet</td><td>{fmt(p.points.fleet)}</td></tr><tr><td>Defense</td><td>{fmt(p.points.defense)}</td></tr>
          <tr><td><b>Total</b></td><td><b>{fmt(p.points.total)}</b></td></tr>
        </tbody></table>
      </Card>
      <Card title="Record">
        <table className="kv"><tbody>
          <tr><td>Battles won / lost</td><td>{fmt(s.battlesWon)} / {fmt(s.battlesLost)}</td></tr>
          <tr><td>Destroyed</td><td>{fmt(s.destroyed)} resources</td></tr><tr><td>Plundered</td><td>{fmt(s.plundered)}</td></tr>
          <tr><td>Recycled from debris</td><td>{fmt(s.harvested)}</td></tr><tr><td>Expeditions</td><td>{fmt(s.expeditions)}</td></tr>
          <tr><td>Raids repelled</td><td>{fmt(s.raidsRepelled)}</td></tr><tr><td>Moons destroyed</td><td>{fmt(s.moonsDestroyed)}</td></tr>
        </tbody></table>
      </Card>
      {p.history.length > 1 && (
        <Card title="Over time">
          <div className="charts">
            <LineChart series={p.history.map((h: any) => ({ t: h.t, v: h.points }))} label="Points" color="var(--accent)" />
            <LineChart series={p.history.map((h: any) => ({ t: h.t, v: h.rank }))} label="Rank (lower is better)" color="var(--good)" rank />
          </div>
        </Card>
      )}
      {p.monuments?.length > 0 && <p className="muted">🗿 Monuments: {p.monuments.join(', ')}</p>}
      <Card title={`Achievements ${p.achievements.length} / ${p.achievementsTotal}`}>
        {p.achievements.length === 0 ? <p className="muted">None yet.</p> : (
          <ul className="ach">{p.achievements.map((a: any) => <li key={a.id} className="done"><Medal id={a.id} name={a.name} size={32} /><span><b>{a.name}</b> - {a.desc}</span><span className="muted small">{when(a.doneAt)}</span></li>)}</ul>
        )}
      </Card>
    </Page>
  );
}
