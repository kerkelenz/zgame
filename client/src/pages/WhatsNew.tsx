import { useEffect } from 'react';
import { CHANGELOG, markChangelogSeen } from '../changelog';
import { Card, Page } from '../ui';

/** Release notes: what changed recently. (The Guide is the permanent how-to; this page is the log.) */
export function WhatsNew() {
  useEffect(() => { markChangelogSeen(); }, []);
  return (
    <Page title="What's new">
      {CHANGELOG.map((r) => (
        <Card key={r.id} title={r.title} right={<span className="muted small">{r.date}</span>}>
          <ul className="notes">{r.items.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
      ))}
    </Page>
  );
}
