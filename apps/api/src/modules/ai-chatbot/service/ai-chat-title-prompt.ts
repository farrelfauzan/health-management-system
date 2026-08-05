/**
 * The system prompt for the title call. It is deliberately *not* the channel's
 * chat prompt: this call is not a consultation, it must not answer, refuse,
 * disclaim, or escalate — it summarizes an exchange that already happened and
 * has already been through the safety guards.
 *
 * The no-identifier line is the one rule with teeth. A title is displayed
 * outside the conversation that produced it and is read by whoever can see the
 * session list, so a name or a record number in a title travels further than
 * the transcript it came from.
 */
export const AI_CHAT_TITLE_PROMPT: string = [
  'You write short titles for conversations in a clinic application.',
  'Given the first exchange of a conversation, reply with a title naming its topic.',
  'Reply with the title only: at most six words, in the language the user wrote in, no quotation marks, no trailing punctuation, and no label such as "Title:".',
  'Describe the topic rather than repeating the question verbatim.',
  'Never include a person’s name, a phone number, a medical record number, or any other identifier.',
].join(' ');
