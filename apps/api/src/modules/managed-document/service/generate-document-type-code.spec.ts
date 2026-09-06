import { generateDocumentTypeCode } from './generate-document-type-code';

describe('generateDocumentTypeCode', () => {
  it('turns a display name into upper snake case', () => {
    const actual = generateDocumentTypeCode('Surat Keterangan Sehat', new Set());

    expect(actual).toBe('SURAT_KETERANGAN_SEHAT');
  });

  it('strips diacritics and punctuation', () => {
    const actual = generateDocumentTypeCode('Perjanjian pasien–klinik (résumé)!', new Set());

    expect(actual).toBe('PERJANJIAN_PASIEN_KLINIK_RESUME');
  });

  it('appends a numeric suffix on collision, skipping taken suffixes', () => {
    const takenCodes = new Set(['LETTER', 'LETTER_2']);

    const actual = generateDocumentTypeCode('Letter', takenCodes);

    expect(actual).toBe('LETTER_3');
  });

  it('falls back to a stem when nothing survives, and prefixes a numeric lead', () => {
    expect(generateDocumentTypeCode('!!!', new Set())).toBe('TYPE');
    expect(generateDocumentTypeCode('2026 Consent', new Set())).toBe('T_2026_CONSENT');
  });

  it('caps the stem so a long name still yields a valid code', () => {
    const inputName = 'a'.repeat(200);

    const actual = generateDocumentTypeCode(inputName, new Set());

    expect(actual).toHaveLength(48);
  });
});
