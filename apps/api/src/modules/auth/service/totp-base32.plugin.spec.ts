import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node';
import { TOTP } from '@otplib/totp';

import { createTotpBase32Plugin } from './totp-base32.plugin';

/**
 * SJ-8 — proof that the codec swap did not change what a phone sees.
 *
 * The interop cases below are the RFC 6238 Appendix B vectors, run against the
 * exact plugin pair `MfaService` constructs. They are the reason this file
 * exists: swapping otplib's base32 plugin for a CommonJS one is only safe if
 * the resulting codes are still the codes every authenticator app computes,
 * and a round-trip test alone would not catch a codec that is
 * self-consistent but wrong.
 */
describe('createTotpBase32Plugin', () => {
  const base32 = createTotpBase32Plugin();

  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('encodes %p as the RFC 4648 vector, unpadded', (inputText, expectedBase32) => {
    const actualEncoded = base32.encode(new TextEncoder().encode(inputText));

    expect(actualEncoded).toBe(expectedBase32);
  });

  it('decodes a padded secret, because pasted values often carry padding', () => {
    const actualDecoded = base32.decode('MZXW6YTBOI======');

    expect(Buffer.from(actualDecoded).toString('utf8')).toBe('foobar');
  });

  it('decodes lower case, because users transcribe secrets by hand', () => {
    const actualDecoded = base32.decode('mzxw6ytboi');

    expect(Buffer.from(actualDecoded).toString('utf8')).toBe('foobar');
  });

  describe('RFC 6238 interoperability', () => {
    // The published test key, "12345678901234567890" in ASCII.
    const inputSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const totp = new TOTP({
      algorithm: 'sha1',
      digits: 8,
      period: 30,
      crypto: new NodeCryptoPlugin(),
      base32: createTotpBase32Plugin(),
    });

    it.each([
      [59, '94287082'],
      [1111111109, '07081804'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ])('produces the published code at epoch %i', async (inputEpoch, expectedCode) => {
      const actualCode = await totp.generate({ secret: inputSecret, epoch: inputEpoch });

      expect(actualCode).toBe(expectedCode);
    });
  });
});
