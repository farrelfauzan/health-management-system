import { InvoiceDeliveryMessageContext } from '@hms/shared-types';

import {
  buildInvoiceDeliveryMail,
  buildInvoiceWhatsappCaption,
} from './build-invoice-delivery-copy';

const BASE_CONTEXT: InvoiceDeliveryMessageContext = {
  clinicName: 'Klinik Sehat',
  patientName: 'Rina',
  invoiceNumber: 'INV/2026/09/000123',
  totalAmount: 1_250_000,
  issuedAt: new Date('2026-09-29T02:00:00.000Z'),
  passwordSentence:
    'Buka dokumen ini dengan kata sandi berupa tanggal lahir Anda, format DDMMYYYY.',
  link: null,
};

describe('buildInvoiceWhatsappCaption', () => {
  it('names the clinic, the patient, the number, the total and the date, Indonesian first', () => {
    const actual = buildInvoiceWhatsappCaption(BASE_CONTEXT);

    expect(actual).toContain(
      'Klinik Sehat: kuitansi INV/2026/09/000123 atas nama Rina sebesar Rp 1.250.000',
    );
    expect(actual).toContain('tanggal 29 September 2026');
    expect(actual).toContain('Dokumen terlampir.');
    expect(actual.indexOf('kuitansi')).toBeLessThan(actual.indexOf('invoice INV/2026/09/000123'));
  });

  it('names the password scheme and never a value', () => {
    const actual = buildInvoiceWhatsappCaption(BASE_CONTEXT);

    expect(actual).toContain('tanggal lahir Anda, format DDMMYYYY');
    expect(actual).not.toMatch(/\d{8}/);
  });

  it('carries the link and its expiry instead of the password sentence on a link delivery', () => {
    const actual = buildInvoiceWhatsappCaption({
      ...BASE_CONTEXT,
      passwordSentence: null,
      link: {
        url: 'https://klinik.example.id/inv/tok',
        expiresAt: new Date('2026-10-06T02:00:00.000Z'),
      },
    });

    expect(actual).toContain('https://klinik.example.id/inv/tok');
    expect(actual).toContain('berlaku sampai 6 Oktober 2026');
    expect(actual).not.toContain('terlampir');
    expect(actual).not.toContain('kata sandi');
  });

  it('omits the date when the invoice has none', () => {
    const actual = buildInvoiceWhatsappCaption({ ...BASE_CONTEXT, issuedAt: null });

    expect(actual).not.toContain(', tanggal ');
    expect(actual).not.toContain(', dated ');
    expect(actual).toContain('sebesar Rp 1.250.000.');
  });
});

describe('buildInvoiceDeliveryMail', () => {
  it('puts the number and the clinic in the subject and nothing clinical anywhere', () => {
    const actual = buildInvoiceDeliveryMail(BASE_CONTEXT);

    expect(actual.subject).toBe(
      'Kuitansi INV/2026/09/000123 dari Klinik Sehat / Invoice INV/2026/09/000123 from Klinik Sehat',
    );
    expect(actual.text).toContain('Rp 1.250.000');
    expect(actual.html).toContain('<p>');
  });

  it('renders the link as a button and escapes it', () => {
    const actual = buildInvoiceDeliveryMail({
      ...BASE_CONTEXT,
      passwordSentence: null,
      link: {
        url: 'https://klinik.example.id/inv/a&b',
        expiresAt: new Date('2026-10-06T02:00:00.000Z'),
      },
    });

    expect(actual.html).toContain('href="https://klinik.example.id/inv/a&amp;b"');
    expect(actual.html).toContain('Unduh kuitansi / Download invoice');
  });
});
