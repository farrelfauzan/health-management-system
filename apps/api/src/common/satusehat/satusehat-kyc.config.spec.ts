import { generateKeyPairSync } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { resolveSatusehatKycConfig } from './satusehat-kyc.config';

function buildConfigService(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function generatePemPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

const CREDENTIALS: Record<string, string> = {
  SATUSEHAT_ORGANIZATION_ID: 'org-id',
  SATUSEHAT_CLIENT_ID: 'client-id',
  SATUSEHAT_CLIENT_SECRET: 'client-secret',
};

describe('resolveSatusehatKycConfig (P24-T14)', () => {
  const deployment = generatePemPair();
  const server = generatePemPair();
  const fullKeys: Record<string, string> = {
    ...CREDENTIALS,
    SATUSEHAT_KYC_PRIVATE_KEY: deployment.privateKeyPem,
    SATUSEHAT_KYC_PUBLIC_KEY: deployment.publicKeyPem,
    SATUSEHAT_KYC_SERVER_PUBLIC_KEY: server.publicKeyPem,
  };

  it('enables KYC when the three PEMs parse and the pair matches', () => {
    const actual = resolveSatusehatKycConfig(buildConfigService(fullKeys));

    expect(actual.isEnabled).toBe(true);
    if (actual.isEnabled) {
      expect(actual.privateKey.asymmetricKeyType).toBe('rsa');
      expect(actual.serverPublicKey.asymmetricKeyType).toBe('rsa');
      expect(actual.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    }
  });

  it('reports SATUSEHAT itself unconfigured before looking at any key', () => {
    const actual = resolveSatusehatKycConfig(
      buildConfigService({ SATUSEHAT_KYC_PRIVATE_KEY: deployment.privateKeyPem }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'SATUSEHAT_NOT_CONFIGURED' });
  });

  it('disables KYC with a reason when no key is set, without throwing', () => {
    const actual = resolveSatusehatKycConfig(buildConfigService(CREDENTIALS));

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'KYC_KEYS_NOT_CONFIGURED' });
  });

  it('treats an empty string as unset, the way CI secrets expand', () => {
    const actual = resolveSatusehatKycConfig(
      buildConfigService({
        ...CREDENTIALS,
        SATUSEHAT_KYC_PRIVATE_KEY: '',
        SATUSEHAT_KYC_PUBLIC_KEY: '  ',
        SATUSEHAT_KYC_SERVER_PUBLIC_KEY: '',
      }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'KYC_KEYS_NOT_CONFIGURED' });
  });

  it('refuses a partial set as incomplete rather than half-enabling', () => {
    const actual = resolveSatusehatKycConfig(
      buildConfigService({ ...fullKeys, SATUSEHAT_KYC_SERVER_PUBLIC_KEY: '' }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'KYC_KEYS_INCOMPLETE' });
  });

  it.each([
    ['SATUSEHAT_KYC_PRIVATE_KEY', 'KYC_PRIVATE_KEY_INVALID'],
    ['SATUSEHAT_KYC_PUBLIC_KEY', 'KYC_PUBLIC_KEY_INVALID'],
    ['SATUSEHAT_KYC_SERVER_PUBLIC_KEY', 'KYC_SERVER_PUBLIC_KEY_INVALID'],
  ])('names the unparsable key when %s is garbage', (variable, expectedReason) => {
    const actual = resolveSatusehatKycConfig(
      buildConfigService({ ...fullKeys, [variable]: 'not a pem' }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: expectedReason });
  });

  it('refuses a public key that does not belong to the private key', () => {
    const stranger = generatePemPair();

    const actual = resolveSatusehatKycConfig(
      buildConfigService({ ...fullKeys, SATUSEHAT_KYC_PUBLIC_KEY: stranger.publicKeyPem }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'KYC_KEY_PAIR_MISMATCH' });
  });

  it('accepts a PEM whose line breaks arrived escaped, as env files carry them', () => {
    const escape = (pem: string): string => pem.replace(/\n/g, '\\n');

    const actual = resolveSatusehatKycConfig(
      buildConfigService({
        ...CREDENTIALS,
        SATUSEHAT_KYC_PRIVATE_KEY: escape(deployment.privateKeyPem),
        SATUSEHAT_KYC_PUBLIC_KEY: escape(deployment.publicKeyPem),
        SATUSEHAT_KYC_SERVER_PUBLIC_KEY: escape(server.publicKeyPem),
      }),
    );

    expect(actual.isEnabled).toBe(true);
  });

  it('disables KYC when its URL points at a different platform than the FHIR URL', () => {
    const actual = resolveSatusehatKycConfig(
      buildConfigService({
        ...fullKeys,
        SATUSEHAT_FHIR_BASE_URL: 'https://api-satusehat.dto.kemkes.go.id/fhir-r4/v1',
        SATUSEHAT_KYC_BASE_URL: 'https://api-satusehat-stg.dto.kemkes.go.id/kyc/v1',
      }),
    );

    expect(actual).toEqual({ isEnabled: false, disabledReason: 'KYC_PLATFORM_MISMATCH' });
  });
});
