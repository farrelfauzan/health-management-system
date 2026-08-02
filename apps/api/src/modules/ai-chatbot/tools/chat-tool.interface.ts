import { ChatChannelValue, ChatToolArgumentSchema, ChatToolNameValue } from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { ActorPermissionScope } from '../../../common/authorization/actor.types';

/**
 * One read-only lookup the assistant may call (ai-chatbot-tools.md §4.1).
 * The rule that makes the whole track safe: every implementation calls the
 * existing domain service passing the asking user's own {@link CurrentUser} —
 * never a repository, never a service account, never a hand-built query — so
 * the tool inherits the service's scoping and cannot drift from it.
 *
 * The declaration is the tool's authorization contract, enforced by the
 * registry per §4.1.1: `channels` and `allowedRoleCodes` must both admit the
 * caller, and `requiredPermission` names not just an action but the scope it
 * must resolve to — a broader grant disqualifies rather than qualifies, so
 * `list_my_patients` is never offered to an actor whose `patient.read`
 * resolves to `ANY`, because "the patients assigned to you" has no meaning
 * for them.
 *
 * `argumentSchema` is the same Zod object serialized into the provider's
 * `tools` array, so what the model is told and what dispatch validates are
 * one definition. `execute` receives arguments already validated against it.
 */
export interface ChatTool {
  readonly name: ChatToolNameValue;
  readonly description: string;
  readonly channels: readonly ChatChannelValue[];
  readonly allowedRoleCodes: readonly string[];
  readonly requiredPermission: {
    readonly resource: string;
    readonly action: string;
    readonly scope: ActorPermissionScope;
  };
  readonly argumentSchema: ChatToolArgumentSchema;
  execute(user: CurrentUser, validatedArguments: unknown): Promise<unknown>;
}
