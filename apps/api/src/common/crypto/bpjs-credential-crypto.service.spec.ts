import { ConfigService } from '@nestjs/config';

import { BpjsCredentialCryptoService } from './bpjs-credential-crypto.service';

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString('base64');

function buildService(env: Record<string, string>): BpjsCredentialCryptoService {
  return new BpjsCredentialCryptoService(new ConfigService(env));
}

describe('BpjsCredentialCryptoService', () => {
  it('round-trips a sealed credential', () => {
    const service = buildService({ BPJS_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
    const inputSecret = 'RahasiaPcare123';

    const actualSealed = service.sealCredential(inputSecret);
    const actualRevealed = service.revealCredential(actualSealed.ciphertext);

    expect(actualRevealed).toBe(inputSecret);
    expect(actualSealed.keyVersion).toBe(1);
    expect(actualSealed.ciphertext).not.toContain(inputSecret);
  });

  it('produces a different ciphertext for the same value on every seal', () => {
    const service = buildService({ BPJS_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });

    const actualFirst = service.sealCredential('same-value');
    const actualSecond = service.sealCredential('same-value');

    expect(actualSecond.ciphertext).not.toBe(actualFirst.ciphertext);
  });

  it('masks a credential to its last four characters', () => {
    const service = buildService({ BPJS_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });

    expect(service.maskCredential('abcdef123456')).toBe('3456');
  });

  it('reports unconfigured and refuses to seal without the key', () => {
    const service = buildService({});

    expect(service.isConfigured).toBe(false);
    expect(() => service.sealCredential('value')).toThrow(
      'BPJS_CREDENTIAL_ENCRYPTION_KEY must be set',
    );
  });

  it('rejects a tampered ciphertext', () => {
    const service = buildService({ BPJS_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
    const sealed = service.sealCredential('RahasiaPcare123');
    const tamperedPayload = Buffer.from(sealed.ciphertext, 'base64');
    const lastByteOffset = tamperedPayload.length - 1;
    tamperedPayload.writeUInt8(tamperedPayload.readUInt8(lastByteOffset) ^ 0xff, lastByteOffset);

    expect(() => service.revealCredential(tamperedPayload.toString('base64'))).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() =>
      buildService({ BPJS_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(16, 0x01).toString('base64') }),
    ).toThrow('must decode to 32 bytes');
  });

  it('reads the key version override', () => {
    const service = buildService({
      BPJS_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      BPJS_CREDENTIAL_KEY_VERSION: '3',
    });

    expect(service.keyVersion).toBe(3);
    expect(service.sealCredential('value').keyVersion).toBe(3);
  });
});
