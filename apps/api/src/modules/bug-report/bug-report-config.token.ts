/**
 * Injection tokens for the two resolved bug-report configurations (P23-T09,
 * P23-T10).
 *
 * Tokens rather than `ConfigService` reads inside each service, for the reason
 * `NOTION_CONFIG` exists: a provider factory runs while Nest builds the
 * injector, so a malformed or half-set `BUG_TRIAGE_*` variable kills the process
 * at boot with a message naming it — instead of surfacing as a failed triage
 * hours later, in a worker, on a report nobody is watching.
 */
export const BUG_REPORT_TRIAGE_CONFIG = Symbol('BUG_REPORT_TRIAGE_CONFIG');

export const BUG_REPORT_PUBLISH_CONFIG = Symbol('BUG_REPORT_PUBLISH_CONFIG');
