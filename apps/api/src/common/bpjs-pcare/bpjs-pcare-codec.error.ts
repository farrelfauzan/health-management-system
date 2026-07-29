import { BpjsPcareCodecErrorCode } from './bpjs-pcare.types';

/**
 * Typed failure raised by the BPJS PCare request/response codec. Callers
 * branch on {@link code}, never on upstream HTTP details; messages never
 * contain credentials, derived key material, or payload content.
 */
export class BpjsPcareCodecError extends Error {
  constructor(
    readonly code: BpjsPcareCodecErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BpjsPcareCodecError';
  }
}
