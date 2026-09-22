import type { MaternalDueRecord } from '#maternal-visit-due/types';

/** What the worker did for one due visit, or null when it has not sent anything. */
export type MaternalVisitReminderView = {
  status: 'SENT' | 'FAILED';
  attemptedAt: string;
};

/**
 * One row of the "Jatuh tempo minggu ini" worklist (P25-T17): the due visit
 * plus whether the patient may be reminded, and whether she was.
 */
export type MaternalVisitDueItem = MaternalDueRecord & {
  hasReminderConsent: boolean;
  reminder: MaternalVisitReminderView | null;
};

/** `GET /maternal-visits/due`. */
export type MaternalVisitsDueResponse = {
  from: string;
  to: string;
  items: MaternalVisitDueItem[];
};
