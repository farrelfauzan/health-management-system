import { INVOICE_TEMPLATE_VARIABLES } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { filterTemplateVariables } from './filter-template-variables';

describe('filterTemplateVariables', () => {
  it('returns every variable for a blank query', () => {
    expect(filterTemplateVariables(INVOICE_TEMPLATE_VARIABLES, '  ')).toHaveLength(
      INVOICE_TEMPLATE_VARIABLES.length,
    );
  });
  it('matches the token: "mrn" surfaces patient.mrn (US-E1-03)', () => {
    const actual = filterTemplateVariables(INVOICE_TEMPLATE_VARIABLES, 'mrn');
    expect(actual.map((variable) => variable.token)).toEqual(['patient.mrn']);
  });
  it('matches either label regardless of case', () => {
    const byIndonesian = filterTemplateVariables(INVOICE_TEMPLATE_VARIABLES, 'REKAM medis');
    const byEnglish = filterTemplateVariables(INVOICE_TEMPLATE_VARIABLES, 'medical record');
    expect(byIndonesian.map((variable) => variable.token)).toEqual(['patient.mrn']);
    expect(byEnglish.map((variable) => variable.token)).toEqual(['patient.mrn']);
  });
  it('matches the sample value', () => {
    const actual = filterTemplateVariables(INVOICE_TEMPLATE_VARIABLES, 'RM-000142');
    expect(actual.map((variable) => variable.token)).toEqual(['patient.mrn']);
  });
});
