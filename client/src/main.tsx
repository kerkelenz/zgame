import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { getToken } from './api';
import { GameProvider } from './game';
import { Login } from './pages/Login';
import { SharedReport } from './pages/SharedReport';
import { registerServiceWorker } from './pwa';
import './styles.css';

registerServiceWorker();

function Root() {
  const shared = new URLSearchParams(location.search).get('report');
  if (shared) return <SharedReport id={shared} />;
  const [authed, setAuthed] = useState(!!getToken());
  const out = useCallback(() => setAuthed(false), []);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <GameProvider onLogout={out}>
      <App />
    </GameProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><Root /></ErrorBoundary></StrictMode>);
