import { useEffect, useState } from 'react';
import { get, post } from '../api';
import { BROWSER_NOTIFY_KEY, useGame } from '../game';
import { Card, Countdown, Page, when } from '../ui';

function Vacation() {
  const { me, act, now } = useGame();
  const v = me.vacation as { since: number; minUntil: number } | null;
  const hours = me.config.vacationMinHours;
  return (
    <Card title="Vacation mode">
      <div className="settings-section">
        <p className="muted">Freeze your empire while you are away. Nothing is produced, and nobody can attack, spy on, bombard or station fleets with you. Raiders and tribute demands skip you.</p>
        <ul className="notes">
          <li>It lasts at least <b>{hours} hours</b>, and while you are away you cannot build, research, trade or send fleets.</li>
          <li>To start, your empire must be quiet: no fleets or missiles in flight, no construction, research or shipyard queues, no hostile fleets heading for you and no allied fleets stationed with you.</li>
          <li>The time away gives no production when you return, and your planets show a <span className="tag vac">v</span> flag in the Galaxy.</li>
        </ul>
        {v ? (
          <>
            <p>You have been on vacation since <b>{when(v.since)}</b>.</p>
            {now < v.minUntil
              ? <p className="muted">You can leave in <Countdown to={v.minUntil} /> (at {when(v.minUntil)}).</p>
              : <p className="good">The minimum stay is over - you can leave whenever you like.</p>}
            <button className="primary" disabled={now < v.minUntil} onClick={() => void act(() => post('/vacation/end'), 'Welcome back!')}>Leave vacation mode</button>
          </>
        ) : (
          <button onClick={() => { if (confirm(`Start vacation mode? It lasts at least ${hours} hours and your empire will be frozen.`)) void act(() => post('/vacation/start'), 'Vacation mode started'); }}>Start vacation mode</button>
        )}
      </div>
    </Card>
  );
}

const EVENTS: [string, string, string][] = [
  ['attacks', 'Attacks on me', 'hostile fleets, raids and missiles heading for your planets'],
  ['allies', 'Allies under attack', 'an alliance member is attacked or raided - time to send a hold fleet'],
  ['tribute', 'Tribute demands', 'a hostile empire asks for payment'],
  ['completions', 'Things finished', 'construction, research, ships and objectives'],
  ['messages', 'Private messages', 'mail from other commanders'],
];

