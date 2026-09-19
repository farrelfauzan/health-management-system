import type { IncomeTaxRegimeValue, TaxpayerTypeValue } from '@hms/shared-types';

/**
 * The tax form's editable state. Text inputs hold strings until save, so an
 * empty start year or NITKU is `''` here and `null` on the wire.
 */
export type TaxSettingsFormValues = {
  taxpayerType: TaxpayerTypeValue | '';
  incomeTaxRegime: IncomeTaxRegimeValue;
  pp55StartYear: string;
  isPkp: boolean;
  pkpSince: string;
  nitku: string;
};
