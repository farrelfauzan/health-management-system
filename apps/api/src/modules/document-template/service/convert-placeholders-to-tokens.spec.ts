import { convertPlaceholdersToTokens } from './convert-placeholders-to-tokens';

describe('convertPlaceholdersToTokens', () => {
  it('turns a registry placeholder into the canonical empty chip, spaces tolerated', () => {
    const actual = convertPlaceholdersToTokens(
      '<p>No. {{ invoice.number }} untuk {{patient.fullName}}</p>',
    );

    expect(actual.html).toBe(
      '<p>No. <span data-hms-var="invoice.number"></span> untuk <span data-hms-var="patient.fullName"></span></p>',
    );
    expect(actual.warnings).toEqual([]);
  });

  it('turns an items placeholder on its own line into the line-item block', () => {
    const actual = convertPlaceholdersToTokens('<h3>Rincian</h3><p><strong>{{items}}</strong></p>');

    expect(actual.html).toBe('<h3>Rincian</h3><div data-hms-var="items"></div>');
  });

  it('leaves an unknown placeholder as typed and reports it once', () => {
    const actual = convertPlaceholdersToTokens(
      '<p>{{tanda.tangan}}</p><p>{{tanda.tangan}} lagi, {{clinic.name}}</p>',
    );

    expect(actual.html).toBe(
      '<p>{{tanda.tangan}}</p><p>{{tanda.tangan}} lagi, <span data-hms-var="clinic.name"></span></p>',
    );
    expect(actual.warnings).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_PLACEHOLDER', detail: 'tanda.tangan' }),
    ]);
  });

  it('ignores braces that are not a placeholder', () => {
    const actual = convertPlaceholdersToTokens('<p>{{ }} and {{123}} and {single}</p>');

    expect(actual.html).toBe('<p>{{ }} and {{123}} and {single}</p>');
    expect(actual.warnings).toEqual([]);
  });
});
