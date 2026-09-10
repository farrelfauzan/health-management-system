import type { AddressChainField } from '@hms/shared-types';

import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

/** The chain top to bottom, which is also the order descendants are cleared in. */
const ADDRESS_CHAIN_ORDER: ReadonlyArray<AddressChainField> = [
  'provinceCode',
  'regencyCode',
  'districtCode',
  'villageCode',
];

const ADDRESS_NAME_FIELD: Readonly<Record<AddressChainField, keyof PatientAddressFormValues>> = {
  provinceCode: 'provinceName',
  regencyCode: 'regencyName',
  districtCode: 'districtName',
  villageCode: 'villageName',
};

type ApplyPatientAddressChangeParams = {
  values: PatientAddressFormValues;
  field: AddressChainField;
  code: string;
  name: string;
};

/**
 * Sets one level of the chain and empties everything below it.
 *
 * A regency only means anything under its province, so leaving the lower
 * levels alone after a province change would keep codes on screen that no
 * longer belong together and would be refused by the API's chain check on
 * submit. Clearing them is the only honest thing the form can do: the clerk
 * picked a different place.
 */
export function applyPatientAddressChange({
  values,
  field,
  code,
  name,
}: ApplyPatientAddressChangeParams): PatientAddressFormValues {
  const next: PatientAddressFormValues = {
    ...values,
    [field]: code,
    [ADDRESS_NAME_FIELD[field]]: name,
  };
  const descendants = ADDRESS_CHAIN_ORDER.slice(ADDRESS_CHAIN_ORDER.indexOf(field) + 1);
  for (const descendant of descendants) {
    next[descendant] = '';
    next[ADDRESS_NAME_FIELD[descendant]] = '';
  }
  return next;
}
