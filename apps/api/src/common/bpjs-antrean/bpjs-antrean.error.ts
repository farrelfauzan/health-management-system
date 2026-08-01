import { BpjsAntreanErrorCode } from './bpjs-antrean.types';

/**
 * Typed failure raised by the BPJS Antrean adapter layer. Domain services
 * branch on {@link code}, never on upstream HTTP details; messages never
 * contain credentials, derived keys, or payload content — `metaData.message`
 * text from BPJS is the only upstream detail carried through, because the
 * admin needs BPJS's own readable reason.
 *
 * A separate vocabulary from `BpjsPcareError`'s on purpose: an antrean
 * failure must be legible as an antrean failure on the ops surfaces, and the
 * two services fail independently.
 */
export class BpjsAntreanError extends Error {
  constructor(
    readonly code: BpjsAntreanErrorCode,
    message: string,
    readonly upstreamStatusCode?: number,
  ) {
    super(message);
    this.name = 'BpjsAntreanError';
  }
}
