import { generateKeyPairSync } from 'node:crypto';

import { decryptSatusehatKycMessage } from './decrypt-satusehat-kyc-message';
import { encryptSatusehatKycMessage } from './encrypt-satusehat-kyc-message';
import { SATUSEHAT_KYC_ARMOUR } from './satusehat-kyc-armour';

const RSA_2048_WRAPPED_KEY_LENGTH_BYTES = 256;
const IV_LENGTH_BYTES = 12;
const TAG_LENGTH_BYTES = 16;

/**
 * Key pairs are generated here, per run. Nothing in this file or the repo is
 * key material, and no NIK appears in a fixture.
 */
function generateTestKeyPair(): ReturnType<typeof generateKeyPairSync> {
  return generateKeyPairSync('rsa', { modulusLength: 2048 });
}

describe('SATUSEHAT KYC hybrid envelope (FR-KYC-01)', () => {
  const { publicKey, privateKey } = generateTestKeyPair();

  it('round-trips a JSON body through encrypt and decrypt', () => {
    const plaintext = JSON.stringify({ agent_name: 'Bidan Sari', agent_nik: '[redacted]' });

    const armoured = encryptSatusehatKycMessage({ plaintext, serverPublicKey: publicKey });
    const actual = decryptSatusehatKycMessage({ armoured, privateKey });

    expect(actual).toBe(plaintext);
  });

  it('matches the documented armour: begin tag, one base64 body, end tag', () => {
    const armoured = encryptSatusehatKycMessage({ plaintext: '{}', serverPublicKey: publicKey });

    const lines = armoured.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(SATUSEHAT_KYC_ARMOUR.BEGIN);
    expect(lines[0]).toBe('-----BEGIN ENCRYPTED MESSAGE-----');
    expect(lines[1]).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(lines[2]).toBe(SATUSEHAT_KYC_ARMOUR.END);
    expect(lines[2]).toBe('-----END ENCRYPTED MESSAGE-----');
  });

  it('lays the envelope out as wrapped key, IV, ciphertext, tag', () => {
    const plaintext = '{"agent_name":"x"}';

    const armoured = encryptSatusehatKycMessage({ plaintext, serverPublicKey: publicKey });

    const body = Buffer.from(armoured.split('\r\n')[1] ?? '', 'base64');
    expect(body.length).toBe(
      RSA_2048_WRAPPED_KEY_LENGTH_BYTES +
        IV_LENGTH_BYTES +
        Buffer.byteLength(plaintext, 'utf8') +
        TAG_LENGTH_BYTES,
    );
  });

  it('never produces the same body twice for the same plaintext', () => {
    const first = encryptSatusehatKycMessage({ plaintext: '{}', serverPublicKey: publicKey });
    const second = encryptSatusehatKycMessage({ plaintext: '{}', serverPublicKey: publicKey });

    expect(first).not.toBe(second);
  });

  it('accepts base64 the platform folded across lines', () => {
    const armoured = encryptSatusehatKycMessage({
      plaintext: '{"ok":true}',
      serverPublicKey: publicKey,
    });
    const folded = armoured.replace(/(.{64})/g, '$1\n');

    expect(decryptSatusehatKycMessage({ armoured: folded, privateKey })).toBe('{"ok":true}');
  });

  it('refuses a tampered ciphertext instead of returning garbage', () => {
    const armoured = encryptSatusehatKycMessage({
      plaintext: '{"ok":true}',
      serverPublicKey: publicKey,
    });
    const [begin, body, end] = armoured.split('\r\n');
    const bytes = Buffer.from(body ?? '', 'base64');
    const firstCiphertextByte = RSA_2048_WRAPPED_KEY_LENGTH_BYTES + IV_LENGTH_BYTES;
    bytes.writeUInt8(bytes.readUInt8(firstCiphertextByte) ^ 0xff, firstCiphertextByte);
    const tampered = `${begin}\r\n${bytes.toString('base64')}\r\n${end}`;

    expect(() => decryptSatusehatKycMessage({ armoured: tampered, privateKey })).toThrow();
  });

  it('refuses a body sealed for a different key pair', () => {
    const other = generateTestKeyPair();
    const armoured = encryptSatusehatKycMessage({
      plaintext: '{}',
      serverPublicKey: other.publicKey,
    });

    expect(() => decryptSatusehatKycMessage({ armoured, privateKey })).toThrow();
  });

  it('refuses a truncated envelope', () => {
    const truncated = `${SATUSEHAT_KYC_ARMOUR.BEGIN}\r\nAAAA\r\n${SATUSEHAT_KYC_ARMOUR.END}`;

    expect(() => decryptSatusehatKycMessage({ armoured: truncated, privateKey })).toThrow(
      'truncated',
    );
  });
});
