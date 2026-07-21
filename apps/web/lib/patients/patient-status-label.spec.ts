import { describe, expect, it } from 'vitest';

import { resolveStatusTone } from '#lib/shared/status-badge-tone';
import { formatPatientStatusLabel } from './patient-status-label';

describe('patient status mapping', () => {
  it('maps backend enums to the design vocabulary', () => {
    expect(formatPatientStatusLabel('IN_PATIENT')).toBe('IN-PATIENT');
    expect(formatPatientStatusLabel('OUT_PATIENT')).toBe('OUT-PATIENT');
    expect(formatPatientStatusLabel('DISCHARGED')).toBe('DISCHARGED');
  });

  it('falls back to an uppercased label for unknown statuses', () => {
    expect(formatPatientStatusLabel('archived')).toBe('ARCHIVED');
  });

  it('resolves the design badge tone for each patient status', () => {
    expect(resolveStatusTone('IN_PATIENT')).toBe('info');
    expect(resolveStatusTone('OUT_PATIENT')).toBe('success');
    expect(resolveStatusTone('DISCHARGED')).toBe('neutral');
  });
});
