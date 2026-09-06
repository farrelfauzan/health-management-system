import { describe, expect, it } from 'vitest';

import {
  EMPTY_MANAGED_DOCUMENT_FILTERS,
  hasActiveManagedDocumentFilters,
  toManagedDocumentQueryParams,
} from './managed-document-filters';

describe('toManagedDocumentQueryParams', () => {
  it('sends only the date field when nothing is filtered', () => {
    const actual = toManagedDocumentQueryParams(EMPTY_MANAGED_DOCUMENT_FILTERS);

    expect(actual).toEqual({ dateField: 'created' });
  });

  it('omits an unset approver rather than sending an empty one', () => {
    // The registry reads an absent `approver` as "no filter" and a present
    // one as "awaiting exactly this person". Sending an empty string would
    // ask for documents awaiting nobody, which is every document or none
    // depending on how the API reads it — neither is what the chip meant.
    const actual = toManagedDocumentQueryParams({
      ...EMPTY_MANAGED_DOCUMENT_FILTERS,
      approver: null,
    });

    expect(actual).not.toHaveProperty('approver');
  });

  it('carries every set filter through', () => {
    const actual = toManagedDocumentQueryParams({
      search: '  perjanjian  ',
      typeId: 'type-1',
      status: 'PENDING_APPROVAL',
      draftedBy: 'user-1',
      approver: 'user-2',
      from: '2026-09-01',
      to: '2026-09-30',
      dateField: 'issued',
    });

    expect(actual).toEqual({
      q: 'perjanjian',
      typeId: 'type-1',
      status: 'PENDING_APPROVAL',
      draftedBy: 'user-1',
      approver: 'user-2',
      from: '2026-09-01',
      to: '2026-09-30',
      dateField: 'issued',
    });
  });

  it('drops a search that is only whitespace', () => {
    const actual = toManagedDocumentQueryParams({
      ...EMPTY_MANAGED_DOCUMENT_FILTERS,
      search: '   ',
    });

    expect(actual).not.toHaveProperty('q');
  });
});

describe('hasActiveManagedDocumentFilters', () => {
  it('does not count the date field as a filter', () => {
    // Every request carries `dateField`; treating it as active would make the
    // empty registry say "no documents match your filters" on a first load.
    const actual = hasActiveManagedDocumentFilters({
      ...EMPTY_MANAGED_DOCUMENT_FILTERS,
      dateField: 'issued',
    });

    expect(actual).toBe(false);
  });

  it('counts an approver chip as active', () => {
    const actual = hasActiveManagedDocumentFilters({
      ...EMPTY_MANAGED_DOCUMENT_FILTERS,
      approver: 'user-2',
    });

    expect(actual).toBe(true);
  });
});
