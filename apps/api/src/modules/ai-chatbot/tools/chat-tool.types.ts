import { ChatChannelValue } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ActorPermission } from '../../../common/authorization/actor.types';

/**
 * The registry's flattened view of who is asking. The dispatch loop builds
 * it from the authenticated user's role rows at request time; keeping the
 * registry on a pre-flattened projection rather than the Prisma actor shape
 * keeps every offering/dispatch rule synchronous and independently testable.
 * Framework-internal on purpose — `CurrentUser` must not leak outside the
 * API, so this cannot live in `@hms/shared-types`.
 */
export type ChatToolCaller = {
  readonly user: CurrentUser;
  readonly roleCodes: readonly string[];
  readonly permissions: readonly ActorPermission[];
};

/**
 * One tool invocation as the model requested it. `toolName` and `arguments`
 * are untrusted model output: the registry re-checks the offering rules for
 * the name and validates the arguments against the tool's Zod schema before
 * anything executes.
 */
export type ChatToolDispatchRequest = {
  readonly caller: ChatToolCaller;
  readonly channel: ChatChannelValue;
  readonly toolName: string;
  readonly arguments: unknown;
};
