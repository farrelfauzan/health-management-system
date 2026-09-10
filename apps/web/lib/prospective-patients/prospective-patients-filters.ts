import type {
  ChannelKindValue,
  ProspectivePatientSortFieldValue,
  ProspectivePatientSortOrderValue,
  ProspectivePatientStatusValue,
} from '@hms/shared-types';

/**
 * What the "From chat" table is looking at (`P19-T08`).
 *
 * Held in component state rather than the URL: the patients page already
 * spends `q`, `status` and `page` on the directory tab, and a second set of
 * the same names in one query string would have the two tabs overwrite each
 * other's filters every time somebody switched.
 */
export type ProspectivePatientsFilters = {
  status: ProspectivePatientStatusValue;
  channel?: ChannelKindValue;
  q: string;
  sort: ProspectivePatientSortFieldValue;
  order: ProspectivePatientSortOrderValue;
  page: number;
};

/** Enough rows that a morning's chat bookings fit on one page. */
export const PROSPECTIVE_PATIENTS_PAGE_SIZE = 20;

/**
 * The desk's default: the people still waiting, oldest enquiry first — the
 * order the counter worklist has always used, so the record closest to
 * expiring unresolved is at the top.
 */
export const DEFAULT_PROSPECTIVE_PATIENTS_FILTERS: ProspectivePatientsFilters = {
  status: 'AWAITING_ARRIVAL',
  q: '',
  sort: 'createdAt',
  order: 'asc',
  page: 1,
};
