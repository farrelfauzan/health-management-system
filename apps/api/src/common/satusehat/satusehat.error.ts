import { SatusehatErrorCode } from './satusehat.types';

/**
 * Typed failure raised by the SATUSEHAT adapter layer. Domain services and the
 * submission worker branch on {@link code}, never on upstream HTTP details;
 * messages never contain credentials, tokens, or payload content.
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
