import { sanitiseTemplateHtml } from './sanitise-template-html';

/**
 * NFR-SEC-01 (`P16-T05`): the server-side sanitiser is the control, whatever
 * the editor does client-side. Each case here is an injection route the
 * ticket names; the last group proves the properties the render pipeline
 * depends on — token canonicalisation and idempotency.
 */
describe('sanitiseTemplateHtml', () => {
  describe('strips the injection routes NFR-SEC-01 names', () => {
    it('drops a script tag and its body', () => {
      const actual = sanitiseTemplateHtml('<p>Total</p><script>alert(1)</script>');

      expect(actual).toBe('<p>Total</p>');
      expect(actual).not.toContain('script');
      expect(actual).not.toContain('alert');
    });

    it('drops inline event handlers', () => {
      const actual = sanitiseTemplateHtml('<img src="x" onerror="alert(1)"><p onclick="p()">a</p>');

      expect(actual).not.toContain('onerror');
      expect(actual).not.toContain('onclick');
      expect(actual).not.toContain('alert');
    });

    it('drops javascript: URLs with the anchor around them', () => {
      const actual = sanitiseTemplateHtml('<a href="javascript:alert(1)">pay here</a>');

      expect(actual).toBe('pay here');
    });

    it('drops iframe, object, embed, and link elements', () => {
      const actual = sanitiseTemplateHtml(
        '<iframe src="https://evil.example"></iframe>' +
          '<object data="a.swf"></object>' +
          '<embed src="a.swf">' +
          '<link rel="stylesheet" href="https://evil.example/a.css">' +
          '<p>kept</p>',
      );

      expect(actual).toBe('<p>kept</p>');
    });

    it('drops a remote url() from a style attribute', () => {
      const actual = sanitiseTemplateHtml(
        '<div style="background-color:#fff;background-image:url(https://evil.example/x.png)">a</div>',
      );

      expect(actual).toContain('background-color');
      expect(actual).not.toContain('url(');
      expect(actual).not.toContain('evil.example');
    });

    it('drops every function-shaped style value, remote or not', () => {
      const actual = sanitiseTemplateHtml(
        '<span style="width:expression(alert(1));color:rgb(0,0,0)">a</span>',
      );

      expect(actual).not.toContain('expression');
      expect(actual).not.toContain('rgb');
    });

    it('drops a style element outright', () => {
      const actual = sanitiseTemplateHtml('<style>@import url(https://evil.example);</style><p>a</p>');

      expect(actual).toBe('<p>a</p>');
    });

    it('catches a payload that sneaks past a naive client-side filter', () => {
      // An SVG wrapper is a classic client-bypass: many editor-side filters
      // allowlist it for icons, and the script inside executes on parse.
      const actual = sanitiseTemplateHtml('<svg><script>fetch("https://evil.example")</script></svg>');

      expect(actual).toBe('');
    });

    it('drops a remote image source but keeps an inline one', () => {
      const remote = sanitiseTemplateHtml('<img src="https://evil.example/x.png">');
      const relative = sanitiseTemplateHtml('<img src="/logo.png">');
      const inline = sanitiseTemplateHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
      const dataDocument = sanitiseTemplateHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">');

      expect(remote).toBe('<img>');
      expect(relative).toBe('<img>');
      expect(inline).toBe('<img src="data:image/png;base64,iVBORw0KGgo=">');
      expect(dataDocument).toBe('<img>');
    });
  });

  describe('keeps what an invoice layout is made of', () => {
    it('keeps table structure with span attributes', () => {
      const inputHtml =
        '<table width="100%"><thead><tr><th colspan="2">Uraian</th></tr></thead>' +
        '<tbody><tr><td rowspan="2">a</td><td>b</td></tr></tbody></table>';

      expect(sanitiseTemplateHtml(inputHtml)).toBe(inputHtml);
    });

    it('keeps allowlisted styles with safe values', () => {
      const actual = sanitiseTemplateHtml(
        '<p style="text-align:right;font-weight:bold;border-bottom:1px solid #333">Total</p>',
      );

      expect(actual).toContain('text-align:right');
      expect(actual).toContain('font-weight:bold');
      expect(actual).toContain('border-bottom:1px solid #333');
    });
  });

  describe('canonicalises variable tokens', () => {
    it('keeps a token span and reduces it to the machine token alone', () => {
      // FR-E1-03: the stored document holds the machine token, never the
      // palette label the editor shows inside the chip.
      const actual = sanitiseTemplateHtml(
        '<span data-hms-var="patient.fullName" class="chip" style="color:#333">Nama pasien</span>',
      );

      expect(actual).toBe('<span data-hms-var="patient.fullName"></span>');
    });

    it('keeps a block token on a div', () => {
      const actual = sanitiseTemplateHtml('<div data-hms-var="items"><p>preview rows</p></div>');

      expect(actual).toBe('<div data-hms-var="items"></div>');
    });

    it('drops a token attribute whose value is not token-shaped', () => {
      const actual = sanitiseTemplateHtml('<span data-hms-var="\'; DROP TABLE--">x</span>');

      expect(actual).toBe('<span>x</span>');
    });
  });

  it('is idempotent over its own output', () => {
    const hostileInput =
      '<div style="background-image:url(https://evil.example)"><script>x()</script>' +
      '<span data-hms-var="invoice.total">Rp 0</span><img src="https://evil.example/x.png"></div>';
    const oncePass = sanitiseTemplateHtml(hostileInput);

    expect(sanitiseTemplateHtml(oncePass)).toBe(oncePass);
  });
});
