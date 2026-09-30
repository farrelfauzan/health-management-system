/** The four outcomes of a lab order, in the order the status card shows them. */
export const LAB_ORDER_OUTCOMES = ['released', 'inProgress', 'sentOut', 'cancelled'] as const;

export type LabOrderOutcome = (typeof LAB_ORDER_OUTCOMES)[number];
