import { VITAL_SIGNS_BOUNDS, type RecordVitalSignsInput } from '@hms/shared-types';

export type VitalSignsFieldKey = keyof typeof VITAL_SIGNS_BOUNDS;

export type VitalSignsField = {
  key: VitalSignsFieldKey;
  label: string;
  unit: string;
  isInteger: boolean;
  min: number;
  max: number;
};

/**
 * The measurable fields in the order a nurse records them, each carrying the
 * bounds the API validates against so the form rejects a decimal typo before
 * it becomes a 400. Bounds are read from the shared constant rather than
 * copied — the two cannot drift apart.
 */
export const VITAL_SIGNS_FIELDS: readonly VitalSignsField[] = [
  { key: 'heightCm', label: 'Height', unit: 'cm', isInteger: false },
  { key: 'weightKg', label: 'Weight', unit: 'kg', isInteger: false },
  { key: 'systolicBloodPressure', label: 'Systolic BP', unit: 'mmHg', isInteger: true },
  { key: 'diastolicBloodPressure', label: 'Diastolic BP', unit: 'mmHg', isInteger: true },
  { key: 'pulseRate', label: 'Pulse', unit: 'bpm', isInteger: true },
  { key: 'respiratoryRate', label: 'Respiratory Rate', unit: '/min', isInteger: true },
  { key: 'temperatureCelsius', label: 'Temperature', unit: '°C', isInteger: false },
  { key: 'oxygenSaturation', label: 'SpO₂', unit: '%', isInteger: true },
].map((field) => ({
  ...field,
  min: VITAL_SIGNS_BOUNDS[field.key as VitalSignsFieldKey].min,
  max: VITAL_SIGNS_BOUNDS[field.key as VitalSignsFieldKey].max,
})) as readonly VitalSignsField[];

export type VitalSignsFormValues = Record<VitalSignsFieldKey, string>;

export const EMPTY_VITAL_SIGNS_FORM: VitalSignsFormValues = VITAL_SIGNS_FIELDS.reduce(
  (values, field) => ({ ...values, [field.key]: '' }),
  {} as VitalSignsFormValues,
);

export type VitalSignsFormResult =
  { isValid: true; payload: RecordVitalSignsInput } | { isValid: false; message: string };

export type VitalSignsValidationMessages = {
  number?: (field: VitalSignsField) => string;
  integer?: (field: VitalSignsField) => string;
  range?: (field: VitalSignsField) => string;
  required?: string;
  bloodPressure?: string;
};

/**
 * Turns the string-keyed form into the API payload, applying the same three
 * rules the server enforces: values must be numeric and in range, an entirely
 * empty set records nothing, and systolic must exceed diastolic.
 */
export function buildVitalSignsPayload(
  values: VitalSignsFormValues,
  notes: string,
  messages: VitalSignsValidationMessages = {},
): VitalSignsFormResult {
  const payload: Record<string, number | string> = {};

  for (const field of VITAL_SIGNS_FIELDS) {
    const raw = values[field.key].trim();
    if (raw.length === 0) {
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return {
        isValid: false,
        message: messages.number?.(field) ?? `${field.label} must be a number.`,
      };
    }
    if (field.isInteger && !Number.isInteger(parsed)) {
      return {
        isValid: false,
        message: messages.integer?.(field) ?? `${field.label} must be a whole number.`,
      };
    }
    if (parsed < field.min || parsed > field.max) {
      return {
        isValid: false,
        message:
          messages.range?.(field) ??
          `${field.label} must be between ${field.min} and ${field.max} ${field.unit}.`,
      };
    }
    payload[field.key] = parsed;
  }

  if (Object.keys(payload).length === 0) {
    return { isValid: false, message: messages.required ?? 'Record at least one measurement.' };
  }

  const systolic = payload.systolicBloodPressure;
  const diastolic = payload.diastolicBloodPressure;
  if (typeof systolic === 'number' && typeof diastolic === 'number' && systolic <= diastolic) {
    return {
      isValid: false,
      message: messages.bloodPressure ?? 'Systolic blood pressure must be higher than diastolic.',
    };
  }

  const trimmedNotes = notes.trim();
  if (trimmedNotes.length > 0) {
    payload.notes = trimmedNotes;
  }

  return { isValid: true, payload: payload as RecordVitalSignsInput };
}
