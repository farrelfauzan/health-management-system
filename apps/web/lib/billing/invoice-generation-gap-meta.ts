import type { InvoiceGenerationGapReason } from '@hms/shared-types';

/**
 * The generator reports what it found but could not price instead of dropping
 * it, so the cashier is told before the invoice is issued. Each message names
 * the fix, because every gap is money the clinic would otherwise not bill.
 */
export const INVOICE_GENERATION_GAP_MESSAGES: Record<InvoiceGenerationGapReason, string> = {
  NO_CONSULTATION_TARIFF:
    'No active consultation tariff — add one under Tariffs, then regenerate to bill the consultation.',
  NO_TARIFF_FOR_PROCEDURE:
    'This procedure has no matching tariff. Add a tariff with its ICD-9-CM code and regenerate, or add the tariff line by hand from the draft invoice.',
  UNPRICED_MEDICATION:
    'This dispensed medication has no price on its record, so it was left off the invoice.',
  NO_ACCOMMODATION_TARIFF:
    'This ward class has no active accommodation tariff, so its nights were left off the bill. Add one under Tariffs and reissue.',
  NO_TARIFF_FOR_IMMUNIZATION:
    'This vaccination has no matching tariff. Add a tariff whose code matches the vaccine’s catalog code and regenerate, or add the line by hand from the draft invoice.',
};
