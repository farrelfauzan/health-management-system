import { isAxiosError } from 'axios';

const CHAT_UNAVAILABLE_STATUS = 503;

/**
 * Whether a failed send was a policy decision rather than a transport fault.
 * The API answers 503 when chat is switched off for the clinic or no provider
 * is active (ai-chatbot.md §4.2), which `AssistantUnavailableNotice` already
 * explains. Keeping the two apart matters: a retry button on a switched-off
 * feature invites the user to hammer an endpoint that will never answer.
 */
export function isChatUnavailableError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === CHAT_UNAVAILABLE_STATUS;
}
