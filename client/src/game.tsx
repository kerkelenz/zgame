import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Coords, Mission } from '../../shared/types';
import { ApiError, get, getToken, post, setToken } from './api';
import { playCue } from './sound';

export const BROWSER_NOTIFY_KEY = 'zg.browserNotify';
/** a desktop notification while the tab is in the background (opt-in in Settings) */
function browserNotify(title: string, body: string) {
  try {
    if (localStorage.getItem(BROWSER_NOTIFY_KEY) !== '1') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    new Notification(title, { body, tag: title });
  } catch { /* notifications unavailable */ }
}

export interface Toast { id: number; text: string; kind: 'info' | 'alert' | 'error' }

export interface Target { coords: Coords; mission?: Mission; toMoon?: boolean }

interface GameCtx {
  me: any | null;
  planets: any[];
  planet: any | null;
  fleets: { mine: any[]; incoming: any[]; stationed: any[]; joinable: any[] };
  selectPlanet: (id: string) => void;
  refresh: () => Promise<void>;
  /** server-corrected current time (ms) */
  now: number;
  act: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  toasts: Toast[];
  toast: (text: string, kind?: Toast['kind']) => void;
  page: string;
  setPage: (p: string) => void;
  /** the building / research / unit whose details page is open */
  detailId: string | null;
  openItem: (id: string) => void;
  profileId: string | null;
  /** the page a profile was opened from, so Back returns there */
  profileFrom: string;
  /** one-shot: where the Galaxy page should open */
  galaxyAt: { g: number; s: number } | null;
  showInGalaxy: (c: { g: number; s: number }) => void;
  openProfile: (id: string) => void;
  closeItem: () => void;
  target: Target | null;
  setTarget: (t: Target | null) => void;
  logout: () => void;
  /** true while the server cannot be reached */
  offline: boolean;
  chatEvents: any[];
  /** live resources of the selected planet, interpolated */
  live: { metal: number; crystal: number; deuterium: number };
}

const Ctx = createContext<GameCtx>(null as never);
export const useGame = () => useContext(Ctx);

export function GameProvider({ onLogout, children }: { onLogout: () => void; children: ReactNode }) {
  const [me, setMe] = useState<any | null>(null);
  const [planets, setPlanets] = useState<any[]>([]);
  const [fleets, setFleets] = useState({ mine: [] as any[], incoming: [] as any[], stationed: [] as any[], joinable: [] as any[] });
  const [selected, setSelected] = useState<string>(() => { try { return localStorage.getItem('zg.planet') || ''; } catch { return ''; } });
  const [skew, setSkew] = useState(0);
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [page, setPage] = useState('overview');
  const [target, setTarget] = useState<Target | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileFrom, setProfileFrom] = useState('highscore');
  const [galaxyAt, setGalaxyAt] = useState<{ g: number; s: number } | null>(null);
  useEffect(() => { if (page !== 'galaxy') setGalaxyAt(null); }, [page]);
  const showInGalaxy = useCallback((c: { g: number; s: number }) => { setGalaxyAt({ g: c.g, s: c.s }); setPage('galaxy'); }, []);
  const [detailFrom, setDetailFrom] = useState('overview');
  const [offline, setOffline] = useState(false);
  const [chatEvents, setChatEvents] = useState<any[]>([]);
  const toastId = useRef(0);
  const busy = useRef(false);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    if (kind === 'alert') playCue('alert'); else if (kind === 'error') playCue('error'); else if (/^New message/.test(text)) playCue('message'); else if (/done|complete|level \d+/i.test(text)) playCue('done');
    setToasts((t) => [...t.slice(-4), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'alert' ? 9000 : 4500);
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [m, ps, fl] = await Promise.all([get('/me'), get('/planets'), get('/fleets')]);
      setSkew(m.now - Date.now());
      setMe(m);
      setPlanets(ps);
      setFleets(fl);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setToken(''); onLogout(); }
      else if (!(e instanceof ApiError)) setOffline(true);
    } finally { busy.current = false; }
  }, [onLogout]);

  const act = useCallback(async <T,>(fn: () => Promise<T>, okText?: string) => {
    try {
      const r = await fn();
      if (okText) toast(okText);
      await refresh();
      return r;
    } catch (e) {
      toast((e as Error).message, 'error');
      return undefined;
    }
  }, [refresh, toast]);

  useEffect(() => { void refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  // websocket push
  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?token=${getToken()}`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'refresh' || msg.type === 'message') void refresh();
        if (msg.type === 'message') toast(`New message: ${msg.data?.subject ?? ''}`);
        if (msg.type === 'message' && /raid|hostile|missile|attack|tribute|ally/i.test(msg.data?.subject ?? '')) browserNotify('Zgame', msg.data.subject);
        if (msg.type === 'alert') browserNotify('Zgame', String(msg.data));
        if (msg.type === 'toast') toast(msg.data);
        if (msg.type === 'alert') toast(msg.data, 'alert');
        if (msg.type === 'chat') setChatEvents((c) => [...c.slice(-200), msg.data]);
      };
      ws.onopen = () => void refresh();
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, [refresh, toast]);

  const selectPlanet = useCallback((id: string) => {
    setSelected(id);
    try { localStorage.setItem('zg.planet', id); } catch { /* ignore */ }
  }, []);

  const planet = useMemo(() => planets.find((p) => p.id === selected) ?? planets[0] ?? null, [planets, selected]);
  // `tick` is read so the memo below re-evaluates every second
  const now = Date.now() + skew + 0 * tick;

  const live = useMemo(() => {
    if (!planet) return { metal: 0, crystal: 0, deuterium: 0 };
    const dt = Math.max(0, now - planet.updatedAt) / 3_600_000;
    const f = (k: 'metal' | 'crystal' | 'deuterium') => {
      const cur = planet.resources[k], rate = planet.production[k], cap = planet.capacity[k];
      return rate >= 0 ? (cur >= cap ? cur : Math.min(cap, cur + rate * dt)) : Math.max(0, cur + rate * dt);
    };
    return { metal: f('metal'), crystal: f('crystal'), deuterium: f('deuterium') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planet, tick, skew]);

  // when something we are waiting on is due, pull fresh state
  useEffect(() => {
    if (!planet || !me) return;
    const due = [planet.buildQueue?.end, me.player.research?.end, ...fleets.mine.map((m) => (m.phase === 'outbound' ? m.arriveAt : m.phase === 'holding' ? m.holdUntil : m.returnAt))]
      .filter(Boolean).some((t: number) => t <= now && t > now - 1500);
    if (due) setTimeout(refresh, 800);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const openItem = useCallback((id: string) => {
    setDetailFrom((from) => (page === 'detail' ? from : page));
    setDetailId(id);
    setPage('detail');
    window.scrollTo({ top: 0 });
  }, [page]);
  const openProfile = useCallback((id: string) => { setProfileFrom((from) => (page === 'profile' ? from : page)); setProfileId(id); setPage('profile'); window.scrollTo({ top: 0 }); }, [page]);
  const closeItem = useCallback(() => setPage(detailFrom), [detailFrom]);

  const logout = useCallback(() => { void post('/logout').catch(() => undefined); setToken(''); onLogout(); }, [onLogout]);

  const value: GameCtx = { me, planets, planet, fleets, selectPlanet, refresh, now, act, toasts, toast, page, setPage, detailId, openItem, profileId, profileFrom, openProfile, galaxyAt, showInGalaxy, closeItem, target, setTarget, logout, offline, chatEvents, live };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
