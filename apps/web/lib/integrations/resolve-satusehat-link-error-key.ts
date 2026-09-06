import { isAxiosError } from 'axios';

/**
 * Maps a failed link attempt to the i18n key that explains it to the front
 * desk. Each status is a different next action, which is the whole point of
 * writing copy per status rather than surfacing the API's own message:
 *
 * - 422 the record is incomplete — fill in the NIK;
 * - 404 the NIK is not in the master index — check the digits;
 * - 409 more than one match (P10-T10) — a human resolves it in the portal, and
 *   no amount of retrying here will help;
 * - 503 the integration is not configured for this deployment — an admin's
 *   problem, not the counter's;
 * - anything else, including 502 — SATUSEHAT is unreachable, so try again.
 */
export type SatusehatLinkErrorKey =
  | 'missingNik'
  | 'notFound'
  | 'ambiguous'
  | 'notConfigured'
  | 'unreachable';

export function resolveSatusehatLinkErrorKey(error: unknown): SatusehatLinkErrorKey {
  if (!isAxiosError(error)) {
    return 'unreachable';
  }
  switch (error.response?.status) {
    case 422:
      return 'missingNik';
    case 404:
      return 'notFound';
    case 409:
      return 'ambiguous';
    case 503:
      return 'notConfigured';
    default:
      return 'unreachable';
  }
}
