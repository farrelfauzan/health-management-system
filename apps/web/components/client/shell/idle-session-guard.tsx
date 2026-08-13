'use client';

import { useIdleSession } from '#hooks/use-idle-session';
import { IdleWarningDialog } from '#components/client/shell/idle-warning-dialog';

type IdleSessionGuardProps = {
  idleTimeoutSeconds: number;
  warningLeadSeconds: number;
};

/**
 * Mounts the idle countdown for the authenticated shell (SJ-9).
 *
 * Renders nothing until the warning is due, so it costs a listener and a
 * one-second interval and no layout. It lives in the authenticated layouts
 * rather than the root layout on purpose: counting down an idle timer on the
 * login page would be meaningless, and worse, would fire a heartbeat against a
 * session that does not exist.
 *
 * The thresholds are passed in rather than read here, so they come from the
 * server's own policy and cannot drift from the deadline the refresh endpoint
 * actually enforces.
 */
export function IdleSessionGuard({
  idleTimeoutSeconds,
  warningLeadSeconds,
}: IdleSessionGuardProps) {
  const { isWarning, secondsRemaining, continueSession, endNow } = useIdleSession({
    idleTimeoutSeconds,
    warningLeadSeconds,
  });

  return (
    <IdleWarningDialog
      isOpen={isWarning}
      secondsRemaining={secondsRemaining}
      onContinue={continueSession}
      onEndNow={endNow}
    />
  );
}
