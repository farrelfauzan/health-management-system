import { CheckInWindowDecision } from '@hms/shared-types';

/**
 * The English sentence a refused check-in carries (P19-T16).
 *
 * English on purpose: it is what lands in logs, in an API client that speaks
 * no locale, and in the Swagger example. The web renders its own translated
 * statement from the structured `details` beside it rather than echoing this,
 * so the two never have to agree on wording — only on the hours.
 */
export function buildOutsideSessionMessage(params: {
  doctorName: string;
  decision: CheckInWindowDecision;
}): string {
  const { doctorName, decision } = params;
  const hours = `${decision.sessionStart}-${decision.sessionEnd}`;
  if (decision.reason === 'BEFORE_OPENING') {
    return `${doctorName} practises ${hours} today; check-in opens at ${decision.opensAt}`;
  }
  if (decision.reason === 'AFTER_END') {
    return `${doctorName} practised ${hours} today; check-in for that session has closed`;
  }
  return `${doctorName} has no session today, so this patient can not be checked in`;
}
