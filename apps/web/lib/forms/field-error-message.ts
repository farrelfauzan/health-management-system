export function getFieldErrorMessage(errors: ReadonlyArray<unknown>): string | null {
  const firstError = errors[0];

  if (
    firstError &&
    typeof firstError === 'object' &&
    'message' in firstError &&
    typeof firstError.message === 'string'
  ) {
    return firstError.message;
  }

  return typeof firstError === 'string' ? firstError : null;
}
