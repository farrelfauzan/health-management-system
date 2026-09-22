import type { ClinicianTaxIdentity, ResolveClinicianTaxIdentityParams } from '#taxes/types';

const NIK_MASK_PREFIX = '••••••••';

/**
 * Which tax identity a clinician's BP21 carries (P27-T07): the NPWP when one
 * is on file, else the NIK, which Coretax accepts as NPWP for an individual.
 * Neither means the line is flagged and the draft cannot be finalized. The
 * NIK is shown masked; the full value is a separate, audited read.
 */
export function resolveClinicianTaxIdentity(
  params: ResolveClinicianTaxIdentityParams,
): ClinicianTaxIdentity {
  if (params.npwp !== null && params.npwp !== '') {
    return { status: 'NPWP', masked: params.npwp };
  }
  if (params.nikLast4 !== null && params.nikLast4 !== '') {
    return { status: 'NIK', masked: `${NIK_MASK_PREFIX}${params.nikLast4}` };
  }
  return { status: 'MISSING', masked: null };
}
