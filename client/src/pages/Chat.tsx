import { useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { useGame } from '../game';
import { Card, Empty, Linkify, Page } from '../ui';

export function Chat() {
  const { me, chatEvents, act } = useGame();
  const [channel, setChannel] = useState<'global' | 'alliance'>('global');
  const [history, setHistory] = useState<any[]>([]);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { void get(`/chat?channel=${channel}`).then(setHistory); }, [channel]);
  const seen = new Set(history.map((m) => m.id));
  const live = chatEvents.filter((m) => m.channel === channel && !seen.has(m.id));
  const all = [...history, ...live];
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [all.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text; setText('');
    await act(() => post('/chat', { channel, text: t }));
  };
  return (
    <Page title="Chat">
      <Card right={<div className="chips">
        <button className={channel === 'global' ? 'active' : ''} onClick={() => setChannel('global')}>Global</button>
        <button disabled={!me.alliance} className={channel === 'alliance' ? 'active' : ''} onClick={() => setChannel('alliance')}>Alliance</button>
      </div>}>
        <div className="chatbox" ref={box}>
          {all.length === 0 && <Empty>No messages yet. Say hi!</Empty>}
          {all.map((m) => <div key={m.id}><span className="muted">{new Date(m.at).toLocaleTimeString()}</span> <b className={m.from === me.player.username ? 'me' : ''}><Linkify text={m.from} /></b>: <Linkify text={m.text} /></div>)}
        </div>
        <form className="row" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={`Message ${channel}…`} />
          <button className="primary">Send</button>
        </form>
      </Card>
    </Page>
  );
}
