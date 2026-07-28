import { SatusehatError } from './satusehat.error';

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
 * `SATUSEHAT_TIMEOUT`, everything else (DNS, TLS, connection reset) becomes
 * `SATUSEHAT_UNAVAILABLE`. Checks the `name` structurally because Node's
 * `DOMException` is not an `instanceof Error`.
 */
export function mapSatusehatTransportError(caughtError: unknown): SatusehatError {
  if (caughtError instanceof SatusehatError) {
    return caughtError;
  }
  const errorName = readErrorName(caughtError);
  if (errorName !== undefined && TIMEOUT_ERROR_NAMES.includes(errorName)) {
    return new SatusehatError('SATUSEHAT_TIMEOUT', 'SATUSEHAT request timed out');
  }
  return new SatusehatError('SATUSEHAT_UNAVAILABLE', 'SATUSEHAT is unreachable');
}
