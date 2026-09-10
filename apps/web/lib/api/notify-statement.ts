import { toast } from '@hms/ui';

import type { NoticeTone } from '#lib/shared/notice-tone';

type NotifyStatementInput = {
  tone: NoticeTone;
  title: string;
  description?: string;
};

/**
 * Raises a toast in the dashboard palette. Callers pick a tone and never
 * hand-style: the Toaster in `@hms/ui` styles each tone from the app tokens,
 * and renders error and warning titles bold in the destructive/warning colour.
 */
export function notifyStatement({ tone, title, description }: NotifyStatementInput): void {
  const options = description === undefined ? undefined : { description };
  toast[tone](title, options);
}
