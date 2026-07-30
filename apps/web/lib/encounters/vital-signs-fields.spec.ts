import { describe, expect, it } from 'vitest';

import {
  buildVitalSignsPayload,
  EMPTY_VITAL_SIGNS_FORM,
  type VitalSignsFormValues,
} from './vital-signs-fields';

function buildForm(overrides: Partial<VitalSignsFormValues>): VitalSignsFormValues {
  return { ...EMPTY_VITAL_SIGNS_FORM, ...overrides };
}

describe('buildVitalSignsPayload', () => {
  it('sends only the measured fields, as numbers', () => {
    const result = buildVitalSignsPayload(
      buildForm({ weightKg: '68.4', pulseRate: '78' }),
      '  seated  ',
    );

    expect(result).toEqual({
      isValid: true,
      payload: { weightKg: 68.4, pulseRate: 78, notes: 'seated' },
    });
  });

  it('rejects an entirely empty measurement set', () => {
    const result = buildVitalSignsPayload(buildForm({}), '');

    expect(result).toEqual({ isValid: false, message: 'Record at least one measurement.' });
  });

  it('rejects a decimal typo that leaves the plausible range', () => {
    const result = buildVitalSignsPayload(buildForm({ temperatureCelsius: '368' }), '');

    expect(result.isValid).toBe(false);
  });

  it('rejects a fractional value on an integer-only field', () => {
    const result = buildVitalSignsPayload(buildForm({ pulseRate: '78.5' }), '');

    expect(result).toEqual({ isValid: false, message: 'Pulse must be a whole number.' });
  });

  it('rejects a blood pressure whose systolic does not exceed diastolic', () => {
    const result = buildVitalSignsPayload(
      buildForm({ systolicBloodPressure: '80', diastolicBloodPressure: '90' }),
      '',
    );

    expect(result).toEqual({
      isValid: false,
      message: 'Systolic blood pressure must be higher than diastolic.',
    });
  });

  it('accepts a critical but physiologically possible reading', () => {
    const result = buildVitalSignsPayload(
      buildForm({
        oxygenSaturation: '82',
        systolicBloodPressure: '200',
        diastolicBloodPressure: '120',
      }),
      '',
    );

    expect(result.isValid).toBe(true);
  });

  it('rejects a non-numeric entry', () => {
    const result = buildVitalSignsPayload(buildForm({ weightKg: 'sixty' }), '');

    expect(result).toEqual({ isValid: false, message: 'Weight must be a number.' });
  });
});
