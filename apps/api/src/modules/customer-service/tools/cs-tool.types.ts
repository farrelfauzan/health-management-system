import { ChannelKindValue, CsToolNameValue } from '@hms/shared-types';

/**
 * Everything a customer-service tool is allowed to know about who is asking
 * (`PCS-T07`, strategy §4.2).
 *
 * **There is no user here, and there must not be one.** The in-app registry's
 * caller carries a `CurrentUser`, role codes, and resolved permissions,
 * because an in-app tool's whole job is to answer *as* the signed-in person.
 * On this channel nobody is signed in: principle 1 says a WhatsApp number or
 * a Telegram chat id identifies a conversation, not a verified patient. What a
 * tool gets instead is the conversation it is answering — which is what lets
 * `book_appointment` attach a booking to the chat that asked for it, and what
 * `AWAITING_OTP` is set on.
 *
 * Framework-internal on purpose: this is the shape the module passes between
 * its own services, not a contract any consumer outside the API needs.
 */
export type CsToolContext = {
  readonly conversationId: string;
  readonly channel: ChannelKindValue;
  readonly externalChatId: string;
};

/**
 * One tool invocation exactly as the model requested it. `toolName` and
 * `arguments` are untrusted model output: the registry checks the name against
 * its own catalogue and validates the arguments against the tool's Zod schema
 * before anything executes.
 */
export type CsToolDispatchRequest = {
  readonly context: CsToolContext;
  readonly toolName: string;
  readonly arguments: unknown;
};

/**
 * What a dispatch produced.
 *
 * `deterministicReply` is the escape hatch a public channel needs and the
 * in-app registry does not. Some outcomes must not be phrased by a model —
 * §5.1.1 requires the possession challenge to be issued and worded by this
 * codebase, never composed from a tool result — so a tool may hand back the
 * exact sentence to send, and the orchestration stops asking the model for a
 * reply when it does.
 */
export type CsToolDispatchOutcome = {
  readonly toolName: CsToolNameValue;
  readonly validatedArguments: unknown;
  readonly result: unknown;
  readonly deterministicReply?: string;
  /** Set when the tool's own effect moved the conversation out of `BOT_ACTIVE`. */
  readonly pausesConversation?: boolean;
  /** Set when the reply should carry a contact-share affordance (§5.1.1 tier 2). */
  readonly requestContact?: boolean;
};

/**
 * What a tool's `execute` returns before the registry projects it through the
 * output allowlist.
 */
export type CsToolExecution = {
  readonly result: unknown;
  readonly deterministicReply?: string;
  readonly pausesConversation?: boolean;
  readonly requestContact?: boolean;
};
