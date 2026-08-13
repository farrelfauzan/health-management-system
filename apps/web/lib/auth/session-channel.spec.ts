import { afterEach, describe, expect, it, vi } from 'vitest';

import { openSessionChannel } from './session-channel';

/**
 * jsdom delivers `BroadcastChannel` messages through its own task queue, and a
 * single macrotask is not reliably enough to see one land. Polling keeps the
 * cases honest without inventing a fixed sleep that would be either flaky or
 * slow.
 */
async function waitForCount(received: readonly unknown[], expected: number): Promise<void> {
  for (let attempt = 0; attempt < 50 && received.length < expected; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('openSessionChannel (SJ-9)', () => {
  const opened: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const channel of opened.splice(0)) {
      channel.close();
    }
    vi.unstubAllGlobals();
  });

  /**
   * SJ-9 acceptance: ending a session in tab A ends it in tab B. Without this,
   * "lock the workstation" leaves a signed-in dashboard open on the second
   * monitor — the exact thing the button was pressed to prevent.
   */
  it('delivers a session-ended message to another tab', async () => {
    const received: unknown[] = [];
    const listener = openSessionChannel((message) => received.push(message));
    const sender = openSessionChannel(() => undefined);
    opened.push(listener, sender);

    sender.post({ kind: 'SESSION_ENDED' });
    await waitForCount(received, 1);

    expect(received).toEqual([{ kind: 'SESSION_ENDED' }]);
  });

  it('delivers activity so another tab can reset its countdown', async () => {
    const received: Array<{ kind: string }> = [];
    const listener = openSessionChannel((message) => received.push(message));
    const sender = openSessionChannel(() => undefined);
    opened.push(listener, sender);

    sender.post({ kind: 'ACTIVITY', at: 1_700_000_000_000 });
    await waitForCount(received, 1);

    expect(received[0]?.kind).toBe('ACTIVITY');
  });

  /** A sender never hears itself, which is why every call site acts locally too. */
  it('does not echo a message back to its sender', async () => {
    const received: unknown[] = [];
    const sender = openSessionChannel((message) => received.push(message));
    opened.push(sender);

    sender.post({ kind: 'SESSION_ENDED' });
    // No poll here: this asserts an absence, so it has to wait out the window
    // a message would have arrived in rather than return early.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([]);
  });

  /**
   * Safari before 15.4 has no `BroadcastChannel`. Degrading to per-tab
   * behaviour is correct: a timeout covering one tab still beats none, and the
   * server enforces the real deadline whatever any tab believes.
   */
  it('degrades to a no-op where BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    const channel = openSessionChannel(() => undefined);

    expect(() => channel.post({ kind: 'SESSION_ENDED' })).not.toThrow();
    expect(() => channel.close()).not.toThrow();
  });
});
