import fc from 'fast-check';
import { INVOICE_TEMPLATE_VARIABLES, ResolveInvoiceVariablesParams } from '@hms/shared-types';

import { resolveInvoiceVariables } from './resolve-invoice-variables';

const TIME_ZONE = 'Asia/Jakarta';
const NIK = '3271040288001234';

function buildParams(
  overrides: Partial<ResolveInvoiceVariablesParams> = {},
): ResolveInvoiceVariablesParams {
  return {
    timeZone: TIME_ZONE,
    clinic: {
      name: 'Klinik Sehat Bersama',
      legalName: 'PT Sehat Bersama Indonesia',
      address: 'Jl. Merdeka No. 12, Bandung',
      phoneNumber: '(022) 1234567',
      email: 'halo@kliniksehat.id',
      licenseNumber: '440/1234/DPMPTSP',
      taxId: '01.234.567.8-901.000',
      logoDataUri: 'data:image/png;base64,AAAA',
    },
    invoice: {
      invoiceNumber: 'INV-20260830-0007',
      status: 'PAID',
      totalAmount: 275_000,
      issuedAt: new Date('2026-08-30T03:00:00.000Z'),
      qrVerifyDataUri: 'data:image/png;base64,BBBB',
    },
    patient: {
      fullName: 'Siti Rahmawati',
      mrn: 'RM-000142',
      dateOfBirth: new Date('1988-02-04T00:00:00.000Z'),
      sex: 'FEMALE',
      address: 'Jl. Kenanga No. 3',
      phoneNumber: '081200000000',
      nik: NIK,
    },
    encounter: {
      date: new Date('2026-08-30T03:00:00.000Z'),
      doctorName: 'dr. Andi Prasetyo, Sp.PD',
      specialty: 'Penyakit Dalam',
    },
    admission: { roomLabel: 'Melati 2A', nights: 3 },
    payment: {
      method: 'QRIS',
      paidAt: new Date('2026-08-30T07:22:00.000Z'),
      referenceNumber: 'QR-88213771',
      cashierName: 'Rina Kartika',
    },
    items: [
      { description: 'Konsultasi Dokter Umum', quantity: 1, unitPrice: 50_000, amount: 50_000 },
      { description: 'Injeksi Antibiotik', quantity: 2, unitPrice: 112_500, amount: 225_000 },
    ],
    ...overrides,
  };
}

const SCALAR_TOKENS = INVOICE_TEMPLATE_VARIABLES.filter(
  (variable) => variable.type !== 'block' && !variable.token.startsWith('item.'),
).map((variable) => variable.token);

