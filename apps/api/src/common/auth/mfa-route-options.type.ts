import { MfaTicketPurpose } from '@hms/shared-types';

/**
 * What credential an MFA route accepts (SJ-8).
 *
 * `allowAccessToken` is what makes enrolment reachable from both directions.
 * Someone already signed in — a user enrolling voluntarily, or a privileged
 * user acting inside the grace period — presents an ordinary access token.
 * Someone whose login was refused for want of a second factor has no access
 * token to present and arrives holding an enrolment ticket instead. The
 * challenge route sets it to false: a caller who already holds an access token
 * has nothing left to prove.
 */
export type MfaRouteOptions = {
  readonly purpose: MfaTicketPurpose;
  readonly allowAccessToken: boolean;
};
