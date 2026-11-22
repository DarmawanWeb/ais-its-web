import { afterEach, describe, expect, it, vi } from 'vitest';

import { withCrossTabLock, withStorageLease } from './cross-tab-lock';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('withStorageLease (fallback without the Web Locks API)', () => {
  afterEach(() => window.localStorage.clear());

  it('runs concurrent tasks one after the other', async () => {
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name}:start`);
      await sleep(30);
      events.push(`${name}:end`);
      return name;
    };
    const options = { settleMs: 5, pollMs: 5 };
    const results = await Promise.all([
      withStorageLease('refresh', task('a'), options),
      withStorageLease('refresh', task('b'), options),
      withStorageLease('refresh', task('c'), options),
    ]);
    expect(results.sort()).toEqual(['a', 'b', 'c']);
    // No task starts before the previous one ended.
    for (let index = 0; index < events.length; index += 2) {
      expect(events[index]).toMatch(/:start$/);
      expect(events[index + 1]).toBe(events[index]!.replace('start', 'end'));
    }
    expect(window.localStorage.getItem('ais-lock:refresh')).toBeNull();
  });

  it('takes over a lease whose owner died (expired)', async () => {
    window.localStorage.setItem(
      'ais-lock:refresh',
      JSON.stringify({ owner: 'dead-tab', expires: Date.now() - 1 }),
    );
    await expect(
      withStorageLease('refresh', () => Promise.resolve('ok'), { settleMs: 1 }),
    ).resolves.toBe('ok');
  });

  it('never blocks the session longer than maxWaitMs', async () => {
    window.localStorage.setItem(
      'ais-lock:refresh',
      JSON.stringify({ owner: 'stuck-tab', expires: Date.now() + 60_000 }),
    );
    const started = Date.now();
    await withStorageLease('refresh', () => Promise.resolve(1), { pollMs: 5, maxWaitMs: 60 });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('releases the lease when the task fails', async () => {
    await expect(
      withStorageLease('refresh', () => Promise.reject(new Error('boom')), { settleMs: 1 }),
    ).rejects.toThrow('boom');
    expect(window.localStorage.getItem('ais-lock:refresh')).toBeNull();
  });
});

describe('withCrossTabLock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the Web Locks API when the browser has it', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    await expect(withCrossTabLock('refresh', () => Promise.resolve(42))).resolves.toBe(42);
    expect(request).toHaveBeenCalledWith('refresh', expect.any(Function));
  });

  it('falls back to the localStorage lease outside secure contexts', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: undefined });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await expect(withCrossTabLock('refresh', () => Promise.resolve('done'))).resolves.toBe('done');
    expect(setItem).toHaveBeenCalledWith('ais-lock:refresh', expect.stringContaining('owner'));
  });
});
