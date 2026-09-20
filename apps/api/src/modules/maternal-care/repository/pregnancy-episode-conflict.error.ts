/**
 * A second ACTIVE episode was refused by the partial unique index (P25-T06).
 *
 * A typed error rather than a leaked Prisma code, so the service can answer
 * 409 `PREGNANCY_EPISODE_ALREADY_ACTIVE` without knowing what a `P2002` is —
 * and so the race (two tabs, same millisecond) and the ordinary case (someone
 * opened one an hour ago) read identically to the caller, because to her they
 * are the same thing.
 */
export class PregnancyEpisodeConflictError extends Error {
  constructor() {
    super('Patient already has an active pregnancy episode');
    this.name = 'PregnancyEpisodeConflictError';
  }
}
