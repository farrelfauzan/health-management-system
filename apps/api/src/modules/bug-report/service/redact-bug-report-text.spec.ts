import { redactBugReportText } from './redact-bug-report-text';

describe('redactBugReportText', () => {
  it('replaces a NIK with its category marker and keeps the surrounding prose', () => {
    const actualText = redactBugReportText('Pasien NIK 3174091234567890 tidak muncul');

    expect(actualText).toBe('Pasien NIK [REDACTED:NIK] tidak muncul');
  });

  /**
   * The right-to-left requirement, as a test. Findings carry offsets into the
   * original string, so replacing left to right shifts every later offset by the
   * difference between the match and its marker — which leaves the second
   * identifier partly intact while the function still looks like it worked.
   */
  it('replaces every finding when one field carries several', () => {
    const actualText = redactBugReportText(
      'NIK 3174091234567890 telepon 0812 3456 7890 email budi@klinik.id',
    );

    expect(actualText).toBe(
      'NIK [REDACTED:NIK] telepon [REDACTED:PHONE] email [REDACTED:EMAIL]',
    );
    expect(actualText).not.toContain('3174');
    expect(actualText).not.toContain('3456');
    expect(actualText).not.toContain('budi');
  });

  it('redacts a medical record number when the deployment format is known', () => {
    const actualText = redactBugReportText('Nomor RM MR-00012345 salah', {
      mrnFormat: { prefix: 'MR-', width: 8 },
    });

    expect(actualText).toBe('Nomor RM [REDACTED:MRN] salah');
  });

  it('leaves text with nothing sensitive in it exactly as written', () => {
    const inputText = 'Tombol simpan tidak berfungsi di halaman lab';

    expect(redactBugReportText(inputText)).toBe(inputText);
  });

  it('caps an over-long field and says that it did', () => {
    const actualText = redactBugReportText('a'.repeat(3000));

    expect(actualText).toHaveLength(2000);
    expect(actualText.endsWith(' […truncated]')).toBe(true);
  });

  it('returns an empty string unchanged', () => {
    expect(redactBugReportText('')).toBe('');
  });
});
