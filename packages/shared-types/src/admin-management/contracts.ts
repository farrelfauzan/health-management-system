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
