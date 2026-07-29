import type {
  DoctorEducation,
  DoctorEducationInput,
  DoctorLicense,
  DoctorLicenseInput,
  DoctorLicenseTypeValue,
} from '@hms/shared-types';

export type LicenseRow = {
  key: string;
  type: DoctorLicenseTypeValue;
  licenseNumber: string;
  issuedAt: string;
  expiresAt: string;
};

export type EducationRow = {
  key: string;
  institution: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
};

export function buildEmptyLicenseRow(key: string): LicenseRow {
  return { key, type: 'STR', licenseNumber: '', issuedAt: '', expiresAt: '' };
}

export function buildEmptyEducationRow(key: string): EducationRow {
  return { key, institution: '', degree: '', fieldOfStudy: '', graduationYear: '' };
}

export function toLicenseRows(licenses: DoctorLicense[]): LicenseRow[] {
  return licenses.map((license) => ({
    key: license.id,
    type: license.type,
    licenseNumber: license.licenseNumber,
    issuedAt: license.issuedAt ?? '',
    expiresAt: license.expiresAt ?? '',
  }));
}

export function toEducationRows(educations: DoctorEducation[]): EducationRow[] {
  return educations.map((education) => ({
    key: education.id,
    institution: education.institution,
    degree: education.degree,
    fieldOfStudy: education.fieldOfStudy ?? '',
    graduationYear: education.graduationYear ? String(education.graduationYear) : '',
  }));
}

/**
 * The API replaces the whole list on every write, so the form always submits
 * the complete set. Rows with no licence number are treated as untouched
 * scaffolding and dropped rather than sent as empty entries.
 */
export function buildLicensePayload(rows: LicenseRow[]): DoctorLicenseInput[] {
  return rows
    .filter((row) => row.licenseNumber.trim().length > 0)
    .map((row) => ({
      type: row.type,
      licenseNumber: row.licenseNumber.trim(),
      ...(row.issuedAt ? { issuedAt: row.issuedAt } : {}),
      ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    }));
}

export function buildEducationPayload(rows: EducationRow[]): DoctorEducationInput[] {
  return rows
    .filter((row) => row.institution.trim().length > 0 && row.degree.trim().length > 0)
    .map((row) => {
      const graduationYear = Number(row.graduationYear.trim());
      const fieldOfStudy = row.fieldOfStudy.trim();
      return {
        institution: row.institution.trim(),
        degree: row.degree.trim(),
        ...(fieldOfStudy.length > 0 ? { fieldOfStudy } : {}),
        ...(Number.isInteger(graduationYear) && graduationYear > 0 ? { graduationYear } : {}),
      };
    });
}
