import { sanitiseDocumentPreviewText } from './sanitise-document-preview-text';

describe('sanitiseDocumentPreviewText', () => {
  it('keeps ordinary markdown source untouched', () => {
    const inputText = '# Kebijakan Klinik\n\n- Poin pertama\n- Poin kedua\n';
    const actualText = sanitiseDocumentPreviewText(inputText);
    expect(actualText).toBe(inputText);
  });

  it('removes markup but keeps the words inside it', () => {
    const inputText = '<p>Pasien <strong>wajib</strong> membawa kartu.</p>';
    const actualText = sanitiseDocumentPreviewText(inputText);
    expect(actualText).toBe('Pasien wajib membawa kartu.');
  });

  it('drops a script body rather than leaving it as readable prose', () => {
    const inputText = 'Sebelum.<script>alert("xss")</script>Sesudah.';
    const actualText = sanitiseDocumentPreviewText(inputText);
    expect(actualText).toBe('Sebelum.Sesudah.');
    expect(actualText).not.toContain('alert');
  });

  it('drops a style body the same way', () => {
    const inputText = 'A<style>body{background:url(http://evil.test)}</style>B';
    const actualText = sanitiseDocumentPreviewText(inputText);
    expect(actualText).toBe('AB');
  });

  it('strips an event handler along with the element carrying it', () => {
    const inputText = '<img src="x" onerror="alert(1)">Teks';
    const actualText = sanitiseDocumentPreviewText(inputText);
    expect(actualText).toBe('Teks');
    expect(actualText).not.toContain('onerror');
  });

  it('leaves no angle-bracketed tag behind for a client to re-interpret', () => {
    const actualText = sanitiseDocumentPreviewText('<iframe src="http://evil.test"></iframe>Isi');
    expect(actualText).toBe('Isi');
    expect(actualText).not.toContain('<');
  });

  it('decodes entities back to the characters the document meant', () => {
    const actualText = sanitiseDocumentPreviewText('Rp 10.000 &amp; Rp 20.000 &mdash; total');
    expect(actualText).toBe('Rp 10.000 & Rp 20.000 — total');
  });

  it('normalises CRLF and lone CR line endings to newlines', () => {
    const actualText = sanitiseDocumentPreviewText('satu\r\ndua\rtiga');
    expect(actualText).toBe('satu\ndua\ntiga');
  });

  it('removes control characters while keeping tabs and newlines', () => {
    const actualText = sanitiseDocumentPreviewText('kol\u0000om\tsatu\nbaris\u0007dua');
    expect(actualText).toBe('kolom\tsatu\nbarisdua');
  });

  it('changes nothing on a second pass over prose that carries no markup', () => {
    const onceSanitised = sanitiseDocumentPreviewText('Bagian 1\r\n\r\nIsi &amp; lampiran.');
    expect(onceSanitised).toBe('Bagian 1\n\nIsi & lampiran.');
    expect(sanitiseDocumentPreviewText(onceSanitised)).toBe(onceSanitised);
  });

  it('returns an empty string for content that is nothing but markup', () => {
    expect(sanitiseDocumentPreviewText('<script>void 0;</script>')).toBe('');
  });
});
