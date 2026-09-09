import { buildLabReportHtml } from './build-lab-report-html';
import { BUILT_IN_LAB_REPORT_TEMPLATE } from './built-in-lab-report-template';

/**
 * The fill step, which is where a report either says what the record says or
 * quietly says something else. The substitution is a DOM walk rather than
 * string interpolation, so the assertions that matter most are the hostile
 * ones: a patient whose name contains markup must appear as text on the page,
 * never as markup in it.
 */
describe('buildLabReportHtml', () => {
  const template = BUILT_IN_LAB_REPORT_TEMPLATE.contentHtml;

  it('places scalar values into their tokens', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: { 'clinic.name': 'Klinik Sehat Bersama', 'order.number': 'LAB/20260720/0001' },
      lines: [],
    });

    expect(actual).toContain('Klinik Sehat Bersama');
    expect(actual).toContain('LAB/20260720/0001');
  });

  it('renders the results block as a table with one row per test', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: {},
      lines: [
        { 'result.no': '1', 'result.test': 'Hemoglobin', 'result.value': '11,2' },
        { 'result.no': '2', 'result.test': 'Leukosit', 'result.value': '7,4' },
      ],
    });

    expect(actual).toContain('Hemoglobin');
    expect(actual).toContain('Leukosit');
    expect(actual).toContain('Nilai rujukan');
    expect((actual.match(/<tr/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  // A flagged value marks its whole row: the reader scanning thirty numbers
  // finds the abnormal one by the row, and a photocopy keeps bold where it
  // loses colour.
  it('marks the row of a flagged value and leaves a normal one plain', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: {},
      lines: [
        { 'result.no': '1', 'result.test': 'Hemoglobin', 'result.flag': '▼' },
        { 'result.no': '2', 'result.test': 'Leukosit', 'result.flag': '' },
      ],
    });

    expect((actual.match(/class="hms-row-flagged"/g) ?? []).length).toBe(1);
    expect(actual).toContain('▼');
  });

  it('escapes a value that looks like markup instead of executing it', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: { 'patient.fullName': '<script>alert(1)</script>' },
      lines: [],
    });

    expect(actual).not.toContain('<script>');
    expect(actual).toContain('&lt;script&gt;');
  });

  it('escapes markup inside a result row too', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: {},
      lines: [{ 'result.test': '<img src=x onerror=alert(1)>' }],
    });

    expect(actual).not.toContain('<img src=x');
    expect(actual).toContain('&lt;img');
  });

  it('places a data: logo but refuses a remote one', () => {
    const withData = buildLabReportHtml({
      contentHtml: template,
      values: { 'clinic.logo': 'data:image/png;base64,AAA' },
      lines: [],
    });
    const withRemote = buildLabReportHtml({
      contentHtml: template,
      values: { 'clinic.logo': 'https://example.test/track.png' },
      lines: [],
    });

    expect(withData).toContain('data:image/png;base64,AAA');
    expect(withRemote).not.toContain('example.test');
  });

  it('leaves an unfilled token empty rather than printing its name', () => {
    const actual = buildLabReportHtml({ contentHtml: template, values: {}, lines: [] });
    const visibleText = actual.replace(/<[^>]*>/g, '');

    expect(visibleText).not.toContain('order.number');
    expect(visibleText).not.toContain('report.amendmentNotice');
    expect(actual).not.toContain('{{');
  });

  // The banner is the point of an amended sheet. It has to be on the page
  // when it is filled, and the stylesheet has to hide the empty box when it is
  // not — a blank bordered box on every ordinary report would teach readers
  // to ignore it.
  it('prints the amendment notice when given and ships the rule that hides an empty one', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: { 'report.amendmentNotice': 'AMENDED — menggantikan laporan tanggal 7 Juli 2026' },
      lines: [],
    });

    expect(actual).toContain('AMENDED — menggantikan laporan tanggal 7 Juli 2026');
    expect(actual).toContain('.hms-amendment-notice:has(> span:empty) { display: none; }');
  });

  // P18-T14. The note is one sentence under the table when the verifier wrote
  // one. When they did not, the whole block goes — heading included — so an
  // ordinary sheet carries no empty "Catatan" for readers to learn to ignore.
  it('prints the verifier note under its heading when given', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: { 'report.note': 'Sampel lipemik, ulangi puasa 12 jam.' },
      lines: [],
    });

    expect(actual).toContain('Catatan');
    expect(actual).toContain('Sampel lipemik, ulangi puasa 12 jam.');
  });

  it('omits the note block entirely when the note is empty', () => {
    const actual = buildLabReportHtml({
      contentHtml: template,
      values: { 'report.note': '' },
      lines: [],
    });

    expect(actual).not.toContain('Catatan');
    expect(actual).not.toContain('hms-report-note');
    expect(actual).not.toContain('report.note');
  });

  it('repeats the table header on every page and never splits a row', () => {
    const actual = buildLabReportHtml({ contentHtml: template, values: {}, lines: [] });

    expect(actual).toContain('thead { display: table-header-group; }');
    expect(actual).toContain('tr { page-break-inside: avoid; }');
  });
});
