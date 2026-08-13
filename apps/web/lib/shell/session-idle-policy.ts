/**
 * The idle thresholds the browser counts down to (SJ-9).
 *
 * Read from the environment at build time rather than fetched, because the
 * authenticated layouts are server components that render before any client
 * code runs — fetching would mean a round trip on every navigation for two
 * numbers that change roughly never.
 *
 * They must match `SESSION_IDLE_TIMEOUT_MINUTES` on the API. A mismatch is not
 * a security problem — the server enforces the real deadline regardless of
 * what any browser believes — but a warning that fires at the wrong moment is
 * worse than none, because it teaches people the countdown is meaningless.
 * The heartbeat response carries the server's own numbers, so a client that
 * wants to self-correct can.
 */
const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;
const DEFAULT_WARNING_LEAD_SECONDS = 60;

export type SessionIdlePolicy = {
  idleTimeoutSeconds: number;
  warningLeadSeconds: number;
};

export function resolveSessionIdlePolicy(): SessionIdlePolicy {
  const rawMinutes = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES);
  const idleTimeoutMinutes =
    Number.isFinite(rawMinutes) && rawMinutes >= 2 ? rawMinutes : DEFAULT_IDLE_TIMEOUT_MINUTES;
  const idleTimeoutSeconds = Math.round(idleTimeoutMinutes * 60);

  return {
    idleTimeoutSeconds,
    // Mirrors the API's clamp, so a short window cannot produce a modal that
    // is on screen for most of the session.
    warningLeadSeconds: Math.min(
      DEFAULT_WARNING_LEAD_SECONDS,
      Math.floor(idleTimeoutSeconds / 3),
    ),
  };
}
