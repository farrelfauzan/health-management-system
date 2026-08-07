import { redactCustomerMessage } from './redact-customer-message';

describe('redactCustomerMessage', () => {
  it('redacts a bare NIK', () => {
    const actualResult = redactCustomerMessage('NIK saya 3171020344050001 ya');

    expect(actualResult.content).toBe('NIK saya [NIK DIREDAKSI] ya');
    expect(actualResult.wasRedacted).toBe(true);
  });

  it('redacts a NIK typed with the separators people actually use', () => {
    const actualResult = redactCustomerMessage('nik 3171.0203.4405.0001');

    // A rule that only matched sixteen bare digits would pass this straight
    // through to a third-party provider.
    expect(actualResult.content).toContain('[NIK DIREDAKSI]');
    expect(actualResult.content).not.toContain('3171');
  });

  it('redacts a BPJS number', () => {
    const actualResult = redactCustomerMessage('nomor bpjs 0001234567890');

    expect(actualResult.content).toBe('nomor bpjs [NOMOR BPJS DIREDAKSI]');
  });

  it('does not leave the tail of a NIK behind after matching a shorter rule', () => {
    const actualResult = redactCustomerMessage('3171020344050001');

    // The failure this ordering exists to prevent: a 13-digit rule running
    // first eats thirteen digits and leaves three, which reads as redacted
    // and is not.
    expect(actualResult.content).toBe('[NIK DIREDAKSI]');
    expect(/\d/.test(actualResult.content)).toBe(false);
  });

  it('redacts an unrecognised long digit run', () => {
    const actualResult = redactCustomerMessage('kartu lama saya 987654321');

    // The identifiers this codebase has not enumerated. A long digit run in a
    // message to a clinic is far more likely to be an identifier than
    // anything the model needs.
    expect(actualResult.content).toBe('kartu lama saya [NOMOR DIREDAKSI]');
  });

  it('keeps the message readable so the customer is answered, not stonewalled', () => {
    const actualResult = redactCustomerMessage(
      'Halo, saya mau daftar besok. NIK saya 3171020344050001.',
    );

    expect(actualResult.content).toBe('Halo, saya mau daftar besok. NIK saya [NIK DIREDAKSI].');
  });

  it('leaves an ordinary message untouched', () => {
    const inputMessage = 'Klinik buka jam berapa hari Sabtu?';

    const actualResult = redactCustomerMessage(inputMessage);

    expect(actualResult.content).toBe(inputMessage);
    expect(actualResult.wasRedacted).toBe(false);
  });

  it('leaves short numbers alone', () => {
    const actualResult = redactCustomerMessage('saya mau jam 8 pagi tanggal 12 untuk 2 orang');

    expect(actualResult.wasRedacted).toBe(false);
  });

  it('does not count separators toward an identifier’s length', () => {
    // Fourteen digits padded to NIK width by dots. Counting characters rather
    // than digits would mislabel it.
    const actualResult = redactCustomerMessage('12.34.56.78.90.12.34');

    expect(actualResult.content).not.toContain('[NIK DIREDAKSI]');
  });

  it('redacts every identifier in a message, not only the first', () => {
    const actualResult = redactCustomerMessage('NIK 3171020344050001 dan BPJS 0001234567890');

    expect(actualResult.content).toBe('NIK [NIK DIREDAKSI] dan BPJS [NOMOR BPJS DIREDAKSI]');
  });

  it('redacts a 13-digit run typed as a phone number, and that is the deliberate trade', () => {
    const actualResult = redactCustomerMessage('nomor saya 6281234567890');

    // Indonesian mobile numbers overlap BPJS width, and shape alone cannot
    // separate them. Losing a phone number costs a clarifying question;
    // leaking a payer identifier to a processor does not undo.
    expect(actualResult.wasRedacted).toBe(true);
  });
});
