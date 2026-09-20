import { PP55_BADAN_TRANSITION_LAST_START_YEAR, type TaxpayerTypeValue } from '#taxes/schemas';
import type {
  Pp55Eligibility,
  ResolveBadanPp55EligibilityParams,
  ResolvePp55EligibilityParams,
} from '#taxes/types';

/**
 * Tax years a badan may stay on the scheme, counting the start year (PP 55/2022
 * Pasal 59, kept for the transition by PP 20/2026 Pasal II). Koperasi keep their
 * limit going forward; a PT or CV only finishes a period already begun.
 */
const BADAN_TAX_YEARS: Readonly<Partial<Record<TaxpayerTypeValue, number>>> = {
  KOPERASI: 4,
  CV: 4,
  PT: 3,
};

/** Individuals and PT perorangan lost their time limit in PP 20/2026. */
const UNLIMITED_TYPES: readonly TaxpayerTypeValue[] = ['INDIVIDUAL', 'PT_PERORANGAN'];

/** Only a PT or CV is limited to the transition; a koperasi may still start. */
const TRANSITION_ONLY_TYPES: readonly TaxpayerTypeValue[] = ['PT', 'CV'];

/**
 * Whether the 0.5% final tax (PP 55/2022 as amended by PP 20/2026) is open to
 * this clinic this year, and until when. Pure, so the settings form can show the
 * last eligible year before anything is saved; the service refuses the same
 * answers on write. See `docs/product/prd-clinic-taxes.md` §2.3 and D-038.
 */
export function resolvePp55Eligibility(params: ResolvePp55EligibilityParams): Pp55Eligibility {
  const { taxpayerType, startYear, currentYear } = params;
  if (taxpayerType === null) {
    return { isEligible: false, lastEligibleYear: null, reason: 'Set the taxpayer type first' };
  }
  if (startYear !== null && startYear > currentYear) {
    return {
      isEligible: false,
      lastEligibleYear: null,
      reason: 'The PP 55 start year cannot be in the future',
    };
  }
  if (UNLIMITED_TYPES.includes(taxpayerType)) {
    return { isEligible: true, lastEligibleYear: null };
  }
  const taxYears = BADAN_TAX_YEARS[taxpayerType];
  if (taxYears === undefined) {
    return {
      isEligible: false,
      lastEligibleYear: null,
      reason: 'A yayasan is not a PP 55 taxpayer',
    };
  }
  return resolveBadanEligibility({ taxpayerType, startYear, currentYear, taxYears });
}

function resolveBadanEligibility(params: ResolveBadanPp55EligibilityParams): Pp55Eligibility {
  const { taxpayerType, startYear, currentYear, taxYears } = params;
  if (startYear === null) {
    return {
      isEligible: false,
      lastEligibleYear: null,
      reason: 'A badan on PP 55 must record the year it started using the 0.5% rate',
    };
  }
  if (
    TRANSITION_ONLY_TYPES.includes(taxpayerType) &&
    startYear > PP55_BADAN_TRANSITION_LAST_START_YEAR
  ) {
    return {
      isEligible: false,
      lastEligibleYear: null,
      reason: 'Since PP 20/2026 a PT or CV can no longer start using the 0.5% rate',
    };
  }
  const lastEligibleYear = startYear + taxYears - 1;
  if (lastEligibleYear < currentYear) {
    return {
      isEligible: false,
      lastEligibleYear,
      reason: `The PP 55 period for this entity ended in ${lastEligibleYear}`,
    };
  }
  return { isEligible: true, lastEligibleYear };
}
