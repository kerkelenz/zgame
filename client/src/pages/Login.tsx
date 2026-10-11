import { useState } from 'react';
import { post, setToken } from '../api';

export function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [key, setKey] = useState('');
  const [info, setInfo] = useState('');
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
      const r = await post(mode === 'login' ? '/login' : '/register', { username, password });
      setToken(r.token);
      onDone();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>Stellar Frontier</h1>
        <p className="muted">Build an empire. Defend your allies. Conquer the galaxy together.</p>
        <label>Commander name<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" /></label>
        {mode === 'recover' && <label>Recovery key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="xxxxx-xxxxx-xxxxx-xxxxx" autoComplete="off" /></label>}
        <label>{mode === 'recover' ? 'New password' : 'Password'}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <div className="error">{error}</div>}
        {info && <div className="good">{info}</div>}
        <button className="primary" disabled={busy}>{mode === 'login' ? 'Log in' : mode === 'register' ? 'Create account' : 'Reset password'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New here? Register' : 'Have an account? Log in'}
        </button>
        {mode !== 'recover' && <button type="button" className="link" onClick={() => setMode('recover')}>Forgot your password? Use a recovery key</button>}
      </form>
    </div>
  );
}
