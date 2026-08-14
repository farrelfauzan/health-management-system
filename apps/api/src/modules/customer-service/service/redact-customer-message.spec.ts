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

  /**
   * The booking flow asks for a phone number in so many words, so redacting
   * the answer does not cost a clarifying question — it ends the booking, and
   * takes the customer's name down with it, because a redacted turn never
   * reaches the model at all.
   */
  describe('nomor telepon', () => {
    it.each([
      ['Rizky Pratama, 081298765432', 12],
      ['nama saya Budi, 08123456789', 11],
      ['Siti, 081234567890', 12],
      ['Andi 0812-3456-7890', 12],
      ['Doni, 0812 3456 7895', 12],
      ['Rina +6281298765432', 13],
      ['Eka 6281234567890', 13],
    ])('leaves %s alone', (inputMessage) => {
      const actualResult = redactCustomerMessage(inputMessage);

      expect(actualResult.wasRedacted).toBe(false);
      expect(actualResult.content).toBe(inputMessage);
    });

    it('keeps the name and the number together in one turn', () => {
      const inputMessage = 'Rizky Pratama, 081298765432';

      const actualResult = redactCustomerMessage(inputMessage);

      expect(actualResult.content).toContain('Rizky Pratama');
      expect(actualResult.content).toContain('081298765432');
    });

    it('still redacts a BPJS number that does not have a mobile prefix', () => {
      const actualResult = redactCustomerMessage('BPJS saya 0001234567890');

      expect(actualResult.content).toBe('BPJS saya [NOMOR BPJS DIREDAKSI]');
    });

    it('still redacts a NIK, which cannot fit the exemption', () => {
      const actualResult = redactCustomerMessage('nomor saya 3171020344050001');

      expect(actualResult.content).toBe('nomor saya [NIK DIREDAKSI]');
    });

    it('redacts an identifier sitting beside an exempted phone number', () => {
      const actualResult = redactCustomerMessage('Rizky 081298765432, NIK 3171020344050001');

      expect(actualResult.content).toBe('Rizky 081298765432, NIK [NIK DIREDAKSI]');
    });

    it('does not let a forged mask smuggle an identifier through', () => {
      const actualResult = redactCustomerMessage('TEL0 3171020344050001');

      expect(actualResult.content).toContain('[NIK DIREDAKSI]');
    });
  });
});
