'use client';

import { ClinicianFeeRulesCard } from '#components/client/billing/clinician-fee-rules-card';
import { ClinicianFeeStatementsCard } from '#components/client/billing/clinician-fee-statements-card';

type ClinicianFeesPanelProps = {
  /** The clinic-local current month, `YYYY-MM`, from the server. */
  currentPeriod: string;
};

/**
 * Jasa medis (P27-T06): the fee rules, and the monthly statement per
 * clinician built from the ledger that paid invoices write.
 */
export function ClinicianFeesPanel({ currentPeriod }: ClinicianFeesPanelProps) {
  return (
    <div className="space-y-6">
      <ClinicianFeeStatementsCard currentPeriod={currentPeriod} />
      <ClinicianFeeRulesCard />
    </div>
  );
}
