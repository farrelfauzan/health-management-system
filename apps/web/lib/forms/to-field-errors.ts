/**
 * Wraps one message — an API refusal named for a field — in the shape
 * `FieldError` already renders, so a server-side rule and a client-side one
 * look the same to the reader.
 */
export function toFieldErrors(message: string | undefined): ReadonlyArray<{ message: string }> {
  return message === undefined || message.trim() === '' ? [] : [{ message }];
}
