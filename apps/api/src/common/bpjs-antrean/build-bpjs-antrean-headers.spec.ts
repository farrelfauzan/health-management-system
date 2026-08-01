import { createHmac } from 'node:crypto';

import { buildBpjsAntreanHeaders } from './build-bpjs-antrean-headers';
import { BpjsAntreanRequestCredentials } from './bpjs-antrean.types';

describe('buildBpjsAntreanHeaders', () => {
  const inputCredentials: BpjsAntreanRequestCredentials = {
    consId: '20250001',
    secretKey: '0kSp1keSecretKey',
    userKey: 'b1a2c3d4e5f60718293a4b5c6d7e8f90',
  };
  const inputTimestampSeconds = 1_767_225_600;

  it('signs consId and timestamp with the secret key, base64-encoded', () => {
    const expectedSignature = createHmac('sha256', inputCredentials.secretKey)
      .update(`${inputCredentials.consId}&${inputTimestampSeconds}`)
      .digest('base64');

    const actualHeaders = buildBpjsAntreanHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });

    expect(actualHeaders['X-Signature']).toBe(expectedSignature);
    expect(actualHeaders['X-Timestamp']).toBe(String(inputTimestampSeconds));
    expect(actualHeaders['X-cons-id']).toBe(inputCredentials.consId);
    expect(actualHeaders.user_key).toBe(inputCredentials.userKey);
  });

  it('carries exactly four headers — no X-Authorization, because Antrean has no PCare login', () => {
    const actualHeaders = buildBpjsAntreanHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });

    expect(Object.keys(actualHeaders).sort()).toEqual([
      'X-Signature',
      'X-Timestamp',
      'X-cons-id',
      'user_key',
    ]);
  });

  it('produces a different signature for a different timestamp', () => {
    const actualFirst = buildBpjsAntreanHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds,
    });
    const actualSecond = buildBpjsAntreanHeaders({
      credentials: inputCredentials,
      timestampSeconds: inputTimestampSeconds + 1,
    });

    expect(actualSecond['X-Signature']).not.toBe(actualFirst['X-Signature']);
  });
});
