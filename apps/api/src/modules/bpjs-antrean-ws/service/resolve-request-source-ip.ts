/**
 * The request shape this module reads. Deliberately narrow: the guards must
 * not be able to reach anything else on the framework request object.
 */
export type SourceAddressRequest = {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly socket?: { readonly remoteAddress?: string };
  readonly ip?: string;
};

const FORWARDED_FOR_HEADER = 'x-forwarded-for';

/**
 * Resolves the address an allowlist decision is made against.
 *
 * `X-Forwarded-For` is attacker-controlled unless something in front of HMS
 * rewrites it, so it is used **only** as far as the operator has declared
 * trusted hops. With the default of zero hops the socket address wins and the
 * header is ignored entirely — a deployment that has not been told it sits
 * behind a proxy must not accept a header that says it does.
 *
 * With `trustedProxyHopCount = n`, the address `n` positions from the right of
 * the chain is used: the rightmost entries are the ones the trusted proxies
 * appended and therefore the ones that cannot be forged, while everything to
 * the left was supplied by the caller.
 */
export function resolveRequestSourceIp(
  request: SourceAddressRequest,
  trustedProxyHopCount: number,
): string | null {
  const socketAddress = request.socket?.remoteAddress ?? request.ip ?? null;
  if (trustedProxyHopCount <= 0) {
    return socketAddress;
  }
  const chain = readForwardedChain(request);
  if (chain.length === 0) {
    return socketAddress;
  }
  const index = chain.length - trustedProxyHopCount;
  return chain[index] ?? chain[0] ?? socketAddress;
}

function readForwardedChain(request: SourceAddressRequest): string[] {
  const rawHeader = request.headers[FORWARDED_FOR_HEADER];
  const headerValue = Array.isArray(rawHeader) ? rawHeader.join(',') : rawHeader;
  if (headerValue === undefined || headerValue.trim() === '') {
    return [];
  }
  return headerValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}
