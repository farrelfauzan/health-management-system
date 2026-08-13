'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { authControllerRecordSessionActivityV1 } from '#lib/api/generated/auth/auth';
import { endSession } from '#lib/auth/end-session';
import { openSessionChannel } from '#lib/auth/session-channel';

/**
 * Events that count as "somebody is here". Deliberately coarse: `mousemove`
 * alone fires hundreds of times a second, and `scroll` fires on momentum after
 * a hand has left the trackpad, so both are read through the same throttle as
 * everything else rather than being treated as special.
 */
const ACTIVITY_EVENTS: readonly string[] = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
];

/** How often the countdown re-evaluates. One second is what the modal shows. */
const TICK_INTERVAL_MS = 1_000;

/**
 * Floor between heartbeats. Activity is continuous; telling the server so is
 * a database write, and once every two minutes is enough to keep a
 * fifteen-minute window open with room to spare.
 */
const HEARTBEAT_INTERVAL_MS = 2 * 60_000;

type IdleSessionOptions = {
  idleTimeoutSeconds: number;
  warningLeadSeconds: number;
};

type IdleSessionState = {
  /** True once the deadline is inside the warning lead. */
  isWarning: boolean;
  secondsRemaining: number;
  /** Dismisses the warning and tells the server the user is still here. */
  continueSession: () => void;
  endNow: () => void;
};

/**
 * The browser half of SJ-9's idle timeout.
 *
 * This is a *courtesy*, not the control. The server refuses to refresh an
 * abandoned session whatever this hook believes, which is what makes it safe
 * for the countdown to live in JavaScript that a user could pause in DevTools.
 * What it buys is a warning: without it, a session simply stops working
 * mid-task with no explanation.
 *
 * The deadline is stored as an absolute timestamp rather than a decrementing
 * counter, because `setInterval` does not run in a backgrounded tab. A laptop
 * closed for an hour would otherwise wake with most of its countdown intact;
 * comparing against a timestamp means the very first tick after waking sees
 * the truth.
 */
export function useIdleSession(options: IdleSessionOptions): IdleSessionState {
  const { idleTimeoutSeconds, warningLeadSeconds } = options;
  const queryClient = useQueryClient();
  const deadlineRef = useRef<number>(Date.now() + idleTimeoutSeconds * 1_000);
  const lastHeartbeatRef = useRef<number>(Date.now());
  const isEndingRef = useRef(false);
  const [secondsRemaining, setSecondsRemaining] = useState(idleTimeoutSeconds);

  const finish = useCallback(async () => {
    // Guarded because the tick, the modal and a channel message can all decide
    // to end the session within the same frame, and three concurrent logout
    // calls would race the redirect.
    if (isEndingRef.current) {
      return;
    }
    isEndingRef.current = true;
    await endSession('IDLE', queryClient);
  }, [queryClient]);

  const channelRef = useRef<ReturnType<typeof openSessionChannel> | null>(null);

  const extend = useCallback(
    (shouldAnnounce: boolean) => {
      deadlineRef.current = Date.now() + idleTimeoutSeconds * 1_000;
      if (!shouldAnnounce) {
        return;
      }
      if (Date.now() - lastHeartbeatRef.current < HEARTBEAT_INTERVAL_MS) {
        return;
      }
      lastHeartbeatRef.current = Date.now();
      channelRef.current?.post({ kind: 'ACTIVITY', at: Date.now() });
      // Fire and forget. A failed heartbeat means the session is probably gone
      // already, and the next real request will discover that properly — an
      // error here would be noise the user cannot act on.
      void authControllerRecordSessionActivityV1().catch(() => undefined);
    },
    [idleTimeoutSeconds],
  );

  useEffect(() => {
    const channel = openSessionChannel((message) => {
      if (message.kind === 'SESSION_ENDED') {
        void finish();
        return;
      }
      // Another tab saw activity. Reset locally without re-announcing, or two
      // tabs would bounce heartbeats off each other indefinitely.
      extend(false);
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [extend, finish]);

  useEffect(() => {
    const handleActivity = (): void => extend(true);
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    // Returning to a tab is activity in its own right, and it is the moment a
    // stale countdown most needs correcting.
    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        extend(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [extend]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1_000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        void finish();
      }
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [finish]);

  return {
    isWarning: secondsRemaining <= warningLeadSeconds,
    secondsRemaining,
    continueSession: () => extend(true),
    endNow: () => {
      channelRef.current?.post({ kind: 'SESSION_ENDED' });
      void finish();
    },
  };
}
