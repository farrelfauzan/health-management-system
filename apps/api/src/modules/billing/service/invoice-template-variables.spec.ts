import {
  INVOICE_TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLES_BY_KIND,
  TEMPLATE_VARIABLE_KINDS,
  TEMPLATE_VARIABLE_TYPES,
} from '@hms/shared-types';

/**
 * The registry pinned as a list (`P16-T04`).
 *
 * Templates are authored against these tokens and stored with them embedded,
 * so renaming one silently breaks every published template that used it. This
 * spec makes a rename a deliberate two-file diff instead of a one-line edit
 * somebody merges without noticing — and the review question it forces is
 * "what migrates the templates?", which is the whole point.
 */
const EXPECTED_TOKENS: readonly string[] = [
  'clinic.name',
  'clinic.legalName',
  'clinic.address',
  'clinic.phone',
  'clinic.email',
  'clinic.licenseNumber',
  'clinic.taxId',
  'clinic.logo',
  'invoice.number',
  'invoice.issuedAt',
  'invoice.status',
  'invoice.total',
  'invoice.totalInWords',
  'invoice.itemCount',
  'invoice.qrVerify',
  'patient.fullName',
  'patient.mrn',
  'patient.dateOfBirth',
  'patient.sex',
  'patient.address',
  'patient.phone',
  'patient.nikMasked',
  'encounter.date',
  'encounter.doctorName',
  'encounter.specialty',
  'admission.roomLabel',
  'admission.nights',
  'payment.method',
  'payment.paidAt',
  'payment.reference',
  'payment.cashierName',
  'items',
  'item.no',
  'item.description',
  'item.quantity',
  'item.unitPrice',
  'item.amount',
];

describe('invoice template variable registry', () => {
  it('offers exactly the reviewed token set, in order', () => {
    expect(INVOICE_TEMPLATE_VARIABLES.map((variable) => variable.token)).toEqual(EXPECTED_TOKENS);
  });

  it('names no plaintext identifier token', () => {
    // `patient.nikMasked` is the only identifier token. The plaintext NIK is
    // encrypted at rest and gated behind `patient.read-identifier`; putting it
    // on a receipt the patient carries out of the building must not be a
    // layout choice available in a WYSIWYG editor.
    const identifierTokens = INVOICE_TEMPLATE_VARIABLES.map((variable) => variable.token).filter(
      (token) => token.toLowerCase().includes('nik'),
    );

    expect(identifierTokens).toEqual(['patient.nikMasked']);
  });

  it('declares a known type, both labels, and a sample for every token', () => {
    for (const variable of INVOICE_TEMPLATE_VARIABLES) {
      expect(TEMPLATE_VARIABLE_TYPES).toContain(variable.type);
      expect(variable.labelId.trim()).not.toBe('');
      expect(variable.labelEn.trim()).not.toBe('');
      // The sample doubles as the fixture for P16-T12's hostile-data preview,
      // so a placeholder like `<name>` would make that preview meaningless.
      expect(variable.sample.trim()).not.toBe('');
    }
  });

  it('has no duplicate tokens', () => {
    const tokens = INVOICE_TEMPLATE_VARIABLES.map((variable) => variable.token);

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('answers for every declared kind', () => {
    for (const kind of TEMPLATE_VARIABLE_KINDS) {
      expect(TEMPLATE_VARIABLES_BY_KIND[kind].length).toBeGreaterThan(0);
    }
  });
});
