import { buildClinicalRequestHtml } from './build-clinical-request-html';
import { BUILT_IN_CLINICAL_REQUEST_TEMPLATES } from './built-in-clinical-request-templates';

/**
 * The fill step, which is where a clinical document either says what the record
 * says or quietly says something else.
 *
 * The substitution is a DOM walk rather than string interpolation, so the
 * assertions that matter most are the hostile ones: a patient whose name
 * contains markup must appear as text on the page, never as markup in it.
 */
describe('buildClinicalRequestHtml', () => {
  const labTemplate = BUILT_IN_CLINICAL_REQUEST_TEMPLATES.LAB_REQUEST.contentHtml;

  it('places scalar values into their tokens', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: { 'clinic.name': 'Klinik Sehat Bersama', 'order.number': 'LAB/20260720/0001' },
      lines: [],
    });

    expect(actual).toContain('Klinik Sehat Bersama');
    expect(actual).toContain('LAB/20260720/0001');
  });

  it('renders the repeating block as a table with one row per test', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: {},
      lines: [
        { 'test.no': '1', 'test.code': 'URPROT', 'test.name': 'Urin - Protein' },
        { 'test.no': '2', 'test.code': 'URGLU', 'test.name': 'Urin - Glukosa' },
      ],
    });

    expect(actual).toContain('Urin - Protein');
    expect(actual).toContain('Urin - Glukosa');
    expect((actual.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  // A name is data. It reaches the page as text or it does not reach it at all.
  it('escapes a value that looks like markup instead of executing it', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: { 'clinic.name': '<script>alert(1)</script>' },
      lines: [],
    });

    expect(actual).not.toContain('<script>');
    expect(actual).toContain('&lt;script&gt;');
  });

  it('escapes markup inside a repeating row too', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: {},
      lines: [{ 'test.name': '<img src=x onerror=alert(1)>' }],
    });

    expect(actual).not.toContain('<img src=x');
    expect(actual).toContain('&lt;img');
  });

  // A remote source in a rendered document is a request the renderer would make
  // on the clinic's behalf, and a template is not entitled to make one.
  it('places a data: image but refuses a remote one', () => {
    const withData = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: { 'order.barcode': 'data:image/svg+xml;base64,AAA' },
      lines: [],
    });
    const withRemote = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: { 'order.barcode': 'https://example.test/track.png' },
      lines: [],
    });

    expect(withData).toContain('data:image/svg+xml;base64,AAA');
    expect(withRemote).not.toContain('example.test');
  });

  it('leaves an unfilled token empty rather than printing its name', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: labTemplate,
      values: {},
      lines: [],
    });
    // The `data-hms-var` attribute stays — it is the grammar, and the invoice
    // builder leaves it too. What must not survive is the token name as
    // something a patient reads on the paper.
    const visibleText = actual.replace(/<[^>]*>/g, '');

    expect(visibleText).not.toContain('order.number');
    expect(visibleText).not.toContain('patient.fullName');
    expect(actual).not.toContain('{{');
  });

  it('renders the resep block from the prescription template', () => {
    const actual = buildClinicalRequestHtml({
      contentHtml: BUILT_IN_CLINICAL_REQUEST_TEMPLATES.PRESCRIPTION.contentHtml,
      values: { 'prescription.destination': 'Apotek K-24 Kemang' },
      lines: [{ 'medication.no': '1', 'medication.name': 'Amoxicillin 500 mg' }],
    });

    expect(actual).toContain('Apotek K-24 Kemang');
    expect(actual).toContain('Amoxicillin 500 mg');
    expect(actual).toContain('R/');
  });
});
