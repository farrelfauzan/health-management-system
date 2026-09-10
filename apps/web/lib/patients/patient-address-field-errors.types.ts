import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

/**
 * One message per address field, keyed by the field it belongs under. Empty
 * when nothing is wrong; a key is present only while that field has something
 * to say, so the section can render an error under exactly one select.
 */
export type PatientAddressFieldErrors = Partial<Record<keyof PatientAddressFormValues, string>>;
