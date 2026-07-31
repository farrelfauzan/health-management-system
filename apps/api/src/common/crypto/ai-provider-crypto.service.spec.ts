import { ConfigService } from '@nestjs/config';

import { AiProviderCryptoService } from './ai-provider-crypto.service';

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 0x3c).toString('base64');

function buildService(env: Record<string, string>): AiProviderCryptoService {
  return new AiProviderCryptoService(new ConfigService(env));
}

describe('AiProviderCryptoService', () => {
  it('round-trips a sealed API key', () => {
    const service = buildService({ AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
    const inputApiKey = 'sk-proj-abc123def456';

    const actualSealed = service.sealApiKey(inputApiKey);
    const actualRevealed = service.revealApiKey(actualSealed.ciphertext);

    expect(actualRevealed).toBe(inputApiKey);
    expect(actualSealed.keyVersion).toBe(1);
    expect(actualSealed.ciphertext).not.toContain(inputApiKey);
  });

  it('produces a different ciphertext for the same value on every seal', () => {
    const service = buildService({ AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });

    const actualFirst = service.sealApiKey('same-value');
    const actualSecond = service.sealApiKey('same-value');

    expect(actualSecond.ciphertext).not.toBe(actualFirst.ciphertext);
  });

  it('masks an API key to its last four characters', () => {
    const service = buildService({ AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });

    expect(service.maskApiKey('sk-proj-abc123def456')).toBe('f456');
  });

  it('reports unconfigured and refuses to seal without the key', () => {
    const service = buildService({});

    expect(service.isConfigured).toBe(false);
    expect(() => service.sealApiKey('value')).toThrow('AI_PROVIDER_ENCRYPTION_KEY must be set');
  });

  it('rejects a tampered ciphertext', () => {
    const service = buildService({ AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY });
    const sealed = service.sealApiKey('sk-proj-abc123def456');
    const tamperedPayload = Buffer.from(sealed.ciphertext, 'base64');
    const lastByteOffset = tamperedPayload.length - 1;
    tamperedPayload.writeUInt8(tamperedPayload.readUInt8(lastByteOffset) ^ 0xff, lastByteOffset);

    expect(() => service.revealApiKey(tamperedPayload.toString('base64'))).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() =>
      buildService({ AI_PROVIDER_ENCRYPTION_KEY: Buffer.alloc(16, 0x01).toString('base64') }),
    ).toThrow('must decode to 32 bytes');
  });

  it('reads the key version override', () => {
    const service = buildService({
      AI_PROVIDER_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      AI_PROVIDER_KEY_VERSION: '2',
    });

    expect(service.keyVersion).toBe(2);
    expect(service.sealApiKey('value').keyVersion).toBe(2);
  });
});
