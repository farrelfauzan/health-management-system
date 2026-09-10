import {
  formatPatientAddress,
  PatientAddressDetails,
  PatientAddressRecordFields,
} from '@hms/shared-types';

type AddressSource = PatientAddressRecordFields & { address: string | null };

function toOptional(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * The response shape of a structured address (P19-T10): codes, the names
 * the read path resolved through the region relations, and the one printable
 * line. Nulls become absent keys, the same rule the rest of the patient
 * response follows, and a legacy row prints its street line alone.
 */
export function buildPatientAddressDetails(record: AddressSource): PatientAddressDetails {
  return {
    provinceCode: toOptional(record.provinceCode),
    provinceName: toOptional(record.provinceName),
    regencyCode: toOptional(record.regencyCode),
    regencyName: toOptional(record.regencyName),
    districtCode: toOptional(record.districtCode),
    districtName: toOptional(record.districtName),
    villageCode: toOptional(record.villageCode),
    villageName: toOptional(record.villageName),
    rtRw: toOptional(record.rtRw),
    postalCode: toOptional(record.postalCode),
    formattedAddress: formatPatientAddress(record),
  };
}
