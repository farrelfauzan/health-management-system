import type { LabReferenceRangeView, LabResultView } from '@hms/shared-types';

/**
 * The band a value was judged against, in the shape `formatReferenceRange`
 * already renders (P18-T07).
 *
 * The result carries its own snapshot rather than pointing at the catalog, so
 * this reads the row and never the current test — which is the whole point of
 * snapshotting: the range shown beside a number has to be the one that number
 * was judged by.
 */
export function toResultReferenceRange(result: LabResultView): LabReferenceRangeView {
  return {
    id: result.id,
    ...(result.refLow === undefined ? {} : { low: result.refLow }),
    ...(result.refHigh === undefined ? {} : { high: result.refHigh }),
    ...(result.refCriticalLow === undefined ? {} : { criticalLow: result.refCriticalLow }),
    ...(result.refCriticalHigh === undefined ? {} : { criticalHigh: result.refCriticalHigh }),
    ...(result.refText === undefined ? {} : { textNormal: result.refText }),
  };
}
