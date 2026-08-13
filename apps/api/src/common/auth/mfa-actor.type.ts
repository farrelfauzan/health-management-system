/**
 * Who is calling an MFA route, and on the strength of what (SJ-8).
 *
 * `viaTicket` is not decoration. An enrolment reached with a half-authenticated
 * ticket must finish by issuing real tokens — the user has no session to
 * return to — whereas one reached with an access token must not, because
 * minting a second session for someone who already has one is how you end up
 * with a refresh-token family nobody can account for.
 */
export type MfaActor = {
  readonly userId: string;
  readonly viaTicket: boolean;
};
