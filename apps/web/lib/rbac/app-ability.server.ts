import {
  ADMIN_MANAGEMENT_ADMIN_RULES,
  type AppAction,
  type AppRule,
  type AppSubject,
} from '@hms/ui';

import { hasAnyRole, type AccessTokenClaims } from '#lib/auth/access-token-claims';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const SUPPORTED_ACTIONS: AppAction[] = ['create', 'read', 'update', 'delete', 'assign', 'unassign'];
const SUBJECT_BY_RESOURCE: Record<string, AppSubject> = {
  user: 'User',
  role: 'Role',
};

function isSupportedAction(action: string): action is AppAction {
  return SUPPORTED_ACTIONS.includes(action as AppAction);
}

function permissionToRule(permission: string): AppRule | null {
  const [resource, actionScope] = permission.split('.');
  const [action] = (actionScope ?? '').split(':');

  if (!resource || !action || !isSupportedAction(action)) {
    return null;
  }

  const subject = SUBJECT_BY_RESOURCE[resource];
  if (!subject) {
    return null;
  }

  return {
    action,
    subject,
  };
}

export function resolveAppAbilityRules(claims: AccessTokenClaims | null): AppRule[] {
  if (!claims) {
    return [];
  }

  const permissionRules = (claims.permissions ?? [])
    .map(permissionToRule)
    .filter((rule): rule is AppRule => Boolean(rule));

  if (permissionRules.length > 0) {
    return permissionRules;
  }

  if (hasAnyRole(claims, ADMIN_ROLES)) {
    return ADMIN_MANAGEMENT_ADMIN_RULES;
  }

  return [];
}
