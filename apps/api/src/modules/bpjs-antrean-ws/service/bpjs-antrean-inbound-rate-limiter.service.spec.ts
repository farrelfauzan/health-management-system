import { BpjsAntreanInboundRateLimiter } from './bpjs-antrean-inbound-rate-limiter.service';

describe('BpjsAntreanInboundRateLimiter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests up to the limit and refuses the next one', () => {
    const rateLimiter = new BpjsAntreanInboundRateLimiter();

    const actualOutcomes = [1, 2, 3, 4].map(() =>
      rateLimiter.tryConsume({ key: 'AMBIL_ANTREAN|203.0.113.7', limitPerMinute: 3 }),
    );

    expect(actualOutcomes).toEqual([true, true, true, false]);
  });

  it('counts each source separately', () => {
    // BPJS legitimately calls from several addresses; one of them being noisy
    // must not lock the whole clinic out of Mobile JKN.
    const rateLimiter = new BpjsAntreanInboundRateLimiter();
    rateLimiter.tryConsume({ key: 'AMBIL_ANTREAN|203.0.113.7', limitPerMinute: 1 });

    const actualOtherSource = rateLimiter.tryConsume({
      key: 'AMBIL_ANTREAN|203.0.113.8',
      limitPerMinute: 1,
    });

    expect(actualOtherSource).toBe(true);
  });

  it('counts each endpoint separately', () => {
    const rateLimiter = new BpjsAntreanInboundRateLimiter();
    rateLimiter.tryConsume({ key: 'AMBIL_ANTREAN|203.0.113.7', limitPerMinute: 1 });

    const actualOtherEndpoint = rateLimiter.tryConsume({
      key: 'STATUS_ANTREAN|203.0.113.7',
      limitPerMinute: 1,
    });

    expect(actualOtherEndpoint).toBe(true);
  });

  it('starts a fresh budget after the window elapses', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const rateLimiter = new BpjsAntreanInboundRateLimiter();
    rateLimiter.tryConsume({ key: 'TOKEN|203.0.113.7', limitPerMinute: 1 });
    expect(rateLimiter.tryConsume({ key: 'TOKEN|203.0.113.7', limitPerMinute: 1 })).toBe(false);

    jest.setSystemTime(new Date('2026-08-01T00:01:01.000Z'));

    expect(rateLimiter.tryConsume({ key: 'TOKEN|203.0.113.7', limitPerMinute: 1 })).toBe(true);
  });

  it('treats a zero limit as closed, not as unlimited', () => {
    // "No budget" has exactly one safe reading on a public write path.
    const rateLimiter = new BpjsAntreanInboundRateLimiter();

    expect(rateLimiter.tryConsume({ key: 'PASIEN_BARU|203.0.113.7', limitPerMinute: 0 })).toBe(
      false,
    );
  });
});
