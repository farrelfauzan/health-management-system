import type { DoctorCredentialKindValue } from '#doctor-credential-option/schemas';

export type DoctorCredentialOption = {
  id: string;
  kind: DoctorCredentialKindValue;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * One stored credential on its way out of the API (P19-T14).
 *
 * Every consumer wants the printed form, and only the form that edits it wants
 * the code, so both travel together. `isLegacy` is the honest half: values
 * written before the option catalog existed are free text that matched no
 * option, and the form has to ask an admin to pick a replacement rather than
 * silently dropping a credential nobody can re-derive from the record.
 */
export type DoctorCredentialValue = {
  /** The option code when the stored value resolved; absent for legacy free text. */
  code?: string;
  /** The printed form: the option's label, or the raw stored text when nothing matched. */
  label: string;
  /** True when the stored value matched no option, by code or by label. */
  isLegacy: boolean;
};
