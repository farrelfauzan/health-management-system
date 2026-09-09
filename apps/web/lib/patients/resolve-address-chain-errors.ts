import { isAxiosError } from 'axios';
import type { ApiError } from '@hms/shared-types';

import type { PatientAddressFieldErrors } from '#lib/patients/patient-address-field-errors.types';
import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

type ValidationIssue = {
  path?: unknown;
  message?: unknown;
};

const ADDRESS_FIELDS: ReadonlyArray<keyof PatientAddressFormValues> = [
  'provinceCode',
  'regencyCode',
  'districtCode',
  'villageCode',
  'rtRw',
  'postalCode',
];

function isAddressField(value: unknown): value is keyof PatientAddressFormValues {
  return ADDRESS_FIELDS.some((field) => field === value);
}

/**
 * Pulls the address issues out of a rejected patient write and puts each one
 * under the field it names.
 *
 * The API answers a bad chain with `{ error: { details: [{ path, message }] } }`
 * naming the first level that does not fit — a village whose parent is not the
 * chosen district, or a code the master data does not have at all. Those are
 * the two things the form cannot rule out on its own, because a region can be
 * renamed or retired between the list being cached and the record being saved,
 * and without this they would surface only as one sentence in the banner at the
 * top of a dialog that scrolls.
 *
 * Anything the response says about a field outside the address section is left
 * alone here; the banner still shows the overall message.
 */
export function resolveAddressChainErrors(error: unknown): PatientAddressFieldErrors {
  if (!isAxiosError(error)) {
    return {};
  }
  const payload = error.response?.data as Partial<ApiError> | undefined;
  const details = payload?.error?.details;
  if (!Array.isArray(details)) {
    return {};
  }
  const errors: PatientAddressFieldErrors = {};
  for (const issue of details as ValidationIssue[]) {
    const [field] = Array.isArray(issue.path) ? issue.path : [];
    if (isAddressField(field) && typeof issue.message === 'string' && errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