describe('resolveInvoiceVariables', () => {
  it('fills every scalar token in the registry, and nothing outside it', () => {
    // The registry is what the editor offers and what publish-time validation
    // checks against, so a token the resolver forgot would be an offerable
    // variable that always renders blank.
    const actual = resolveInvoiceVariables(buildParams());

    expect(Object.keys(actual.values).sort()).toEqual([...SCALAR_TOKENS].sort());
  });

  it('formats money, dates, and the terbilang line the way a receipt reads', () => {
    const actual = resolveInvoiceVariables(buildParams());

    expect(actual.values).toMatchObject({
      'invoice.number': 'INV-20260830-0007',
      'invoice.total': 'Rp 275.000',
      'invoice.totalInWords': 'dua ratus tujuh puluh lima ribu rupiah',
      'invoice.itemCount': '2',
      'invoice.issuedAt': '30 Agustus 2026',
      'patient.dateOfBirth': '4 Februari 1988',
      'patient.sex': 'Perempuan',
      // Clinic-local, not UTC: 07:22Z is 14:22 in Jakarta.
      'payment.paidAt': '30 Agustus 2026, 14:22',
    });
    expect(actual.warnings).toEqual([]);
  });

  it('renders dates in the clinic timezone it is given', () => {
    // 17:30Z on the 30th is already the 31st in Jayapura.
    const actual = resolveInvoiceVariables(
      buildParams({
        timeZone: 'Asia/Jayapura',
        invoice: { ...buildParams().invoice, issuedAt: new Date('2026-08-30T17:30:00.000Z') },
      }),
    );

    expect(actual.values['invoice.issuedAt']).toBe('31 Agustus 2026');
  });

  it('masks the NIK and never emits the plaintext', () => {
    const actual = resolveInvoiceVariables(buildParams());

    expect(actual.values['patient.nikMasked']).toBe('••••••••••••1234');
    expect(JSON.stringify(actual)).not.toContain(NIK);
    // There is no plaintext token to emit it into, either.
    expect(SCALAR_TOKENS).not.toContain('patient.nik');
  });

  it('reports exactly one warning for a patient with no NIK, and renders it empty', () => {
    const params = buildParams();
    const actual = resolveInvoiceVariables(
      buildParams({ patient: { ...params.patient!, nik: null } }),
    );

    expect(actual.values['patient.nikMasked']).toBe('');
    expect(actual.warnings).toEqual([
      { token: 'patient.nikMasked', reason: 'No value is recorded for this field' },
    ]);
  });

  it('refuses to half-mask a NIK too short to hide', () => {
    // A "masked" value that reveals most of itself is worse than a blank,
    // because it looks like it was handled.
    const params = buildParams();
    const actual = resolveInvoiceVariables(
      buildParams({ patient: { ...params.patient!, nik: '1234' } }),
    );

    expect(actual.values['patient.nikMasked']).toBe('');
  });

  it('reports one warning per absent section rather than one per token', () => {
    const actual = resolveInvoiceVariables(
      buildParams({ admission: null, payment: null, encounter: null }),
    );

    expect(actual.warnings.map((warning) => warning.token).sort()).toEqual([
      'admission.*',
      'encounter.*',
      'payment.*',
    ]);
    expect(actual.values['admission.roomLabel']).toBe('');
    expect(actual.values['payment.cashierName']).toBe('');
  });

  it('builds one row per line item, numbered from one', () => {
    const actual = resolveInvoiceVariables(buildParams());

    expect(actual.items).toEqual([
      {
        'item.no': '1',
        'item.description': 'Konsultasi Dokter Umum',
        'item.quantity': '1',
        'item.unitPrice': 'Rp 50.000',
        'item.amount': 'Rp 50.000',
      },
      {
        'item.no': '2',
        'item.description': 'Injeksi Antibiotik',
        'item.quantity': '2',
        'item.unitPrice': 'Rp 112.500',
        'item.amount': 'Rp 225.000',
      },
    ]);
  });

  it('warns about an invoice with no line items', () => {
    const actual = resolveInvoiceVariables(buildParams({ items: [] }));

    expect(actual.items).toEqual([]);
    expect(actual.warnings).toContainEqual({
      token: 'items',
      reason: 'This invoice has no line items',
    });
    expect(actual.values['invoice.itemCount']).toBe('0');
  });

  it('rounds a fractional total to whole rupiah and says so', () => {
    // A receipt whose words and figures disagree is the one outcome nobody
    // can explain at the counter.
    const params = buildParams();
    const actual = resolveInvoiceVariables(
      buildParams({ invoice: { ...params.invoice, totalAmount: 275_000.4 } }),
    );

    expect(actual.values['invoice.total']).toBe('Rp 275.000');
    expect(actual.values['invoice.totalInWords']).toBe('dua ratus tujuh puluh lima ribu rupiah');
    expect(actual.warnings).toContainEqual({
      token: 'invoice.totalInWords',
      reason: 'The invoice total was rounded to whole rupiah to be spelled in words',
    });
  });

  it('leaves the words empty rather than failing on a total beyond its scale words', () => {
    const params = buildParams();
    const actual = resolveInvoiceVariables(
      buildParams({ invoice: { ...params.invoice, totalAmount: 1e18 } }),
    );

    expect(actual.values['invoice.totalInWords']).toBe('');
    expect(actual.warnings).toContainEqual({
      token: 'invoice.totalInWords',
      reason: 'The invoice total is larger than this document can spell in words',
    });
  });

  it('never emits a raw token, whatever is missing (property)', () => {
    // The rule the whole resolver exists to keep: `{{patient.phone}}` on a
    // receipt is worse than a blank, because a blank reads as "not recorded"
    // and the token reads as broken software.
    fc.assert(
      fc.property(
        fc.record({
          clinic: fc.boolean(),
          patient: fc.boolean(),
          encounter: fc.boolean(),
          admission: fc.boolean(),
          payment: fc.boolean(),
          hasItems: fc.boolean(),
        }),
        (present) => {
          const base = buildParams();
          const actual = resolveInvoiceVariables({
            ...base,
            clinic: present.clinic ? base.clinic : null,
            patient: present.patient ? base.patient : null,
            encounter: present.encounter ? base.encounter : null,
            admission: present.admission ? base.admission : null,
            payment: present.payment ? base.payment : null,
            items: present.hasItems ? base.items : [],
          });
          const rendered = [
            ...Object.values(actual.values),
            ...actual.items.flatMap((row) => Object.values(row)),
          ].join('\n');
          expect(rendered).not.toMatch(/\{\{|\}\}/);
          for (const token of SCALAR_TOKENS) {
            expect(rendered).not.toContain(token);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('accounts for every empty token with a warning (property)', () => {
    fc.assert(
      fc.property(
        fc.record({ patient: fc.boolean(), payment: fc.boolean(), encounter: fc.boolean() }),
        (present) => {
          const base = buildParams();
          const actual = resolveInvoiceVariables({
            ...base,
            patient: present.patient ? base.patient : null,
            payment: present.payment ? base.payment : null,
            encounter: present.encounter ? base.encounter : null,
          });
          const warnedTokens = new Set(actual.warnings.map((warning) => warning.token));
          for (const [token, value] of Object.entries(actual.values)) {
            if (value !== '') {
              continue;
            }
            const sectionToken = `${token.split('.')[0]}.*`;
            expect(warnedTokens.has(token) || warnedTokens.has(sectionToken)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
