import { sanitizeChatMarkup } from './sanitize-chat-markup';

describe('sanitizeChatMarkup', () => {
  it('leaves plain text untouched', () => {
    const inputContent = 'Klinik buka pukul 08.00-20.00 WIB.';

    const actualResult = sanitizeChatMarkup(inputContent);

    expect(actualResult.content).toBe(inputContent);
    expect(actualResult.wasModified).toBe(false);
  });

  it.each(['script', 'style', 'iframe', 'object', 'embed'])(
    'drops a %s block together with its contents',
    (tagName) => {
      const actualResult = sanitizeChatMarkup(
        `Halo <${tagName}>payload-that-must-not-survive</${tagName}> dunia`,
      );

      // Unwrapping instead of dropping would leave the payload as visible
      // text, which is the whole failure this guard exists to prevent.
      expect(actualResult.content).not.toContain('payload-that-must-not-survive');
      expect(actualResult.content).toContain('Halo');
      expect(actualResult.content).toContain('dunia');
      expect(actualResult.wasModified).toBe(true);
    },
  );

  it('unwraps ordinary tags so their readable text survives', () => {
    const actualResult = sanitizeChatMarkup('<p>Jam buka <b>08.00</b> WIB</p>');

    expect(actualResult.content).toBe('Jam buka 08.00 WIB');
    expect(actualResult.wasModified).toBe(true);
  });

  it.each(['javascript:', 'data:', 'vbscript:'])('defangs the %s URL scheme', (scheme) => {
    const actualResult = sanitizeChatMarkup(`Klik <a href="${scheme}alert(1)">di sini</a>`);

    expect(actualResult.content).not.toContain(scheme);
    expect(actualResult.wasModified).toBe(true);
  });

  it('removes HTML comments', () => {
    const actualResult = sanitizeChatMarkup('Jam buka<!-- hidden note --> 08.00');

    expect(actualResult.content).toBe('Jam buka 08.00');
  });

  it('reports no modification when only surrounding whitespace is trimmed', () => {
    const actualResult = sanitizeChatMarkup('  Jam buka 08.00  ');

    expect(actualResult.content).toBe('Jam buka 08.00');
    expect(actualResult.wasModified).toBe(false);
  });
});
