import type { LabOrderView, LabResultView } from '@hms/shared-types';
import { resolveLabRequesterLabel } from './resolve-lab-requester-label';

export type LabOrderHistoryEventKind =
  | 'ORDERED'
  | 'COLLECTED'
  | 'RECEIVED'
  | 'REJECTED'
  | 'ENTERED'
  | 'RELEASED'
  | 'AMENDED'
  | 'CANCELLED';

export type LabOrderHistoryEvent = {
  key: string;
  kind: LabOrderHistoryEventKind;
  at: string;
  /** Message values: who requested, which tube, which test, which version. */
  values: Record<string, string | number>;
};

type BuildLabOrderHistoryParams = {
  order: LabOrderView;
  results: readonly LabResultView[];
};

/**
 * The order's timeline, read off the timestamps the record already carries
 * (P18-T08). Not the audit log: a technician cannot read it, and the facts a
 * bench asks about — when was it drawn, who typed it, when was it signed out —
 * are all on the rows this screen has already loaded. Newest first.
 */
export function buildLabOrderHistory(params: BuildLabOrderHistoryParams): LabOrderHistoryEvent[] {
  const { order, results } = params;
  const testNames = new Map(order.items.map((item) => [item.id, item.name]));
  const events: LabOrderHistoryEvent[] = [
    { key: 'ordered', kind: 'ORDERED', at: order.orderedAt, values: { actor: resolveLabRequesterLabel(order) } },
  ];
  for (const specimen of order.specimens) {
    events.push({
      key: `collected-${specimen.id}`,
      kind: 'COLLECTED',
      at: specimen.collectedAt,
      values: { accessionNumber: specimen.accessionNumber },
    });
    if (specimen.receivedAt) {
      events.push({
        key: `received-${specimen.id}`,
        kind: 'RECEIVED',
        at: specimen.receivedAt,
        values: { accessionNumber: specimen.accessionNumber },
      });
    }
    if (specimen.rejectedAt) {
      events.push({
        key: `rejected-${specimen.id}`,
        kind: 'REJECTED',
        at: specimen.rejectedAt,
        values: { accessionNumber: specimen.accessionNumber },
      });
    }
  }
  for (const result of results) {
    const test = testNames.get(result.labOrderItemId) ?? '';
    events.push(
      result.amendedFromId
        ? {
            key: `amended-${result.id}`,
            kind: 'AMENDED',
            at: result.enteredAt,
            values: { test, version: result.version },
          }
        : { key: `entered-${result.id}`, kind: 'ENTERED', at: result.enteredAt, values: { test } },
    );
  }
  if (order.releasedAt) {
    events.push({ key: 'released', kind: 'RELEASED', at: order.releasedAt, values: {} });
  }
  if (order.cancelledAt) {
    events.push({ key: 'cancelled', kind: 'CANCELLED', at: order.cancelledAt, values: {} });
  }
  return events.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}
