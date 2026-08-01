import { BpjsAntreanInboundRejectionReason } from '@hms/shared-types';

/**
 * A refusal on the inbound Antrean surface (P14-T04).
 *
 * Separate from `BpjsAntreanError`, which describes an *outbound* call
 * failing: this one describes HMS refusing BPJS, and the two must not be
 * confused on an ops screen. It carries the BPJS-facing `metaData.code` and
 * message alongside the internal reason, because the caller only ever sees
 * BPJS's envelope and the audit trail only ever sees the reason.
 *
 * The message that reaches BPJS is deliberately coarse — "unauthorized",
 * never "no such username" — while the audited reason is precise. An
 * endpoint reachable from the public internet should not narrate which half
 * of a credential pair was wrong.
 */
export class BpjsAntreanInboundError extends Error {
  constructor(
    readonly reason: BpjsAntreanInboundRejectionReason,
    readonly metaDataCode: number,
    readonly clientMessage: string,
  ) {
    super(`${reason}: ${clientMessage}`);
    this.name = 'BpjsAntreanInboundError';
  }
}
