import { extractTemplateTokens } from './extract-template-tokens';
import { findUnknownTemplateTokens } from './find-unknown-template-tokens';

describe('extractTemplateTokens', () => {
  it('collects every distinct data-hms-var token in document order', () => {
    const actual = extractTemplateTokens(
      '<p><span data-hms-var="clinic.name"></span> <span data-hms-var="invoice.number"></span></p>' +
        '<div data-hms-var="items"></div><p><span data-hms-var="clinic.name"></span></p>',
    );

    expect(actual).toEqual(['clinic.name', 'invoice.number', 'items']);
  });

  it('ignores markup that carries no token', () => {
    expect(extractTemplateTokens('<p>Total: <strong>Rp 0</strong></p>')).toEqual([]);
  });
});

describe('findUnknownTemplateTokens', () => {
  it('returns only the tokens outside the registry for the kind', () => {
    const actual = findUnknownTemplateTokens({
      kind: 'INVOICE',
      contentHtml:
        '<p><span data-hms-var="patient.mrn"></span><span data-hms-var="patient.mrnTypo"></span></p>' +
        '<div data-hms-var="items"></div><span data-hms-var="patient.nik"></span>',
    });

    expect(actual).toEqual(['patient.mrnTypo', 'patient.nik']);
  });

  it('is empty for a template built only from registry tokens', () => {
    expect(
      findUnknownTemplateTokens({
        kind: 'INVOICE',
        contentHtml: '<p><span data-hms-var="invoice.total"></span></p><div data-hms-var="items"></div>',
      }),
    ).toEqual([]);
  });
});
