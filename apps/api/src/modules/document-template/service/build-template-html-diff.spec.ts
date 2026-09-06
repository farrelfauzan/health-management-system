import { buildTemplateHtmlDiff } from './build-template-html-diff';

describe('buildTemplateHtmlDiff', () => {
  it('reports nothing changed when the two layouts agree', () => {
    const inputHtml = '<div><h1>Klinik</h1><p>Terima kasih</p></div>';

    const actual = buildTemplateHtmlDiff(inputHtml, inputHtml);

    expect(actual.every((segment) => segment.kind === 'UNCHANGED')).toBe(true);
  });

  it('marks a replaced paragraph as one removal and one addition', () => {
    const actual = buildTemplateHtmlDiff(
      '<div><h1>Klinik</h1><p>Terima kasih</p></div>',
      '<div><h1>Klinik</h1><p>Terima kasih atas kunjungan Anda</p></div>',
    );

    expect(actual.filter((segment) => segment.kind === 'REMOVED')).toEqual([
      { kind: 'REMOVED', text: '<p>Terima kasih' },
    ]);
    expect(actual.filter((segment) => segment.kind === 'ADDED')).toEqual([
      { kind: 'ADDED', text: '<p>Terima kasih atas kunjungan Anda' },
    ]);
  });

  it('reports an inserted row as an addition and leaves its neighbours alone', () => {
    const actual = buildTemplateHtmlDiff(
      '<table><tr><td>Jasa dokter</td></tr></table>',
      '<table><tr><td>Jasa dokter</td></tr><tr><td>Materai</td></tr></table>',
    );

    expect(actual.filter((segment) => segment.kind === 'REMOVED')).toEqual([]);
    expect(actual.filter((segment) => segment.kind === 'ADDED').map((s) => s.text)).toEqual([
      '<tr>',
      '<td>Materai',
      '</td>',
      '</tr>',
    ]);
  });

  it('stays quiet about whitespace, which the editor rewrites on every save', () => {
    const actual = buildTemplateHtmlDiff(
      '<div>\n  <p>Total</p>\n</div>',
      '<div><p>Total</p></div>',
    );

    expect(actual.some((segment) => segment.kind !== 'UNCHANGED')).toBe(false);
  });

  it('treats a first publish — nothing to compare against — as all addition', () => {
    const actual = buildTemplateHtmlDiff('', '<div><p>Total</p></div>');

    expect(actual.every((segment) => segment.kind === 'ADDED')).toBe(true);
    expect(actual.length).toBeGreaterThan(0);
  });
});