function Alerts() {
  const { toast } = useGame();
  const [cfg, setCfg] = useState<any | null>(null);
  const [discord, setDiscord] = useState('');
  const [ntfy, setNtfy] = useState('');
  const [busy, setBusy] = useState(false);
  const [browser, setBrowser] = useState(() => { try { return localStorage.getItem(BROWSER_NOTIFY_KEY) === '1'; } catch { return false; } });
  useEffect(() => { void get('/notify').then(setCfg); }, []);
  if (!cfg) return <Card title="Alerts outside the game"><p className="muted">Loading…</p></Card>;

  const save = async (patch: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try { setCfg(await post('/notify', patch)); if (ok) toast(ok); return true; } catch (e) { toast((e as Error).message, 'error'); return false; } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await post('/notify/test');
      for (const x of r.results) {
        const name = x.channel === 'discord' ? 'Discord' : 'ntfy';
        toast(x.ok ? name + ': test message sent' : name + ' failed (status ' + (x.status || 'no answer') + ')', x.ok ? 'info' : 'error');
      }
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const toggleBrowser = async () => {
    if (browser) { try { localStorage.setItem(BROWSER_NOTIFY_KEY, '0'); } catch { /* ignore */ } setBrowser(false); return; }
    if (typeof Notification === 'undefined') return toast('This browser does not support notifications', 'error');
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications were not allowed - change it in your browser settings', 'error');
    try { localStorage.setItem(BROWSER_NOTIFY_KEY, '1'); } catch { /* ignore */ }
    setBrowser(true);
    new Notification('Stellar Frontier', { body: 'Browser alerts are on.' });
  };

  return (
    <Card title="Alerts outside the game">
      <div className="settings-section">
        <p className="muted">Get a message on your phone or Discord when a fleet is heading for you, so you (or an ally) can react. Alerts are only sent while you are away from the game.</p>
        <h4>Browser notifications</h4>
        <p className="small muted">Pops up while this tab is in the background. Works only while the page is open.</p>
        <button onClick={toggleBrowser}>{browser ? 'Turn off browser notifications' : 'Turn on browser notifications'}</button>

        <h4>Discord</h4>
        <p className="small muted">Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. {cfg.discord && <>Saved: <code>{cfg.discord}</code></>}</p>
        <div className="row"><input className="grow" placeholder={cfg.discord ? 'Paste a new webhook URL to replace it' : 'https://discord.com/api/webhooks/…'} value={discord} onChange={(e) => setDiscord(e.target.value)} />
          <button disabled={busy || !discord.trim()} onClick={async () => { if (await save({ discord }, 'Discord webhook saved')) setDiscord(''); }}>Save</button>
          {cfg.discord && <button disabled={busy} onClick={() => void save({ discord: '' }, 'Discord webhook removed')}>Remove</button>}</div>

        <h4>Phone push (ntfy)</h4>
        <p className="small muted">Install the free <b>ntfy</b> app, subscribe to a hard-to-guess topic name (8+ letters/numbers; it works like a password) and enter it here. {cfg.ntfy && <>Saved: <code>{cfg.ntfy}</code></>}</p>
        <div className="row"><input className="grow" placeholder={cfg.ntfy ? 'Enter a new topic to replace it' : 'e.g. frontier-alice-7f3k29x'} value={ntfy} onChange={(e) => setNtfy(e.target.value)} />
          <button disabled={busy || !ntfy.trim()} onClick={async () => { if (await save({ ntfy }, 'ntfy topic saved')) setNtfy(''); }}>Save</button>
          {cfg.ntfy && <button disabled={busy} onClick={() => void save({ ntfy: '' }, 'ntfy topic removed')}>Remove</button>}</div>

        <h4>What to tell me about</h4>
        {EVENTS.map(([key, label, hint]) => (
          <label key={key} className="check"><input type="checkbox" checked={!!cfg.events[key]} onChange={(e) => void save({ events: { [key]: e.target.checked } })} /> <b>{label}</b> <span className="muted small">- {hint}</span></label>
        ))}
        <label className="check"><input type="checkbox" checked={cfg.onlyWhenAway} onChange={(e) => void save({ onlyWhenAway: e.target.checked })} /> <b>Only when I am away</b> <span className="muted small">- skip alerts while you are playing</span></label>
        <div className="row"><button className="primary" disabled={busy || (!cfg.discord && !cfg.ntfy)} onClick={test}>Send a test message</button></div>
      </div>
    </Card>
  );
}

function Account() {
  const { me, act, logout } = useGame();
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  const [name, setName] = useState(''); const [pw2, setPw2] = useState('');
  const [pw3, setPw3] = useState(''); const [key, setKey] = useState('');
  const [pw4, setPw4] = useState(''); const [confirmName, setConfirmName] = useState('');
  return (
    <Card title="Account">
      <div className="settings-section">
        <h4>Change password</h4>
        <div className="row wrap"><input type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          <input type="password" placeholder="New password (6+)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <button disabled={!cur || next.length < 6} onClick={async () => { if (await act(() => post('/account/password', { current: cur, next }), 'Password changed; other devices were signed out')) { setCur(''); setNext(''); } }}>Change</button></div>

        <h4>Rename commander</h4>
        <p className="small muted">You are <b>{me.player.username}</b>. Names can change once every 7 days; your homeworld is renamed too.</p>
        <div className="row wrap"><input placeholder="New name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="password" placeholder="Password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="current-password" />
          <button disabled={!name || !pw2} onClick={async () => { if (await act(() => post('/account/rename', { name, password: pw2 }), 'Renamed')) { setName(''); setPw2(''); } }}>Rename</button></div>

        <h4>Recovery key</h4>
        <p className="small muted">There is no email on file, so a lost password can only be reset with a one-time key. Generate one and keep it somewhere safe; making a new one replaces the old one.</p>
        <div className="row wrap"><input type="password" placeholder="Password" value={pw3} onChange={(e) => setPw3(e.target.value)} autoComplete="current-password" />
          <button disabled={!pw3} onClick={async () => { const r = await act(() => post('/account/recovery-key', { password: pw3 })); if (r) { setKey(r.key); setPw3(''); } }}>Generate key</button></div>
        {key && <p className="good">Your key: <code>{key}</code> <span className="muted small">- shown once.</span></p>}

        <h4>Delete account</h4>
        <p className="small muted">Removes you, your planets and fleets for good. Hand over alliance leadership first.</p>
        <div className="row wrap"><input type="password" placeholder="Password" value={pw4} onChange={(e) => setPw4(e.target.value)} autoComplete="current-password" />
          <input placeholder={`Type ${me.player.username}`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          <button className="danger" disabled={!pw4 || confirmName !== me.player.username} onClick={async () => { if (confirm('Delete your account permanently?') && await act(() => post('/account/delete', { password: pw4, confirm: confirmName }), 'Account deleted')) logout(); }}>Delete</button></div>
      </div>
    </Card>
  );
}

export function Settings() {
  return (
    <Page title="Settings">
      <Account />
      <Alerts />
      <Vacation />
    </Page>
  );
}
