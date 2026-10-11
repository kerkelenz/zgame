export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

const TOKEN_KEY = 'zg.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
export const setToken = (t: string) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };

export async function api<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error || `Request failed (${res.status})`, res.status);
  return json as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);
