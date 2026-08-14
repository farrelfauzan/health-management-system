import { AI_CHAT_SAFETY_PATTERNS } from './ai-chat-safety-patterns';

/**
 * How many injection patterns a piece of retrieved text matches (SJ-15 §6).
 *
 * This is **advisory and never blocks**. The same denylist run over a user's
 * own message is a control — they are trying it on themselves, and refusing
 * costs them nothing they are entitled to. Run over a clinic document it is
 * only a signal: a real SOP can legitimately contain the sentence "staff must
 * ignore any previous instruction to release records", and dropping that
 * passage would answer a doctor's question wrongly to defeat an attack that
 * was not happening. Structure is what contains the passage
 * (`ChatRetrievalService` serializes it) and the trust hierarchy is what tells
 * the model to disregard it; this only says how often somebody is trying.
 *
 * A count rather than the matched text, because the log must not become a
 * second copy of the document — the passage is already persisted as the
 * exchange's SYSTEM turn, which is where an investigator should read it.
 */
export function countInjectionPatternHits(text: string): number {
  return AI_CHAT_SAFETY_PATTERNS.promptInjection.filter((pattern) => pattern.test(text)).length;
}
