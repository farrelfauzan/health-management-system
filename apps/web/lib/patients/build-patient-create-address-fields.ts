import type { CreatePatientInput } from '@hms/shared-types';

import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

type CreateAddressFields = Pick<
  CreatePatientInput,
  'provinceCode' | 'regencyCode' | 'districtCode' | 'villageCode'
> &
  Partial<Pick<CreatePatientInput, 'rtRw' | 'postalCode'>>;

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The structured address of a create payload.
 *
 * The four region codes are passed through as they stand: the create schema
 * requires them since `P19-T11` and the section refuses to submit without
 * them, so a blank reaching here is a bug worth seeing as a 400 rather than one
 * worth hiding by dropping the key. RT/RW and the postal code are dropped when
 * blank, like every other optional field on this form — plenty of Indonesian
 * addresses carry neither.
 */
export function buildPatientCreateAddressFields(
  values: PatientAddressFormValues,
): CreateAddressFields {
  const fields: CreateAddressFields = {
    provinceCode: values.provinceCode,
    regencyCode: values.regencyCode,
    districtCode: values.districtCode,
    villageCode: values.villageCode,
  };
  const rtRw = trimToUndefined(values.rtRw);
  const postalCode = trimToUndefined(values.postalCode);

  if (rtRw) fields.rtRw = rtRw;
  if (postalCode) fields.postalCode = postalCode;

  return fields;
}
