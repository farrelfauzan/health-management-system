/**
 * Cross-tab session coordination (SJ-9).
 *
 * Two things have to cross tabs. Ending a session in one must end it in all —
 * otherwise "lock the workstation" leaves a signed-in dashboard open on the
 * second monitor, which is the exact thing the button was pressed to prevent.
 * And activity in one tab must reset the others' idle timers, or a user
 * working in tab A gets a "still there?" modal from tab B.
 *
 * `BroadcastChannel` rather than a `storage` event, deliberately. The storage
 * trick requires writing to `localStorage`, and SJ-9 also asks that nothing
 * about a session persists across users — a key left behind after logout, even
 * a meaningless one, is a thing to explain in an audit. Messages here live
 * only in memory and die with the tab.
 */
const CHANNEL_NAME = 'hms-session';

export type SessionChannelMessage =
  | { kind: 'SESSION_ENDED' }
  /** Sent at most once every few minutes, not on every keystroke. */
  | { kind: 'ACTIVITY'; at: number };

type SessionChannelListener = (message: SessionChannelMessage) => void;

/**
 * Opens the channel, or returns null where `BroadcastChannel` is unavailable —
 * jsdom in older test setups, and Safari before 15.4. Callers degrade to
 * per-tab behaviour rather than failing: a timeout that only covers one tab is
 * still better than no timeout, and the server enforces the real deadline
 * regardless of what any tab believes.
 */
export function openSessionChannel(listener: SessionChannelListener): {
  post: (message: SessionChannelMessage) => void;
  close: () => void;
} {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => undefined, close: () => undefined };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<SessionChannelMessage>) => listener(event.data);
  return {
    // A channel never receives its own messages, so the sender must act on the
    // event itself as well; every call site does.
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}
