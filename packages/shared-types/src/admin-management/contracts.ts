export type AdminRoleOption = {
  id: string;
  code: string;
  name: string;
};

export type AdminUserRole = {
  code: string;
  name: string;
};

export type AdminUser = {
  id: string;
  /**
   * The account holder's name, when one exists (SJ-89).
   *
   * The account's own name (D-027, P20-T05), falling back to the
   * `DoctorProfile` an administrator named before the account existed. Still
   * optional: an account created before names were collected has neither, and
   * clients fall back to `email`.
   */
  fullName?: string;
  email: string;
  isActive: boolean;
  /**
   * Set while the person is in their offboarding window (`P16-T41`). Distinct
   * from `isActive === false`: deactivation is an immediate lockout,
   * offboarding a graceful exit with vault-only access until the deadline.
   * Absent for everyone not offboarded.
   */
  offboardedAt?: string;
  createdAt: string;
  updatedAt: string;
  roles: AdminUserRole[];
};

export type AdminUsersListMeta = {
  page: number;
  limit: number;
  total: number;
};

/**
 * The signed-in person's own account (P20-T05): what `me/account` returns.
 *
 * `fullName` is nullable and stays so — an account created before names were
 * collected has none, and that is a fact about the data rather than an error
 * to render as one.
 */
export type OwnAccountRecord = {
  id: string;
  email: string;
  fullName: string | null;
  /**
   * The last four digits of the operator's NIK (P24-T15, D-039), or null when
   * none is on file. The only form the value ever leaves the API in.
   */
  nikLast4: string | null;
};
