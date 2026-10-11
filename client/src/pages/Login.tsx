import { useState } from 'react';
import { post, setToken } from '../api';
import { LANGS, getLang, setLang, t, useLang } from '../i18n';

export function Login({ onDone }: { onDone: () => void }) {
  useLang();
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [key, setKey] = useState('');
  const [info, setInfo] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'recover') {
        await post('/recover', { username, key, password });
        setInfo('Password reset. Log in with your new password.'); setMode('login'); setKey(''); setPassword('');
        return;
      }
      const r = await post(mode === 'login' ? '/login' : '/register', mode === 'register' && adminKey ? { username, password, adminKey } : { username, password });
      setToken(r.token);
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>Stellar Frontier</h1>
        <p className="muted">{t('login.tagline', 'Build an empire. Defend your allies. Conquer the galaxy together.')}</p>
        <label>{t('login.name', 'Commander name')}<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" /></label>
        {mode === 'recover' && <label>Recovery key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="xxxxx-xxxxx-xxxxx-xxxxx" autoComplete="off" /></label>}
        <label>{mode === 'recover' ? 'New password' : t('login.password', 'Password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'register' && <label>Admin setup key <span className="muted small">(only for a reserved admin name)</span><input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} autoComplete="off" /></label>}
        {error && <div className="error">{error}</div>}
        {info && <div className="good">{info}</div>}
        <button className="primary" disabled={busy}>{mode === 'login' ? t('login.submit', 'Log in') : mode === 'register' ? t('login.create', 'Create account') : 'Reset password'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? t('login.register', 'New here? Register') : t('login.have', 'Have an account? Log in')}
        </button>
        {mode !== 'recover' && <button type="button" className="link" onClick={() => setMode('recover')}>{t('login.forgot', 'Forgot your password? Use a recovery key')}</button>}
        <select value={getLang()} onChange={(e) => setLang(e.target.value)} aria-label="Language">{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </form>
    </div>
  );
}
