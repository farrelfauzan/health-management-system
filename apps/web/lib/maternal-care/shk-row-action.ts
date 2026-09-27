/**
 * A step a worklist row offers (P25-T10), or closing an untaken sample as not
 * screened (P25-T18).
 */
export type ShkRowAction = 'sample' | 'sent' | 'result' | 'notScreened';
