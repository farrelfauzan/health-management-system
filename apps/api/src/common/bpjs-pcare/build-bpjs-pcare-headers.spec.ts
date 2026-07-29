import { buildBpjsPcareHeaders } from './build-bpjs-pcare-headers';
import { BpjsPcareRequestCredentials } from './bpjs-pcare.types';

/**
 * Expected values are pinned fixtures generated for the P11-T01 spike and
 * cross-checked against an independent implementation (openssl CLI:
 * `printf '20250001&1753776000' | openssl dgst -sha256 -hmac '0kSp1keSecretKey'
 * -binary | base64`). All credential values are synthetic.
 */
describe('buildBpjsPcareHeaders', () => {
  const inputCredentials: BpjsPcareRequestCredentials = {
    consId: '20250001',
    secretKey: '0kSp1keSecretKey',
    userKey: 'b1a2c3d4e5f60718293a4b5c6d7e8f90',
    pcareUsername: 'klinik-demo',
    pcarePassword: 'RahasiaPcare123',
  };
  const inputTimestampSeconds = 1_753_776_000;

  it('builds the five PCare headers with the pinned HMAC-SHA256 signature', () => {
    const actualHeaders = buildBpjsPcareHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });

    expect(actualHeaders).toEqual({
      'X-cons-id': '20250001',
      'X-Timestamp': '1753776000',
      'X-Signature': 'Lj1ofYkbV4gZZSkaF9T6SkzdHBxjBXdeL1RYElBfmVY=',
      'X-Authorization': 'Basic a2xpbmlrLWRlbW86UmFoYXNpYVBjYXJlMTIzOjA5NQ==',
      user_key: 'b1a2c3d4e5f60718293a4b5c6d7e8f90',
    });
  });

  it('encodes X-Authorization as Basic base64 of username:password:095', () => {
    const actualHeaders = buildBpjsPcareHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });

    const actualDecodedAuthorization = Buffer.from(
      actualHeaders['X-Authorization'].replace('Basic ', ''),
      'base64',
    ).toString('utf8');
    expect(actualDecodedAuthorization).toBe('klinik-demo:RahasiaPcare123:095');
  });

  it('signs consId&timestamp so a different timestamp yields a different signature', () => {
    const actualFirst = buildBpjsPcareHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });
    const actualSecond = buildBpjsPcareHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds + 1,
    });

    expect(actualSecond['X-Signature']).not.toBe(actualFirst['X-Signature']);
    expect(actualSecond['X-Timestamp']).toBe('1753776001');
  });
});
