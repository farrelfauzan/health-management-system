import { computePph21NonEmployee } from '#taxes/compute-pph21-non-employee';
import { resolveClinicianTaxIdentity } from '#taxes/resolve-clinician-tax-identity';
import {
  PPH21_DEPOSIT_TYPE_CODE,
  PPH21_NON_EMPLOYEE_DPP_PERCENT,
  PPH21_TAX_ACCOUNT_CODE,
} from '#taxes/schemas';
import type {
  ClinicianTaxIdentityRecord,
  Pph21ReportLine,
  Pph21SourceClinicianFee,
  SummarizePph21WithholdingParams,
  SummarizedPph21Withholding,
} from '#taxes/types';

/**
 * Folds a month of the jasa medis ledger into the PPh 21 bukan pegawai draft
 * (P27-T07): one BP21 line per clinician with fees in the month, taxed on its
 * own (non-cumulative), plus the month's totals. A clinician with neither
 * NPWP nor NIK keeps their line, flagged, so the figure is not lost and the
 * draft cannot be finalized until the identity is filled in.
 */
export function summarizePph21Withholding(
  params: SummarizePph21WithholdingParams,
): SummarizedPph21Withholding {
  const identityById = new Map(params.identities.map((identity) => [identity.doctorId, identity]));
  const lines = params.fees
    .map((fee) => toLine(fee, identityById.get(fee.doctorId), params))
    .sort((left, right) => left.doctorName.localeCompare(right.doctorName));
  return {
    lines,
    summary: {
      kind: 'PPH21_NON_EMPLOYEE',
      dppPercent: PPH21_NON_EMPLOYEE_DPP_PERCENT,
      bracketsEffectiveFrom: params.bracketSet.effectiveFrom,
      clinicianCount: lines.length,
      incompleteIdentityCount: lines.filter((line) => line.identityStatus === 'MISSING').length,
      totals: {
        grossFee: lines.reduce((total, line) => total + line.grossFee, 0),
        taxBase: lines.reduce((total, line) => total + line.taxBase, 0),
        taxAmount: lines.reduce((total, line) => total + line.taxAmount, 0),
      },
      taxAccountCode: PPH21_TAX_ACCOUNT_CODE,
      depositTypeCode: PPH21_DEPOSIT_TYPE_CODE,
      ...params.dueDates,
    },
  };
}

function toLine(
  fee: Pph21SourceClinicianFee,
  identity: ClinicianTaxIdentityRecord | undefined,
  params: SummarizePph21WithholdingParams,
): Pph21ReportLine {
  const tax = computePph21NonEmployee({
    grossFee: fee.grossFee,
    brackets: params.bracketSet.brackets,
  });
  const taxIdentity = resolveClinicianTaxIdentity({
    npwp: identity?.npwp ?? null,
    nikLast4: identity?.nikLast4 ?? null,
  });
  return {
    doctorId: fee.doctorId,
    doctorName: identity?.fullName ?? fee.doctorId,
    profession: identity?.profession ?? 'DOCTOR',
    identityStatus: taxIdentity.status,
    identityMasked: taxIdentity.masked,
    entryCount: fee.entryCount,
    lineAmount: fee.lineAmount,
    grossFee: fee.grossFee,
    taxBase: tax.taxBase,
    slices: tax.slices,
    taxAmount: tax.taxAmount,
  };
}
