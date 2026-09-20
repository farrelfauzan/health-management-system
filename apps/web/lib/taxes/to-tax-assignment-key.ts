import type { TaxAssignmentRowView } from '@hms/shared-types';

/** A selection key unique across both tables: a tariff and a medication may share an id space. */
export function toTaxAssignmentKey(row: Pick<TaxAssignmentRowView, 'kind' | 'id'>): string {
  return `${row.kind}:${row.id}`;
}
