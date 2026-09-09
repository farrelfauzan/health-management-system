import type { PatientAddressDetails } from '@hms/shared-types';

import type { PatientAddressFormValues } from '#lib/patients/patient-address-form-values.types';

/**
 * Seeds the address section from a patient record, or leaves it empty.
 *
 * The resolved names come along with the codes so each combobox can show the
 * chosen row the moment the dialog opens, before its own list has been
 * fetched — an edit that spun through four sequential spinners before showing
 * a clerk their own patient's address would be worse than the free-text input
 * it replaced.
 *
 * Called with nothing on a create and on a prospective-patient conversion,
 * where the booking carries no address and the section opens empty for the desk
 * to fill.
 */
export function buildPatientAddressDefaults(
  addressDetails?: PatientAddressDetails,
): PatientAddressFormValues {
  return {
    provinceCode: addressDetails?.provinceCode ?? '',
    provinceName: addressDetails?.provinceName ?? '',
    regencyCode: addressDetails?.regencyCode ?? '',
    regencyName: addressDetails?.regencyName ?? '',
    districtCode: addressDetails?.districtCode ?? '',
    districtName: addressDetails?.districtName ?? '',
    villageCode: addressDetails?.villageCode ?? '',
    villageName: addressDetails?.villageName ?? '',
    rtRw: addressDetails?.rtRw ?? '',
    postalCode: addressDetails?.postalCode ?? '',
  };
}
