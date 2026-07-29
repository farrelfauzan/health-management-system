import { BpjsPcareError } from './bpjs-pcare.error';

const TIMEOUT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];

function readErrorName(caughtError: unknown): string | undefined {
  if (typeof caughtError === 'object' && caughtError !== null && 'name' in caughtError) {
    return String((caughtError as { name: unknown }).name);
  }
  return undefined;
}

/**
 * Maps a `fetch` rejection (the request never produced an HTTP response) to a
 * typed adapter error: aborts from `AbortSignal.timeout` become
 * `BPJS_PCARE_TIMEOUT`, everything else (DNS, TLS, connection reset) becomes
 * `BPJS_PCARE_UNAVAILABLE`. Checks the `name` structurally because Node's
 * `DOMException` is not an `instanceof Error`.
 */
export function mapBpjsPcareTransportError(caughtError: unknown): BpjsPcareError {
  if (caughtError instanceof BpjsPcareError) {
    return caughtError;
  }
  const errorName = readErrorName(caughtError);
  if (errorName !== undefined && TIMEOUT_ERROR_NAMES.includes(errorName)) {
    return new BpjsPcareError('BPJS_PCARE_TIMEOUT', 'BPJS PCare request timed out');
  }
  return new BpjsPcareError('BPJS_PCARE_UNAVAILABLE', 'BPJS PCare is unreachable');
}
