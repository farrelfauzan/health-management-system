import type { DoctorCredentialValue } from '#doctor-credential-option/contracts';
import type { DoctorCredentialKindValue } from '#doctor-credential-option/schemas';

/**
 * Turns one stored credential into its printed form, against a catalog already
 * loaded for the whole response. Passed down a response mapper rather than
 * queried per row: a directory page renders up to a hundred doctors.
 */
export type DoctorCredentialResolver = (
  kind: DoctorCredentialKindValue,
  stored: string,
) => DoctorCredentialValue;

export type DoctorCredentialOptionRecord = {
  id: string;
  kind: DoctorCredentialKindValue;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ListDoctorCredentialOptionsParams = {
  kind?: DoctorCredentialKindValue;
  includeInactive?: boolean;
};

export type CreateDoctorCredentialOptionPayload = {
  kind: DoctorCredentialKindValue;
  code: string;
  label: string;
  sortOrder: number;
};

export type UpdateDoctorCredentialOptionPayload = {
  label?: string;
  sortOrder?: number;
  isActive?: boolean;
};
