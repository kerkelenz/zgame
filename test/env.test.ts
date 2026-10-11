import { afterEach, describe, expect, it } from 'vitest';
import { env } from '../server/env';

describe('settings from the environment', () => {
  afterEach(() => { delete process.env.ZGAME_TESTKEY; delete process.env.OGAME_TESTKEY; });

  it('reads ZGAME_ names', () => {
    process.env.ZGAME_TESTKEY = 'new';
    expect(env('TESTKEY')).toBe('new');
  });

  it('still honours the older OGAME_ names, and prefers the new one', () => {
    process.env.OGAME_TESTKEY = 'old';
    expect(env('TESTKEY')).toBe('old');
    process.env.ZGAME_TESTKEY = 'new';
    expect(env('TESTKEY')).toBe('new');
  });

  it('is undefined when neither is set', () => {
    expect(env('TESTKEY')).toBeUndefined();
  });
});
