import { isAxiosError } from 'axios';

/**
 * Whether a failed profile read means "nobody has set the clinic up yet"
 * rather than "something broke".
 *
 * The API answers 404 until the singleton exists, and that is deliberate —
 * "the clinic has not been configured" and "the clinic is called nothing" are
 * different facts. On this screen the first one is not an error at all: it is
 * the empty form an administrator is here to fill in.
 */
export function isProfileNotConfiguredError(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}
