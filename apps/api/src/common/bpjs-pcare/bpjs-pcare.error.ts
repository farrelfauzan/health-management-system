import { BpjsPcareErrorCode } from './bpjs-pcare.types';

/**
 * Typed failure raised by the BPJS PCare adapter layer. Domain services
 * branch on {@link code}, never on upstream HTTP details; messages never
 * contain credentials, derived keys, or payload content — `metaData.message`
 * text from PCare is the only upstream detail carried through, because the
 * front desk needs BPJS's own readable reason.
 */
export class BpjsPcareError extends Error {
  constructor(
    readonly code: BpjsPcareErrorCode,
    message: string,
    readonly upstreamStatusCode?: number,
  ) {
    super(message);
    this.name = 'BpjsPcareError';
  }
}
