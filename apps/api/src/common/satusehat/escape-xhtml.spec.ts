import { escapeXhtml } from './escape-xhtml';

describe('escapeXhtml', () => {
  it('renders typed markup as literal characters', () => {
    expect(escapeXhtml('Lanjutkan <b>amoksisilin</b>')).toBe(
      'Lanjutkan &lt;b&gt;amoksisilin&lt;/b&gt;',
    );
  });

  it('escapes the ampersand before the entities it would otherwise corrupt', () => {
    expect(escapeXhtml('R&D < 5')).toBe('R&amp;D &lt; 5');
  });

  it('does not double-escape an ampersand it introduced', () => {
    expect(escapeXhtml('<')).toBe('&lt;');
    expect(escapeXhtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes both quote characters, which appear inside attribute values', () => {
    expect(escapeXhtml(`pasien "membaik", tidak 'kambuh'`)).toBe(
      'pasien &quot;membaik&quot;, tidak &apos;kambuh&apos;',
    );
  });

  it('leaves ordinary clinical prose untouched', () => {
    const inputText = 'Batuk 3 hari, demam 38.2 C, tanpa sesak napas.';
    expect(escapeXhtml(inputText)).toBe(inputText);
  });

  it('returns an empty string unchanged', () => {
    expect(escapeXhtml('')).toBe('');
  });
});
