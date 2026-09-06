import type { ManagedDocumentStatusValue } from '@hms/shared-types';

/**
 * The registry's filter state (`P16-T31`, FR-E5-02). One object rather than
 * six `useState`s so the filter bar, the saved-filter chips and the CSV
 * export all read the same shape — an export that disagreed with the list it
 * was taken from would be the worst kind of quiet bug.
 */
export type ManagedDocumentFilters = {
  search: string;
  typeId: string | null;
  status: ManagedDocumentStatusValue | null;
  draftedBy: string | null;
  approver: string | null;
  from: string | null;
  to: string | null;
  dateField: 'created' | 'issued';
};

export const EMPTY_MANAGED_DOCUMENT_FILTERS: ManagedDocumentFilters = {
  search: '',
  typeId: null,
  status: null,
  draftedBy: null,
  approver: null,
  from: null,
  to: null,
  dateField: 'created',
};

/** Whether anything is narrowing the list — drives the "no matches" copy. */
export function hasActiveManagedDocumentFilters(filters: ManagedDocumentFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.typeId !== null ||
    filters.status !== null ||
    filters.draftedBy !== null ||
    filters.approver !== null ||
    filters.from !== null ||
    filters.to !== null
  );
}

/**
 * The filter state as the API's query parameters. Empty values are omitted
 * rather than sent as `null`: the registry treats an absent `approver` as "no
 * filter" and a present one as "documents awaiting exactly this person", and
 * the two must never be confused.
 */
export function toManagedDocumentQueryParams(
  filters: ManagedDocumentFilters,
): Record<string, string> {
  const search = filters.search.trim();
  return {
    ...(search === '' ? {} : { q: search }),
    ...(filters.typeId === null ? {} : { typeId: filters.typeId }),
    ...(filters.status === null ? {} : { status: filters.status }),
    ...(filters.draftedBy === null ? {} : { draftedBy: filters.draftedBy }),
    ...(filters.approver === null ? {} : { approver: filters.approver }),
    ...(filters.from === null ? {} : { from: filters.from }),
    ...(filters.to === null ? {} : { to: filters.to }),
    dateField: filters.dateField,
  };
}
