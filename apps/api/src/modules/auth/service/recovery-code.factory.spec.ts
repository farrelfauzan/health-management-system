import { createRecoveryCode } from './recovery-code.factory';

const SAMPLE_SIZE = 2_000;

describe('createRecoveryCode (SJ-8)', () => {
  it('formats codes as three groups of five', () => {
    expect(createRecoveryCode()).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
  });

  it('never emits a character that can be misread off paper', () => {
    // i/l/o/u are absent from Crockford base32 precisely because they are
    // confusable with 1/1/0/v when handwritten or printed small.
    const generatedCodes = Array.from({ length: SAMPLE_SIZE }, () => createRecoveryCode());

    expect(generatedCodes.join('')).not.toMatch(/[ilou]/);
  });

  it('draws from the whole alphabet, so the rejection sampling is not truncating it', () => {
    const observedCharacters = new Set(
      Array.from({ length: SAMPLE_SIZE }, () => createRecoveryCode())
        .join('')
        .replace(/-/g, ''),
    );

    expect(observedCharacters.size).toBe(32);
  });

  it('does not repeat itself', () => {
    const generatedCodes = new Set(Array.from({ length: SAMPLE_SIZE }, () => createRecoveryCode()));

    expect(generatedCodes.size).toBe(SAMPLE_SIZE);
  });
});
