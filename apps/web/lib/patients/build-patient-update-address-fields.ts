import type { UpdatePatientInput } from '@hms/shared-types';

import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

type UpdateAddressFields = Partial<
  Pick<
    UpdatePatientInput,
    'provinceCode' | 'regencyCode' | 'districtCode' | 'villageCode' | 'rtRw' | 'postalCode'
  >
>;

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * The structured address of an edit payload.
 *
 * The chain is sent whole or not at all, because that is what
 * `updatePatientSchema` accepts: a village stored under yesterday's district is
 * an address nobody can print. A record that has no chain yet — everything
 * created before `P19-T10`, and every antrean or chat registration — therefore
 * keeps saving unchanged as long as the clerk leaves the section alone, which
 * is what "save without touching the address keeps it" means.
 *
 * A blank RT/RW or postal code means "leave the stored value alone", matching
 * every other field on this form. Clearing one is deliberately not something
 * this dialog can do; the API takes `null` for that when a screen needs it.
 */
export function buildPatientUpdateAddressFields(
  values: PatientAddressFormValues,
): UpdateAddressFields {
  const fields: UpdateAddressFields = {};
  const rtRw = trimToUndefined(values.rtRw);
  const postalCode = trimToUndefined(values.postalCode);
  const hasWholeChain =
    values.provinceCode !== '' &&
    values.regencyCode !== '' &&
    values.districtCode !== '' &&
    values.villageCode !== '';

  if (rtRw) fields.rtRw = rtRw;
  if (postalCode) fields.postalCode = postalCode;
  if (hasWholeChain) {
    fields.provinceCode = values.provinceCode;
    fields.regencyCode = values.regencyCode;
    fields.districtCode = values.districtCode;
    fields.villageCode = values.villageCode;
  }

  return fields;
}
