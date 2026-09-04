import { renderOffboardingEmail } from './render-offboarding-email';

describe('renderOffboardingEmail', () => {
  const payload = {
    deadline: new Date('2026-10-04T00:00:00.000Z'),
    summary: { sharedDocumentCount: 2, unsharedDocumentCount: 3 },
    vaultUrl: 'https://hms.example.test/doctor/vault',
  };

  it('names the date, what will be deleted, what will survive, and where to act', () => {
    // FR-E3-27, all four in one message: a person who has resigned may read
    // this once, from their phone, and never open the portal again.
    const actual = renderOffboardingEmail({ ...payload, kind: 'DAY_ZERO' });

    expect(actual.subject).toContain('4 Oktober 2026');
    expect(actual.text).toContain('3 dokumen yang tidak Anda bagikan akan dihapus permanen');
    expect(actual.text).toContain('2 dokumen yang telah Anda bagikan tetap dapat dibuka');
    expect(actual.text).toContain('3 document(s) you have not shared will be permanently deleted');
    expect(actual.text).toContain(payload.vaultUrl);
    expect(actual.html).toContain('href="https://hms.example.test/doctor/vault"');
  });

  it('opens differently on day zero and with seven days left, and says the same thing after', () => {
    const dayZero = renderOffboardingEmail({ ...payload, kind: 'DAY_ZERO' });
    const sevenDays = renderOffboardingEmail({ ...payload, kind: 'SEVEN_DAYS_LEFT' });

    expect(dayZero.text).toContain('telah dinonaktifkan secara bertahap');
    expect(sevenDays.text).toContain('berakhir tujuh hari lagi');
    expect(sevenDays.text).toContain('ends in seven days');
    // The second email exists because the first may have been read in a
    // hurry, not to say something new.
    expect(sevenDays.text).toContain('3 dokumen yang tidak Anda bagikan');
    expect(sevenDays.subject).toBe(dayZero.subject);
  });

  it('escapes the link in the HTML body', () => {
    const actual = renderOffboardingEmail({
      ...payload,
      kind: 'DAY_ZERO',
      vaultUrl: 'https://hms.example.test/doctor/vault?x="<y>"',
    });

    expect(actual.html).not.toContain('"<y>"');
    expect(actual.html).toContain('&quot;&lt;y&gt;&quot;');
  });
});
