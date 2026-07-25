export type ListUsersParams = {
  page: number;
  limit: number;
  search?: string;
  roleCode?: string;
  isActive?: boolean;
};
