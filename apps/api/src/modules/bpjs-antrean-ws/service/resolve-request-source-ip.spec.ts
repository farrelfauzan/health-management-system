import { resolveRequestSourceIp } from './resolve-request-source-ip';

function buildRequest(params: { socketAddress?: string; forwardedFor?: string }) {
  return {
    headers: params.forwardedFor === undefined ? {} : { 'x-forwarded-for': params.forwardedFor },
    socket: { remoteAddress: params.socketAddress },
  };
}

describe('resolveRequestSourceIp', () => {
  it('ignores X-Forwarded-For entirely when no proxy hop is trusted', () => {
    // The header is attacker-controlled unless something in front rewrites it.
    // A deployment that has not been told it sits behind a proxy must not
    // accept a header claiming it does — otherwise the allowlist is bypassable
    // with one curl flag.
    const inputRequest = buildRequest({
      socketAddress: '198.51.100.4',
      forwardedFor: '203.0.113.7',
    });

    expect(resolveRequestSourceIp(inputRequest, 0)).toBe('198.51.100.4');
  });

  it('reads one trusted hop from the right of the chain', () => {
    const inputRequest = buildRequest({
      socketAddress: '10.0.0.1',
      forwardedFor: '203.0.113.7',
    });

    expect(resolveRequestSourceIp(inputRequest, 1)).toBe('203.0.113.7');
  });

  it('ignores caller-supplied entries to the left of the trusted hops', () => {
    // A caller can prepend anything; only the rightmost entries were appended
    // by proxies the operator vouched for.
    const inputRequest = buildRequest({
      socketAddress: '10.0.0.1',
      forwardedFor: '1.2.3.4, 5.6.7.8, 203.0.113.7',
    });

    expect(resolveRequestSourceIp(inputRequest, 1)).toBe('203.0.113.7');
    expect(resolveRequestSourceIp(inputRequest, 2)).toBe('5.6.7.8');
  });

  it('falls back to the socket address when the header is absent or empty', () => {
    expect(resolveRequestSourceIp(buildRequest({ socketAddress: '10.0.0.1' }), 2)).toBe('10.0.0.1');
    expect(
      resolveRequestSourceIp(buildRequest({ socketAddress: '10.0.0.1', forwardedFor: '  ' }), 2),
    ).toBe('10.0.0.1');
  });

  it('clamps to the leftmost entry when more hops are trusted than were sent', () => {
    // Trusting three hops but receiving one means the chain was shorter than
    // configured. Returning the leftmost entry is the conservative reading:
    // it is the address furthest from HMS and the least likely to be a proxy
    // the allowlist would accept.
    const inputRequest = buildRequest({ socketAddress: '10.0.0.1', forwardedFor: '203.0.113.7' });

    expect(resolveRequestSourceIp(inputRequest, 3)).toBe('203.0.113.7');
  });

  it('returns null when there is no address at all', () => {
    expect(resolveRequestSourceIp({ headers: {} }, 0)).toBeNull();
  });
});
