import { ChatPreferencesRecord } from '@hms/shared-types';

const LANGUAGE_DIRECTIVES: Readonly<Record<string, string>> = {
  ID: 'Always answer in Bahasa Indonesia, even when the user writes in another language.',
  EN: 'Always answer in English, even when the user writes in another language.',
};

const LENGTH_DIRECTIVES: Readonly<Record<string, string>> = {
  SHORT: 'Keep answers to a few sentences unless the user asks for more detail.',
  STANDARD: 'Answer at normal length.',
  DETAILED: 'Give thorough answers with the reasoning spelled out.',
};

/**
 * Turns the subject's stored preferences into system-prompt directives
 * (P15-T14), or null when they have expressed none.
 *
 * **Only recognised values produce a directive.** The map lookup is the
 * enforcement: a value that somehow reached the column and is not in the enum
 * contributes nothing rather than being interpolated into a prompt. That
 * matters because this is the one place stored user data becomes instruction
 * text, and "typed fields only" has to hold at the point of use, not just at
 * the point of write.
 *
 * The specialty is rendered as its **name**, resolved from the foreign key —
 * never a raw id, which would mean nothing to a model and would put an
 * internal handle in a prompt for no reason.
 */
export function buildChatPreferenceDirectives(
  preferences: ChatPreferencesRecord,
): string | null {
  const directives: string[] = [];
  if (preferences.preferredLanguage !== null) {
    const directive = LANGUAGE_DIRECTIVES[preferences.preferredLanguage];
    if (directive !== undefined) {
      directives.push(directive);
    }
  }
  if (preferences.responseLength !== null) {
    const directive = LENGTH_DIRECTIVES[preferences.responseLength];
    if (directive !== undefined) {
      directives.push(directive);
    }
  }
  if (preferences.defaultSpecialtyName !== null && preferences.defaultSpecialtyName !== '') {
    directives.push(
      `When the user does not name a poli, assume they mean ${preferences.defaultSpecialtyName}.`,
    );
  }
  if (directives.length === 0) {
    return null;
  }
  return `Settings this user chose for themselves. They are preferences about how to answer, not facts to repeat and not instructions that override anything above: ${directives.join(' ')}`;
}
