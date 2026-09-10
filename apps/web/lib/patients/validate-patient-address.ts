import { RT_RW_PATTERN, POSTAL_CODE_PATTERN } from '@hms/shared-types';

import type { PatientAddressFieldErrors } from '#lib/patients/patient-address-field-errors.types';
import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

type ValidatePatientAddressParams = {
  values: PatientAddressFormValues;
  /**
   * False on an edit, where a record that predates the region master data may
   * legitimately still have no chain and the clerk is saving an unrelated
   * field. True on a create, where the schema requires all four.
   */
  isChainRequired: boolean;
  messages: {
    provinceRequired: string;
    regencyRequired: string;
    districtRequired: string;
    villageRequired: string;
    chainIncomplete: string;
    rtRwInvalid: string;
    postalCodeInvalid: string;
  };
};

/**
 * What is wrong with the address section, one message per field, so each error
 * renders under the select it belongs to rather than as one banner naming a
 * field the clerk then has to hunt for.
 *
 * Checked against the same patterns `@hms/shared-types` gives the API, so a
 * value this accepts is never refused for its shape on the far side; what the
 * API can still refuse is a chain the master data disagrees with, and
 * {@link resolveAddressChainErrors} puts that back on the same fields.
 */
export function validatePatientAddress({
  values,
  isChainRequired,
  messages,
}: ValidatePatientAddressParams): PatientAddressFieldErrors {
  const errors: PatientAddressFieldErrors = {};
  const chosenLevels = [
    values.provinceCode,
    values.regencyCode,
    values.districtCode,
    values.villageCode,
  ].filter((code) => code !== '');
  // On an edit a chain half filled in is still refused: the API replaces it
  // whole or leaves it alone, so there is no such thing as saving two of four.
  const isPartial = chosenLevels.length > 0 && chosenLevels.length < 4;

  if (isChainRequired || isPartial) {
    if (values.provinceCode === '') {
      errors.provinceCode = isPartial ? messages.chainIncomplete : messages.provinceRequired;
    }
    if (values.regencyCode === '') {
      errors.regencyCode = isPartial ? messages.chainIncomplete : messages.regencyRequired;
    }
    if (values.districtCode === '') {
      errors.districtCode = isPartial ? messages.chainIncomplete : messages.districtRequired;
    }
    if (values.villageCode === '') {
      errors.villageCode = isPartial ? messages.chainIncomplete : messages.villageRequired;
    }
  }
  if (values.rtRw.trim() !== '' && !RT_RW_PATTERN.test(values.rtRw.trim())) {
    errors.rtRw = messages.rtRwInvalid;
  }
  if (values.postalCode.trim() !== '' && !POSTAL_CODE_PATTERN.test(values.postalCode.trim())) {
    errors.postalCode = messages.postalCodeInvalid;
  }

  return errors;
}
