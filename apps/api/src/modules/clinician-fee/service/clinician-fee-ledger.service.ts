import {
  buildClinicianFeeAccrual,
  buildClinicianFeeReversal,
  CreateClinicianFeeEntryPayload,
  getCalendarDateInTimeZone,
  RecordClinicianFeeAccrualsParams,
  RecordClinicianFeeReversalsParams,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaTransactionClient } from '../../../common/prisma/prisma.types';
import { ClinicianFeeEntryRepository } from '../repository/clinician-fee-entry.repository';
import { ClinicianFeeRuleRepository } from '../repository/clinician-fee-rule.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const PERIOD_LENGTH = 7;

/**
 * Writes the jasa medis ledger (P27-T06). Billing calls it inside the
 * transaction that settles or voids an invoice, so the ledger and the money
 * commit together; both writes are idempotent on `(invoice line, kind)`.
 *
 * The payment month and the day a rule must be in force on are read in the
 * clinic's timezone (`CLINIC_TIMEZONE`): a bill paid at 23:30 WIB on the 31st
 * belongs to that month, not to the next UTC one.
 */
@Injectable()
export class ClinicianFeeLedgerService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly clinicianFeeEntryRepository: ClinicianFeeEntryRepository,
    private readonly clinicianFeeRuleRepository: ClinicianFeeRuleRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  /**
   * One ACCRUAL per paid line that a rule in force prices for the invoice's
   * clinician. An invoice with no clinician (a walk-in lab visit) or no
   * matching rule writes nothing. Returns the number of rows inserted.
   */
  async recordAccrualsForPaidInvoice(
    tx: PrismaTransactionClient,
    params: RecordClinicianFeeAccrualsParams,
  ): Promise<number> {
    const invoice = await this.clinicianFeeEntryRepository.findInvoiceForFees(tx, params.invoiceId);
    if (!invoice || invoice.doctorId === null) {
      return 0;
    }
    const doctorId = invoice.doctorId;
    const onDate = getCalendarDateInTimeZone(params.paidAt, this.clinicTimeZone);
    const rules = await this.clinicianFeeRuleRepository.findRulesForClinician(tx, doctorId);
    const entries = invoice.lines
      .map((line) =>
        buildClinicianFeeAccrual({
          invoiceId: invoice.invoiceId,
          doctorId,
          line,
          rules,
          onDate,
          period: onDate.slice(0, PERIOD_LENGTH),
          occurredAt: params.paidAt,
        }),
      )
      .filter((entry): entry is CreateClinicianFeeEntryPayload => entry !== null);
    return this.clinicianFeeEntryRepository.createEntries(tx, entries);
  }

  /**
   * One REVERSAL per accrual of the invoice, dated in the void month. An
   * invoice that was never paid has no accruals, so voiding it writes nothing.
   */
  async recordReversalsForVoidedInvoice(
    tx: PrismaTransactionClient,
    params: RecordClinicianFeeReversalsParams,
  ): Promise<number> {
    const accruals = await this.clinicianFeeEntryRepository.findAccrualsForInvoice(
      tx,
      params.invoiceId,
    );
    const period = getCalendarDateInTimeZone(params.voidedAt, this.clinicTimeZone).slice(
      0,
      PERIOD_LENGTH,
    );
    const entries = accruals.map((accrual) =>
      buildClinicianFeeReversal({
        invoiceId: params.invoiceId,
        accrual,
        period,
        occurredAt: params.voidedAt,
      }),
    );
    return this.clinicianFeeEntryRepository.createEntries(tx, entries);
  }
}
