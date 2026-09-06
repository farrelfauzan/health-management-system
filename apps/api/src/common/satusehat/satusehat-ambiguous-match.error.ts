import { SatusehatError } from './satusehat.error';

/**
 * Raised when the SATUSEHAT master patient / practitioner index answers with
 * more than one entry for a single NIK (P10-T10). Carries the match count so
 * callers can audit and explain the refusal; the NIK itself never appears in
 * the message, which is logged and stored on the outbox row.
 *
 * This is permanent by nature — the platform masks NIK in its responses, so no
 * retry can disambiguate; a human resolves it in the SATUSEHAT portal.
 */
export class SatusehatAmbiguousMatchError extends SatusehatError {
  constructor(readonly matchCount: number) {
    super(
      'SATUSEHAT_AMBIGUOUS_MATCH',
      `more than one SATUSEHAT match (${matchCount}) — verify in portal`,
    );
    this.name = 'SatusehatAmbiguousMatchError';
  }
}
