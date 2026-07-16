import type { AppRule } from './ability';

export const ADMIN_MANAGEMENT_ADMIN_RULES: AppRule[] = [
  { action: 'read', subject: 'User' },
  { action: 'create', subject: 'User' },
  { action: 'update', subject: 'User' },
  { action: 'read', subject: 'Role' },
];

export const ADMIN_MANAGEMENT_READ_ONLY_RULES: AppRule[] = [{ action: 'read', subject: 'User' }];
