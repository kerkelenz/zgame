import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getToken } from './api';
import { GameProvider } from './game';
import { Login } from './pages/Login';
import './styles.css';

function Root() {
  const [authed, setAuthed] = useState(!!getToken());
  const out = useCallback(() => setAuthed(false), []);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <GameProvider onLogout={out}>
      <App />
    </GameProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
