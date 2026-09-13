import { isAxiosError } from 'axios';

/**
 * Maps a failed manual IHS link (P21-T08) to the copy that says what to do next:
 *
 * - 400 the number could not be an IHS id — check what was typed;
 * - 404 SATUSEHAT holds no practitioner under it — check it in the portal;
 * - 409 the doctor is already linked elsewhere, or the NIK digits prove the
 *   number belongs to somebody else;
 * - 503 the integration is not configured for this deployment;
 * - anything else — SATUSEHAT is unreachable, so try again.
 */
export function resolveSatusehatIhsLinkErrorKey(
  error: unknown,
): 'invalid' | 'notFound' | 'conflict' | 'notConfigured' | 'unreachable' {
  if (!isAxiosError(error)) {
    return 'unreachable';
  }
  switch (error.response?.status) {
    case 400:
      return 'invalid';
    case 404:
      return 'notFound';
    case 409:
      return 'conflict';
    case 503:
      return 'notConfigured';
    default:
      return 'unreachable';
  }
}
