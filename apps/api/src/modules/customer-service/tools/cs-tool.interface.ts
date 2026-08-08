import { ChatToolArgumentSchema, ChatToolResultSchema, CsToolNameValue } from '@hms/shared-types';

import { CsToolContext, CsToolExecution } from './cs-tool.types';

/**
 * One tool the public channel's assistant may call (strategy §4.2).
 *
 * Three things make the declaration the tool's contract rather than its
 * documentation:
 *
 * - `argumentSchema` is the same Zod object that is serialized into the
 *   provider's `tools` array and that dispatch validates against, so what the
 *   model is told and what actually executes are one definition. A field that
 *   is absent here — `nik`, `dateOfBirth` — is absent everywhere (D-CS-03).
 * - `resultSchema` is the §4.2 **output allowlist**. The tool builds its
 *   result field by field and the registry parses it through this schema
 *   before anything is transmitted; a field nobody listed cannot appear even
 *   if the backing service returned it.
 * - `execute` receives arguments already validated and a
 *   {@link CsToolContext} carrying the conversation rather than a user,
 *   because there is no user — this channel is unauthenticated by design.
 */
export interface CsTool {
  readonly name: CsToolNameValue;
  readonly description: string;
  readonly argumentSchema: ChatToolArgumentSchema;
  readonly resultSchema: ChatToolResultSchema<unknown>;
  execute(context: CsToolContext, validatedArguments: unknown): Promise<CsToolExecution>;
}
