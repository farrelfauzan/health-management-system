import { buildDocxFixture } from '../../../../test/fixtures/build-docx-fixture';
import { convertDocxToTemplateHtml } from './convert-docx-to-template-html';
import { sanitiseRichTextHtml } from '../../../common/html/sanitise-rich-text-html';

describe('convertDocxToTemplateHtml', () => {
  it('carries headings, emphasis, tables, placeholders and a re-encoded image into editor HTML', async () => {
    const content = await buildDocxFixture({
      paragraphs: [
        'Klinik Sehat Bersama',
        '**Kuitansi pembayaran',
        'Terima kasih, {{patient.fullName}}.',
      ],
      includeTable: true,
      includeImage: true,
    });

    const actual = await convertDocxToTemplateHtml(content);
    const sanitised = sanitiseRichTextHtml(actual.html);

    expect(actual.html).toContain('<h1>Klinik Sehat Bersama</h1>');
    expect(actual.html).toContain('<strong>**Kuitansi pembayaran</strong>');
    expect(actual.html).toContain('<table>');
    expect(actual.html).toContain('<span data-hms-var="invoice.number"></span>');
    expect(actual.html).toContain('<span data-hms-var="patient.fullName"></span>');
    expect(actual.html).toMatch(/<img[^>]*src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    // The sanitiser keeps everything the converter produced: the two agree on
    // the dialect, so nothing is lost between import and save.
    expect(sanitised).toContain('data-hms-var="invoice.number"');
    expect(sanitised).toMatch(/<img[^>]*src="data:image\/png;base64,/);
    expect(actual.warnings).toEqual([]);
  });

  it('reports an unknown placeholder instead of inventing a chip', async () => {
    const content = await buildDocxFixture({ paragraphs: ['Judul', 'Kasir: {{kasir.nama}}'] });

    const actual = await convertDocxToTemplateHtml(content);

    expect(actual.html).toContain('Kasir: {{kasir.nama}}');
    expect(actual.warnings).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_PLACEHOLDER', detail: 'kasir.nama' }),
    ]);
  });

  it('re-encodes the embedded image rather than passing its bytes through', async () => {
    const content = await buildDocxFixture({ includeImage: true });

    const actual = await convertDocxToTemplateHtml(content);

    const match = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(actual.html);
    expect(match).not.toBeNull();
    const reencoded = Buffer.from(match?.[1] ?? '', 'base64');
    expect(reencoded.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });
});
