import { SatusehatErrorCode } from './satusehat.types';

/**
 * Typed failure raised by the SATUSEHAT adapter layer. Domain services and the
 * submission worker branch on {@link code}, never on upstream HTTP details;
 * messages never contain credentials, tokens, or payload content.
 *
 * Codes:
 * - `SATUSEHAT_NOT_CONFIGURED` — the deployment has no credentials or ids.
 * - `SATUSEHAT_UNAUTHORIZED` — the platform rejected the clinic credentials.
 * - `SATUSEHAT_TIMEOUT` / `SATUSEHAT_UNAVAILABLE` — transient transport
 *   failures; retrying can resolve them.
 * - `SATUSEHAT_CIRCUIT_OPEN` — the breaker is shedding load.
 * - `SATUSEHAT_REQUEST_REJECTED` — the platform refused the payload; retrying
 *   the same payload cannot resolve it.
 * - `SATUSEHAT_AMBIGUOUS_MATCH` — the master patient index returned more than
 *   one entry for one NIK (P10-T10). Permanent by nature: the platform masks
 *   NIK in its responses, so nothing in the code can pick the right record,
 *   and a retry would face the same ambiguity. A human resolves it in the
 *   SATUSEHAT portal. The message carries the match count, never the NIK.
 */
export class SatusehatError extends Error {
  constructor(
    readonly code: SatusehatErrorCode,
    message: string,
    readonly upstreamStatusCode?: number,
  ) {
    super(message);
    this.name = 'SatusehatError';
  }
}
