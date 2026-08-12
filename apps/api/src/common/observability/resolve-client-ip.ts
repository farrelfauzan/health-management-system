import { ClientAddressedRequest } from './observability.types';

/**
 * The client address to record on an audit row (SJ-4).
 *
 * Reads Express's own `request.ip`, which already applies the `trust proxy`
 * setting configured at bootstrap: behind a trusted proxy it is the
 * `X-Forwarded-For` entry the proxy vouched for, and with the setting off it
 * is the socket peer. Parsing the header here instead would mean re-deciding
 * how many hops to trust in a second place, and the wrong answer is a
 * client-supplied string written into the audit log as fact.
 *
 * Falls back to the raw socket address so a row is never left without an
 * origin, and to `null` for non-HTTP callers (background jobs) that have none.
 */
export function resolveClientIp(request: ClientAddressedRequest | undefined): string | null {
  return request?.ip ?? request?.socket?.remoteAddress ?? null;
}
