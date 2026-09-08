import type { LabSpecimenLabel } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { buildSpecimenLabelHtml } from './build-specimen-label-html';

function buildLabel(overrides: Partial<LabSpecimenLabel> = {}): LabSpecimenLabel {
  return {
    accessionNumber: 'SPC/20260907/0001',
    orderNumber: 'LAB/20260907/0001',
    specimenType: 'WHOLE_BLOOD',
    collectedAt: '2026-09-07T01:15:00.000Z',
    patient: {
      id: '38a3f0f1-51d3-4f68-9d54-1f6a1de1a002',
      fullName: 'Siti Rahayu',
      mrn: 'MRN00000123',
      dateOfBirth: '1990-04-12',
      sex: 'FEMALE',
      ageYears: 36,
    },
    ...overrides,
  };
}

describe('buildSpecimenLabelHtml', () => {
  it('renders one 50 × 25 mm page per specimen', () => {
    const actual = buildSpecimenLabelHtml([
      buildLabel(),
      buildLabel({ accessionNumber: 'SPC/20260907/0002', specimenType: 'URINE' }),
    ]);

    expect((actual.match(/<section class="label">/g) ?? []).length).toBe(2);
    expect(actual).toContain('@page { size: 50mm 25mm; margin: 0; }');
    expect(actual).toContain('SPC/20260907/0001');
    expect(actual).toContain('SPC/20260907/0002');
  });

  it('carries the identity a bench matches a tube against', () => {
    const actual = buildSpecimenLabelHtml([buildLabel()]);

    expect(actual).toContain('Siti Rahayu');
    expect(actual).toContain('MRN00000123');
    expect(actual).toContain('P · 36 th');
    expect(actual).toContain('LAB/20260907/0001');
  });

  // A name is data. It reaches the label as text or not at all.
  it('escapes a name that looks like markup', () => {
    const actual = buildSpecimenLabelHtml([
      buildLabel({ patient: { ...buildLabel().patient, fullName: '<img src=x onerror=alert(1)>' } }),
    ]);

    expect(actual).not.toContain('<img src=x');
    expect(actual).toContain('&lt;img');
  });
});
