import {
  NON_CAPITATION_CLAIM_STATUSES,
  NON_CAPITATION_MAX_COACHING_FEE_PERCENT,
  NON_CAPITATION_SERVICE_TYPES,
} from '#bpjs-non-capitation/schemas';
import type {
  NonCapitationRecapLine,
  NonCapitationRecapResponse,
  NonCapitationRecapSummaryItem,
} from '#bpjs-non-capitation/contracts';
import type { NonCapitationStatusCounts } from '#bpjs-non-capitation/types';

const PERCENT = 100;

type NonCapitationRecapTotals = Pick<
  NonCapitationRecapResponse,
  'summary' | 'totalAmount' | 'unpricedCount' | 'statusCounts' | 'maximumCoachingFeeAmount'
>;

function sumAmounts(lines: readonly NonCapitationRecapLine[]): number {
  return lines.reduce((total, line) => total + (line.tariffAmount ?? 0), 0);
}

function summarizeByServiceType(
  lines: readonly NonCapitationRecapLine[],
): NonCapitationRecapSummaryItem[] {
  return NON_CAPITATION_SERVICE_TYPES.map((serviceType) => {
    const ofType = lines.filter((line) => line.serviceType === serviceType);
    return { serviceType, count: ofType.length, totalAmount: sumAmounts(ofType) };
  }).filter((item) => item.count > 0);
}

function countStatuses(lines: readonly NonCapitationRecapLine[]): NonCapitationStatusCounts {
  const counts = Object.fromEntries(
    NON_CAPITATION_CLAIM_STATUSES.map((status) => [status, 0]),
  ) as NonCapitationStatusCounts;
  lines.forEach((line) => {
    counts[line.status] += 1;
  });
  return counts;
}

/**
 * The recap's totals (P25-T16): count and amount per service type, the
 * grand total of the priced lines, and the status counts. The coaching-fee
 * ceiling is shown only when the induk is known **not** to be
 * government-owned; a government induk pays the bidan in full (Permenkes
 * 28/2014 lampiran p. 39), and an unknown one gets no guessed deduction.
 */
export function summarizeNonCapitationRecap(params: {
  readonly lines: readonly NonCapitationRecapLine[];
  readonly isNetworkParentGovernmentOwned: boolean | null;
}): NonCapitationRecapTotals {
  const totalAmount = sumAmounts(params.lines);
  return {
    summary: summarizeByServiceType(params.lines),
    totalAmount,
    unpricedCount: params.lines.filter((line) => line.tariffAmount === null).length,
    statusCounts: countStatuses(params.lines),
    maximumCoachingFeeAmount:
      params.isNetworkParentGovernmentOwned === false
        ? Math.round((totalAmount * NON_CAPITATION_MAX_COACHING_FEE_PERCENT) / PERCENT)
        : null,
  };
}
