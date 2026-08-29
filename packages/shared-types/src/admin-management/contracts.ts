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
   * Absent for most staff by construction: `users` has no name column, so the
   * only name an account can carry comes from the `DoctorProfile` that owns it.
   * Clients fall back to `email`, which every account has and which is unique.
   */
  fullName?: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  roles: AdminUserRole[];
};

export type AdminUsersListMeta = {
  page: number;
  limit: number;
  total: number;
};
