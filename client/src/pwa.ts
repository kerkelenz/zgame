import { get, post } from './api';

/** Installing the app and receiving push notifications. All of it is optional; the game works the same without. */
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

// the browser offers installation once; keep the event so a button can use it
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; listeners.forEach((f) => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });
}
export const canInstall = () => deferred !== null;
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export async function installApp(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null; listeners.forEach((f) => f());
  return r.outcome === 'accepted';
}

const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export const deviceLabel = () => {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'device';
  const br = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'browser';
  return `${br} on ${os}`;
};

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? (await navigator.serviceWorker.register('/sw.js'));
}

export async function thisDeviceSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask for permission, subscribe this browser and tell the server. Throws a readable error when it cannot. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot receive push notifications.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser settings and try again.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { publicKey } = await get('/push');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await post('/push/subscribe', { subscription: sub.toJSON(), label: deviceLabel() });
}

export async function disablePush(): Promise<void> {
  const sub = await thisDeviceSubscription();
  if (!sub) return;
  await post('/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
