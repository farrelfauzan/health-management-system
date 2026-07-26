import { ConfigService } from '@nestjs/config';

import { PatientIdentifierCryptoService } from './patient-identifier-crypto.service';

const inputEncryptionKey = Buffer.alloc(32, 1).toString('base64');
const inputIndexKey = Buffer.alloc(32, 2).toString('base64');

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    PATIENT_PII_ENCRYPTION_KEY: inputEncryptionKey,
    PATIENT_PII_INDEX_KEY: inputIndexKey,
    ...overrides,
  };
  return {
    get: (key: string): string | undefined => values[key],
  } as unknown as ConfigService;
}

describe('PatientIdentifierCryptoService', () => {
  const service = new PatientIdentifierCryptoService(buildConfigService());

  describe('configuration', () => {
    it('rejects a missing encryption key', () => {
      const inputConfigService = buildConfigService({ PATIENT_PII_ENCRYPTION_KEY: '' });
      expect(() => new PatientIdentifierCryptoService(inputConfigService)).toThrow(
        /PATIENT_PII_ENCRYPTION_KEY must be set/,
      );
    });

    it('rejects a key that does not decode to 32 bytes', () => {
      const inputConfigService = buildConfigService({
        PATIENT_PII_INDEX_KEY: Buffer.alloc(16, 3).toString('base64'),
      });
      expect(() => new PatientIdentifierCryptoService(inputConfigService)).toThrow(
        /must decode to 32 bytes/,
      );
    });

    it('rejects reusing one key for both ciphertext and blind index', () => {
      const inputConfigService = buildConfigService({ PATIENT_PII_INDEX_KEY: inputEncryptionKey });
      expect(() => new PatientIdentifierCryptoService(inputConfigService)).toThrow(/must differ/);
    });

    it('accepts a hex-encoded key', () => {
      const inputConfigService = buildConfigService({
        PATIENT_PII_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('hex'),
      });
      expect(() => new PatientIdentifierCryptoService(inputConfigService)).not.toThrow();
    });
  });

  describe('encryptSearchableIdentifier', () => {
    it('round-trips the plaintext identifier', () => {
      const inputNik = '3201011234567890';
      const actual = service.encryptSearchableIdentifier(inputNik);
      expect(service.decryptIdentifier(actual.ciphertext)).toBe(inputNik);
    });

    it('produces different ciphertext for the same value on every call', () => {
      const inputNik = '3201011234567890';
      const actualFirst = service.encryptSearchableIdentifier(inputNik);
      const actualSecond = service.encryptSearchableIdentifier(inputNik);
      expect(actualFirst.ciphertext).not.toBe(actualSecond.ciphertext);
    });

    it('produces a deterministic blind index for the same value', () => {
      const inputNik = '3201011234567890';
      const actualFirst = service.encryptSearchableIdentifier(inputNik);
      const actualSecond = service.encryptSearchableIdentifier(inputNik);
      expect(actualFirst.index).toBe(actualSecond.index);
    });

    it('produces different blind indexes for different values', () => {
      const actualFirst = service.encryptSearchableIdentifier('3201011234567890');
      const actualSecond = service.encryptSearchableIdentifier('3201011234567891');
      expect(actualFirst.index).not.toBe(actualSecond.index);
    });

    it('derives a blind index that is not a plain digest of the value', () => {
      const inputNik = '3201011234567890';
      const actual = service.encryptSearchableIdentifier(inputNik);
      const unkeyedDigest = Buffer.from(inputNik).toString('base64');
      expect(actual.index).not.toBe(unkeyedDigest);
    });

    it('keeps only the last four digits for masked display', () => {
      const actual = service.encryptSearchableIdentifier('3201011234567890');
      expect(actual.last4).toBe('7890');
    });

    it('stamps the configured key version', () => {
      const inputConfigService = buildConfigService({ PATIENT_PII_KEY_VERSION: '3' });
      const inputService = new PatientIdentifierCryptoService(inputConfigService);
      expect(inputService.encryptSearchableIdentifier('3201011234567890').keyVersion).toBe(3);
    });
  });

  describe('decryptIdentifier', () => {
    it('rejects a tampered auth tag', () => {
      const actual = service.encryptSearchableIdentifier('3201011234567890');
      const tampered = Buffer.from(actual.ciphertext, 'base64');
      tampered.writeUInt8(tampered.readUInt8(13) ^ 0xff, 13);
      expect(() => service.decryptIdentifier(tampered.toString('base64'))).toThrow();
    });

    it('rejects tampered ciphertext bytes', () => {
      const actual = service.encryptSearchableIdentifier('3201011234567890');
      const tampered = Buffer.from(actual.ciphertext, 'base64');
      const lastIndex = tampered.length - 1;
      tampered.writeUInt8(tampered.readUInt8(lastIndex) ^ 0xff, lastIndex);
      expect(() => service.decryptIdentifier(tampered.toString('base64'))).toThrow();
    });

    it('rejects a truncated payload', () => {
      expect(() => service.decryptIdentifier(Buffer.alloc(10).toString('base64'))).toThrow(
        /malformed/,
      );
    });

    it('cannot decrypt ciphertext produced under a different key', () => {
      const inputOtherService = new PatientIdentifierCryptoService(
        buildConfigService({ PATIENT_PII_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') }),
      );
      const actual = inputOtherService.encryptSearchableIdentifier('3201011234567890');
      expect(() => service.decryptIdentifier(actual.ciphertext)).toThrow();
    });
  });

  describe('computeBlindIndex', () => {
    it('depends on the index key', () => {
      const inputOtherService = new PatientIdentifierCryptoService(
        buildConfigService({ PATIENT_PII_INDEX_KEY: Buffer.alloc(32, 7).toString('base64') }),
      );
      expect(service.computeBlindIndex('3201011234567890')).not.toBe(
        inputOtherService.computeBlindIndex('3201011234567890'),
      );
    });
  });

  describe('matchesBlindIndex', () => {
    it('matches identical indexes', () => {
      const inputIndex = service.computeBlindIndex('3201011234567890');
      expect(service.matchesBlindIndex(inputIndex, inputIndex)).toBe(true);
    });

    it('rejects different indexes', () => {
      expect(
        service.matchesBlindIndex(
          service.computeBlindIndex('3201011234567890'),
          service.computeBlindIndex('3201011234567891'),
        ),
      ).toBe(false);
    });

    it('rejects indexes of different lengths without throwing', () => {
      expect(service.matchesBlindIndex(service.computeBlindIndex('3201011234567890'), 'YWI=')).toBe(
        false,
      );
    });
  });

  describe('sealed identifiers', () => {
    it('round-trips a value stored without a blind index', () => {
      const inputIhsNumber = 'P02478375538';
      const actual = service.encryptSealedIdentifier(inputIhsNumber);
      expect(service.decryptIdentifier(actual.ciphertext)).toBe(inputIhsNumber);
    });
  });
});
