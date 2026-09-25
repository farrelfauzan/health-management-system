import { ClinicalDocumentSignerRecord, resolveClinicianName } from '@hms/shared-types';

/**
 * A row selected with `CLINICIAN_SIGNER_SELECT` as the signer record a letter
 * builder reads. The name goes through {@link resolveClinicianName}, so the
 * signature and the requester line elsewhere on the record agree (D-027).
 */
export function toClinicalDocumentSignerRecord(row: {
  fullName: string;
  ownerUser: { fullName: string | null } | null;
  profession: 'DOCTOR' | 'MIDWIFE';
  licenseNumber: string;
  licenses: readonly { licenseNumber: string; expiresAt: Date | null }[];
}): ClinicalDocumentSignerRecord {
  return {
    fullName: resolveClinicianName(row),
    profession: row.profession,
    strNumber: row.licenseNumber,
    practiceLicenses: row.licenses.map((license) => ({
      licenseNumber: license.licenseNumber,
      expiresAt: license.expiresAt,
    })),
  };
}
