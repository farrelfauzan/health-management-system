/**
 * The SHK worklist's tabs (P25-T10), in strip order. The first four are the
 * API's `status` filters; `ALL` sends none and lists every unresulted sample.
 */
export const SHK_WORKLIST_TABS = ['DUE', 'OVERDUE', 'AWAITING_RESULT', 'RECALL', 'ALL'] as const;

export type ShkWorklistTab = (typeof SHK_WORKLIST_TABS)[number];
