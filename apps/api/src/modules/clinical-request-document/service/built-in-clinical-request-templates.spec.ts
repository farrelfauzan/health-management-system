import { TEMPLATE_VARIABLES_BY_KIND } from '@hms/shared-types';

import { BUILT_IN_CLINICAL_REQUEST_TEMPLATES } from './built-in-clinical-request-templates';

const TOKEN_PATTERN = /data-hms-var="([^"]+)"/g;

function tokensIn(contentHtml: string): string[] {
  return [...contentHtml.matchAll(TOKEN_PATTERN)].map((match) => match[1] ?? '');
}

/**
 * The registry is the contract between a template and the resolver that fills
 * it. A built-in layout naming a token nothing resolves prints a blank line on
 * a clinical document and nobody notices until a patient hands the paper over
 * — so the check is structural rather than left to a reviewer's eye.
 */
describe('built-in clinical request templates', () => {
  it.each(['LAB_REQUEST', 'PRESCRIPTION'] as const)(
    'the %s layout names only registry-backed tokens',
    (kind) => {
      const known = new Set(TEMPLATE_VARIABLES_BY_KIND[kind].map((variable) => variable.token));
      const used = tokensIn(BUILT_IN_CLINICAL_REQUEST_TEMPLATES[kind].contentHtml);

      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((token) => !known.has(token))).toEqual([]);
    },
  );

  // The load-bearing ones. A surat pengantar without the number is a letter the
  // counter cannot look up, and a resep without the signature block is not a
  // prescription anybody may dispense against.
  it('prints the order number, its barcode and the test block on the lab letter', () => {
    const used = tokensIn(BUILT_IN_CLINICAL_REQUEST_TEMPLATES.LAB_REQUEST.contentHtml);

    expect(used).toEqual(
      expect.arrayContaining(['order.number', 'order.barcode', 'tests', 'order.destination']),
    );
  });

  it('prints the medication block and the prescriber on the resep', () => {
    const used = tokensIn(BUILT_IN_CLINICAL_REQUEST_TEMPLATES.PRESCRIPTION.contentHtml);

    expect(used).toEqual(
      expect.arrayContaining([
        'medications',
        'doctor.fullName',
        'doctor.licenseNumber',
        'prescription.destination',
      ]),
    );
  });

  it.each(['LAB_REQUEST', 'PRESCRIPTION'] as const)(
    'the %s layout identifies the patient it is about',
    (kind) => {
      const used = tokensIn(BUILT_IN_CLINICAL_REQUEST_TEMPLATES[kind].contentHtml);

      expect(used).toEqual(expect.arrayContaining(['patient.fullName', 'patient.mrn']));
    },
  );
});
