import { Module } from '@nestjs/common';

import { ClinicianFeeRuleController } from './controller/clinician-fee-rule.controller';
import { ClinicianFeeStatementController } from './controller/clinician-fee-statement.controller';
import { ClinicianFeeEntryRepository } from './repository/clinician-fee-entry.repository';
import { ClinicianFeeRuleRepository } from './repository/clinician-fee-rule.repository';
import { ClinicianFeeLedgerService } from './service/clinician-fee-ledger.service';
import { ClinicianFeeRuleMapper } from './service/clinician-fee-rule.mapper';
import { ClinicianFeeRuleService } from './service/clinician-fee-rule.service';
import { ClinicianFeeStatementService } from './service/clinician-fee-statement.service';

/**
 * Jasa medis (P27-T06): fee rules, the ledger written from paid invoices and
 * the monthly statement per clinician. It imports nothing from billing:
 * billing imports this module and hands the ledger its transaction, so the
 * dependency runs one way and a payment commits with its entries.
 */
@Module({
  controllers: [ClinicianFeeRuleController, ClinicianFeeStatementController],
  providers: [
    ClinicianFeeRuleRepository,
    ClinicianFeeEntryRepository,
    ClinicianFeeRuleMapper,
    ClinicianFeeRuleService,
    ClinicianFeeLedgerService,
    ClinicianFeeStatementService,
  ],
  // The statement service is what the PPh 21 draft reads a month's gross fees
  // from (P27-T07): the taxes module never touches this module's tables.
  exports: [ClinicianFeeLedgerService, ClinicianFeeStatementService],
})
export class ClinicianFeeModule {}
