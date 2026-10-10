import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { authenticate } from '../server/accounts';
import { createApp } from '../server/app';
import { bus, type PushEvent } from '../server/bus';
import { createWorld } from '../server/world';

/** Mirrors the wiring in server/index.ts so the push contract is covered. */
let port = 0;
let close: () => void;
const w = createWorld({ raidIntervalMin: 0 });

beforeAll(async () => {
  const server = createServer(createApp(w));
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sockets = new Map<WebSocket, string>();
  wss.on('connection', (ws, req) => {
    const p = authenticate(w, new URL(req.url || '', 'http://x').searchParams.get('token') || undefined);
    if (!p) return void ws.close(4001);
    sockets.set(ws, p.id);
    ws.on('close', () => sockets.delete(ws));
  });
  const onPush = (e: PushEvent) => {
    for (const [ws, pid] of sockets) if (e.to === '*' || e.to === pid) ws.send(JSON.stringify({ type: e.type, data: e.data }));
  };
  bus.on('push', onPush);
  await new Promise<void>((r) => server.listen(0, r));
  port = (server.address() as AddressInfo).port;
  close = () => { bus.off('push', onPush); wss.close(); server.close(); };
});
afterAll(() => close());

const api = async (path: string, token: string | undefined, body?: unknown) =>
  (await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json() as Promise<any>;

const open = (token: string) => new Promise<{ ws: WebSocket; got: any[] }>((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const got: any[] = [];
  ws.on('message', (d) => got.push(JSON.parse(String(d))));
  ws.on('open', () => resolve({ ws, got }));
  ws.on('error', reject);
});
const until = async (f: () => boolean) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 20)); };

describe('websocket push', () => {
  it('rejects bad tokens', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=nope`);
    const code = await new Promise<number>((r) => ws.on('close', (c) => r(c)));
    expect(code).toBe(4001);
  });

  it('delivers private messages to the recipient only and global chat to everyone', async () => {
    const a = (await api('/register', undefined, { username: 'wsalice', password: 'secret1' })).token;
    const b = (await api('/register', undefined, { username: 'wsbob', password: 'secret2' })).token;
    const A = await open(a), B = await open(b);
    await api('/messages/send', a, { to: 'wsbob', text: 'hi bob' });
    await until(() => B.got.some((m) => m.type === 'message'));
    expect(B.got.some((m) => m.type === 'message')).toBe(true);
    expect(A.got.some((m) => m.type === 'message')).toBe(false);

    await api('/chat', a, { channel: 'global', text: 'hello all' });
    await until(() => A.got.some((m) => m.type === 'chat') && B.got.some((m) => m.type === 'chat'));
    expect(A.got.find((m) => m.type === 'chat').data.text).toBe('hello all');
    expect(B.got.find((m) => m.type === 'chat').data.from).toBe('wsalice');
    A.ws.close(); B.ws.close();
  });

  it('keeps alliance chat private to the alliance', async () => {
    const a = (await api('/login', undefined, { username: 'wsalice', password: 'secret1' })).token;
    const b = (await api('/login', undefined, { username: 'wsbob', password: 'secret2' })).token;
    await api('/alliance/create', a, { tag: 'WSA', name: 'WS Alliance' });
    const A = await open(a), B = await open(b);
    await api('/chat', a, { channel: 'alliance', text: 'secret plans' });
    await until(() => A.got.some((m) => m.type === 'chat'));
    await new Promise((r) => setTimeout(r, 100));
    expect(A.got.some((m) => m.type === 'chat')).toBe(true);
    expect(B.got.some((m) => m.type === 'chat')).toBe(false);
    A.ws.close(); B.ws.close();
  });
});
