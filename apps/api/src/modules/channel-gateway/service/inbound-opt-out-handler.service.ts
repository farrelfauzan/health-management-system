import { InboundChannelMessage } from '@hms/shared-types';

/**
 * A hook that may claim an inbound message before the conversation sees it
 * (`P16-T24`, FR-E4-16).
 *
 * The gateway still contains zero business logic (§4.1): it does not know
 * what an opt-out keyword is, only that something registered to look. The
 * port exists because the one thing the sink cannot do is the thing this
 * needs — a patient's `BERHENTI` must be honoured whether the conversation is
 * with the bot, paused for a human, blocked for flooding, or archived, and the
 * conversation state machine's whole design is that most of those states
 * answer nothing. Running *before* the sink is what makes the opt-out
 * unconditional.
 *
 * A message the handler claims never reaches the sink, so it is not written
 * to the transcript; the audit row the handler writes is its record. The
 * handler must decide cheaply and must not throw for a message it does not
 * recognise — the normalizer treats `false` as "not mine" and carries on.
 *
 * An abstract class rather than an interface so Nest can use it as an
 * injection token, matching {@link InboundMessageSink}.
 */
export abstract class InboundOptOutHandler {
  /** Resolves `true` when the message was an opt-out and has been handled. */
  abstract handleOptOut(message: InboundChannelMessage): Promise<boolean>;
}
