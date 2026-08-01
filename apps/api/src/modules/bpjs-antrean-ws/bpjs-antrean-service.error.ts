/**
 * A *business* refusal on the inbound Antrean surface (P14-T04): the caller is
 * genuinely BPJS and genuinely authorised, but the clinic cannot honour what
 * was asked — an unmapped poli, a shift with no session, a session that is
 * full, a booking that does not exist.
 *
 * Deliberately a different type from {@link BpjsAntreanInboundError}, which
 * means "we refused to talk to you". The distinction matters at both ends:
 * BPJS sees a readable Indonesian message it can put on the member's screen
 * instead of a bare 401, and the audit trail can tell a security event apart
 * from a scheduling one.
 *
 * Messages here are the one place in this module where detail is *good*. The
 * failure lands on a member who already has a queue screen open, and §4.3 is
 * explicit: refusing legibly beats accepting a booking the clinic cannot keep.
 */
export class BpjsAntreanServiceError extends Error {
  constructor(
    readonly metaDataCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'BpjsAntreanServiceError';
  }
}
