import { generateHTML, generateJSON } from '@tiptap/core';
import { describe, expect, it } from 'vitest';

import { buildRichTextEditorExtensions } from '#lib/rich-text/rich-text-editor-extensions';

const extensions = buildRichTextEditorExtensions();

function roundTripHtml(inputHtml: string): string {
  return generateHTML(generateJSON(inputHtml, extensions), extensions);
}

describe('buildRichTextEditorExtensions', () => {
  it('serialises text alignment as an inline style the sanitiser keeps', () => {
    const actualHtml = roundTripHtml('<p style="text-align: right">Total</p>');
    expect(actualHtml).toContain('text-align: right');
    expect(actualHtml).not.toContain('class="text-right"');
  });
  it('round-trips the page-break div with its class and inline style', () => {
    const inputHtml = '<div class="hms-page-break" style="page-break-after:always"></div>';
    const actualHtml = roundTripHtml(`<p>a</p>${inputHtml}<p>b</p>`);
    expect(actualHtml).toContain('class="hms-page-break"');
    expect(actualHtml).toMatch(/page-break-after:\s*always/);
  });
  it('parses a bare page-break-after style back into the page-break node', () => {
    const actualJson = generateJSON('<div style="page-break-after:always"></div>', extensions);
    const nodeTypes = (actualJson.content ?? []).map((node: { type?: string }) => node.type);
    expect(nodeTypes).toContain('pageBreak');
  });
  it('round-trips tables with header cells and spans', () => {
    const inputHtml =
      '<table><thead><tr><th colspan="2">Item</th></tr></thead><tbody><tr><td>Konsultasi</td><td>Rp 150.000</td></tr></tbody></table>';
    const actualHtml = roundTripHtml(inputHtml);
    expect(actualHtml).toContain('<th colspan="2"');
    expect(actualHtml).toContain('<p>Konsultasi</p>');
    expect(actualHtml).toContain('<table');
    expect(actualHtml).toContain('<tbody>');
  });
  it('keeps data-URI images', () => {
    const inputHtml =
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" alt="logo">';
    const actualHtml = roundTripHtml(inputHtml);
    expect(actualHtml).toContain('src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="');
    expect(actualHtml).toContain('alt="logo"');
  });
  it('drops links, which the server sanitiser would unwrap anyway', () => {
    const actualHtml = roundTripHtml('<p><a href="https://example.com">Klinik</a></p>');
    expect(actualHtml).not.toContain('<a');
    expect(actualHtml).toContain('Klinik');
  });
  it('keeps headings, marks, lists and horizontal rules', () => {
    const inputHtml =
      '<h2>Rincian</h2><p><strong>a</strong><em>b</em><u>c</u></p><ul><li><p>x</p></li></ul><ol><li><p>y</p></li></ol><hr>';
    const actualHtml = roundTripHtml(inputHtml);
    expect(actualHtml).toContain('<h2>Rincian</h2>');
    expect(actualHtml).toContain('<strong>a</strong>');
    expect(actualHtml).toContain('<em>b</em>');
    expect(actualHtml).toContain('<u>c</u>');
    expect(actualHtml).toContain('<ul>');
    expect(actualHtml).toContain('<ol>');
    expect(actualHtml).toContain('<hr>');
  });
});
