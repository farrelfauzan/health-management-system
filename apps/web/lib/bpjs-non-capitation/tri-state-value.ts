/**
 * A yes / no / not-known-yet answer as a select value (P25-T16): Q12 has not
 * been answered, and "unknown" must stay distinguishable from "no".
 */
export const TRI_STATE_VALUES = ['unknown', 'yes', 'no'] as const;

export type TriStateValue = (typeof TRI_STATE_VALUES)[number];
