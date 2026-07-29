import { createCipheriv, createHash } from 'node:crypto';

import LZString from 'lz-string';

import { BpjsPcareCodecError } from './bpjs-pcare-codec.error';
import { BpjsPcareDecryptionContext } from './bpjs-pcare.types';
import { decodeBpjsPcareResponse } from './decode-bpjs-pcare-response';

/**
 * The pinned ciphertext fixture was generated once for the P11-T01 spike with
 * the reference algorithm (LZ-String compressToEncodedURIComponent, then
 * AES-256-CBC under SHA-256(consId + secretKey + timestamp) with IV = first
 * 16 hash bytes) and the AES layer was cross-checked against the openssl CLI.
 * All identifiers in the payload are synthetic. A change in the decode
 * routine or in lz-string's format breaks this test loudly.
 */
describe('decodeBpjsPcareResponse', () => {
  const inputContext: BpjsPcareDecryptionContext = {
    consId: '20250001',
    secretKey: '0kSp1keSecretKey',
    timestamp: '1753776000',
  };
  const pinnedCiphertext =
    '+vY/kwFk0Y/BUlbUDmuKMUb73/fuDHV9Eonfb5EOgpGwHzDBIYz7pPcukrz00JP0zsGhpxq/aNj1SKI9dgTAGPMXIsWHma3BgfjOnW0eGmuy9unD952MVT17GOlK+GUBnunm8MOhEKl+6STRHt/jebbnk8DfNvykuEn40M6PWl3efVQebT5+ISlZCZ2qTzGC8TS3x7x848opGziiSuTgw8XA45DWEroAAjusPyDFGE8jpgaBfeZKxn0Sj7pUtIMS4TsLGNawGlN7fBo/u5uMZ7uwRNrUzAR8E8KB9gJ9IzLP35SHAsLMyJF7gZHAJnJ0OdYnddfvNIxZmIeeuZNo6zM6QV7WfEJIrRMs+v9MapSRRwWYV4uzEq8o8KPqSXpv6XeU8/+UN1Ql2wYuWI4o6g==';
  const expectedPesertaPayload = {
    noKartu: '0000123456789',
    nik: '3175020107880001',
    nama: 'PESERTA CONTOH',
    tglLahir: '01-07-1988',
    sex: 'L',
    kdProviderPst: { kdProvider: '01000101', nmProvider: 'KLINIK CONTOH' },
    jnsKelas: { kode: '21', nama: 'KELAS II' },
    aktif: true,
    ketAktif: 'AKTIF',
  };

  function encryptResponseForTest(context: BpjsPcareDecryptionContext, plaintext: string): string {
    const compressed = LZString.compressToEncodedURIComponent(plaintext);
    const hash = createHash('sha256')
      .update(`${context.consId}${context.secretKey}${context.timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    return Buffer.concat([cipher.update(compressed, 'utf8'), cipher.final()]).toString('base64');
  }

  function buildEnvelopeBody(response: unknown): string {
    return JSON.stringify({ metaData: { code: 200, message: 'OK' }, response });
  }

  it('decodes the pinned encrypted peserta fixture', () => {
    const inputBody = buildEnvelopeBody(pinnedCiphertext);

    const actualEnvelope = decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualEnvelope.metaData).toEqual({ code: 200, message: 'OK' });
    expect(actualEnvelope.response).toEqual(expectedPesertaPayload);
  });

  it('round-trips an arbitrary payload through encrypt and decode', () => {
    const inputPayload = { list: [{ kdPoli: '001', nmPoli: 'POLI UMUM' }], count: 1 };
    const inputBody = buildEnvelopeBody(
      encryptResponseForTest(inputContext, JSON.stringify(inputPayload)),
    );

    const actualEnvelope = decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualEnvelope.response).toEqual(inputPayload);
  });

  it('passes a plain-object response through undecoded', () => {
    const inputBody = JSON.stringify({
      metaData: { code: '201', message: 'CREATED' },
      response: { field: 'noUrut', value: 'A12' },
    });

    const actualEnvelope = decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualEnvelope.response).toEqual({ field: 'noUrut', value: 'A12' });
  });

  it('passes a null response through undecoded', () => {
    const inputBody = JSON.stringify({ metaData: { code: 204, message: 'NO CONTENT' } });

    const actualEnvelope = decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualEnvelope.response).toBeUndefined();
  });

  it('throws BPJS_PCARE_DECRYPT_FAILED when the timestamp does not match the request', () => {
    const inputStaleContext: BpjsPcareDecryptionContext = {
      ...inputContext,
      timestamp: '1753776999',
    };
    const inputBody = buildEnvelopeBody(pinnedCiphertext);

    const actualCall = (): unknown =>
      decodeBpjsPcareResponse({ context: inputStaleContext, rawBody: inputBody });

    expect(actualCall).toThrow(BpjsPcareCodecError);
    expect(actualCall).toThrow(
      expect.objectContaining({ code: 'BPJS_PCARE_DECRYPT_FAILED' }) as Error,
    );
  });

  it('throws BPJS_PCARE_DECOMPRESS_FAILED when the plaintext is not LZ-String data', () => {
    const compressed = '!!!not-lz-string!!!';
    const hash = createHash('sha256')
      .update(`${inputContext.consId}${inputContext.secretKey}${inputContext.timestamp}`)
      .digest();
    const cipher = createCipheriv('aes-256-cbc', hash, hash.subarray(0, 16));
    const inputCiphertext = Buffer.concat([
      cipher.update(compressed, 'utf8'),
      cipher.final(),
    ]).toString('base64');
    const inputBody = buildEnvelopeBody(inputCiphertext);

    const actualCall = (): unknown =>
      decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualCall).toThrow(
      expect.objectContaining({ code: 'BPJS_PCARE_DECOMPRESS_FAILED' }) as Error,
    );
  });

  it('throws BPJS_PCARE_RESPONSE_MALFORMED when the decompressed payload is not JSON', () => {
    const inputBody = buildEnvelopeBody(encryptResponseForTest(inputContext, 'bukan json'));

    const actualCall = (): unknown =>
      decodeBpjsPcareResponse({ context: inputContext, rawBody: inputBody });

    expect(actualCall).toThrow(
      expect.objectContaining({ code: 'BPJS_PCARE_RESPONSE_MALFORMED' }) as Error,
    );
  });

  it('throws BPJS_PCARE_RESPONSE_MALFORMED when the body is not JSON', () => {
    const actualCall = (): unknown =>
      decodeBpjsPcareResponse({ context: inputContext, rawBody: '<html>gateway error</html>' });

    expect(actualCall).toThrow(
      expect.objectContaining({ code: 'BPJS_PCARE_RESPONSE_MALFORMED' }) as Error,
    );
  });

  it('throws BPJS_PCARE_RESPONSE_MALFORMED when the metaData envelope is missing', () => {
    const actualCall = (): unknown =>
      decodeBpjsPcareResponse({ context: inputContext, rawBody: JSON.stringify({ ok: true }) });

    expect(actualCall).toThrow(
      expect.objectContaining({ code: 'BPJS_PCARE_RESPONSE_MALFORMED' }) as Error,
    );
  });
});
