import { CurrentUser } from '../../../common/auth/current-user.type';
import { ActorPermission } from '../../../common/authorization/actor.types';
import { ChatToolCaller } from './chat-tool.types';

/**
 * Flattens the authenticated user's role rows into the registry's caller
 * projection. The shape mirrors what `AuthRepository.findUserById` returns;
 * building it here (once per exchange) keeps the registry synchronous and
 * free of persistence concerns.
 */
export function buildChatToolCaller(
  user: CurrentUser,
  actorRecord: {
    roles: Array<{
      role: { code: string; permissions: Array<{ permission: ActorPermission }> };
    }>;
  },
): ChatToolCaller {
  return {
    user,
    roleCodes: actorRecord.roles.map((userRole) => userRole.role.code),
    permissions: actorRecord.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission),
    ),
  };
}
