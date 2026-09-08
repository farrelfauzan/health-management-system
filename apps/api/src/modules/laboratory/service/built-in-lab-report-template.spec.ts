import { TEMPLATE_VARIABLES_BY_KIND } from '@hms/shared-types';

import { BUILT_IN_LAB_REPORT_TEMPLATE } from './built-in-lab-report-template';

const TOKEN_PATTERN = /data-hms-var="([^"]+)"/g;

function tokensIn(contentHtml: string): string[] {
  return [...contentHtml.matchAll(TOKEN_PATTERN)].map((match) => match[1] ?? '');
}

/**
 * The registry is the contract between a template and the resolver that fills
 * it. A built-in layout naming a token nothing resolves prints a blank line on
 * a clinical document, so the check is structural rather than left to a
 * reviewer's eye.
 */
describe('built-in lab report template', () => {
  const used = tokensIn(BUILT_IN_LAB_REPORT_TEMPLATE.contentHtml);

  it('names only registry-backed tokens', () => {
    const known = new Set(TEMPLATE_VARIABLES_BY_KIND.LAB_REPORT.map((variable) => variable.token));

    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((token) => !known.has(token))).toEqual([]);
  });

  // The load-bearing ones: a report without the results block is not a
  // report, one without the verifier is not signed, and one without the
  // amendment notice cannot say it replaced another.
  it('prints the results, the verifier, the release time and the amendment notice', () => {
    expect(used).toEqual(
      expect.arrayContaining([
        'results',
        'report.verifierName',
        'report.releasedAt',
        'report.amendmentNotice',
        'order.number',
      ]),
    );
  });

  it('identifies the patient it is about', () => {
    expect(used).toEqual(
      expect.arrayContaining(['patient.fullName', 'patient.mrn', 'patient.dateOfBirth']),
    );
  });

  // The sheet travels on WhatsApp locked with a date of birth. The identifier
  // has no business on it, and the registry offers no token for it to leak
  // through.
  it('carries no NIK token, masked or otherwise', () => {
    expect(used.some((token) => token.toLowerCase().includes('nik'))).toBe(false);
    expect(
      TEMPLATE_VARIABLES_BY_KIND.LAB_REPORT.some((variable) =>
        variable.token.toLowerCase().includes('nik'),
      ),
    ).toBe(false);
  });

  it('is A4 portrait by default', () => {
    expect(BUILT_IN_LAB_REPORT_TEMPLATE.settings.paperSize).toBe('A4');
    expect(BUILT_IN_LAB_REPORT_TEMPLATE.settings.orientation).toBe('PORTRAIT');
  });
});
