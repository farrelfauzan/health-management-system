const MILLISECONDS_PER_MINUTE = 60_000;

/**
 * Estimates `estimasidilayani` — the epoch-millisecond time BPJS shows the
 * member as "you will be seen around…".
 *
 * §3.6 of the evaluation is blunt about what this can be: HMS measures
 * nothing about how long a consultation takes, so the first implementation is
 * *mechanical and honest* — session start plus (position × a configured
 * average) — rather than a guess dressed as a measurement. What BPJS actually
 * checks at UAT is spike question Q9; the hypothesis is that it checks the
 * field is present and plausible, not that it is accurate.
 *
 * Position is one-based and the first patient waits nothing, so the offset is
 * `(position - 1) × average`: telling the first member of the day that they
 * will be seen fifteen minutes after the session opens would be wrong in the
 * one case the clinic can actually be judged on.
 */
export function estimateAntreanServiceTime(params: {
  sessionStart: Date;
  queuePosition: number;
  averageServiceMinutes: number;
}): number {
  const positionsAhead = Math.max(0, params.queuePosition - 1);
  return (
    params.sessionStart.getTime() +
    positionsAhead * params.averageServiceMinutes * MILLISECONDS_PER_MINUTE
  );
}
