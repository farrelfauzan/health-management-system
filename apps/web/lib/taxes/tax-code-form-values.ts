import type { FakturTransactionCodeValue, PpnTreatmentValue } from '@hms/shared-types';

import type { TaxRateFormValues } from '#lib/taxes/tax-rate-form-values';

/** The tax code form's state (P27-T03). `fakturTransactionCode: ''` means none. */
export type TaxCodeFormValues = {
  code: string;
  name: string;
  ppnTreatment: PpnTreatmentValue;
  fakturTransactionCode: FakturTransactionCodeValue | '';
  invoiceNote: string;
  isActive: boolean;
  initialRate: TaxRateFormValues;
};
