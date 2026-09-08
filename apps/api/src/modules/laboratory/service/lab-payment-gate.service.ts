import { LabOrderRecord, LabWorklistOrderRecord } from '@hms/shared-types';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingService } from '../../billing/service/billing.service';
import { LabOrderRepository } from '../repository/lab-order.repository';

const REQUIRE_PAYMENT_SETTING = 'LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION';

/**
 * Pay-before-collect (P18-T06), off by default.
 *
 * A klinik that asks umum patients to settle at the counter before the draw
 * turns `LAB_REQUIRE_PAYMENT_BEFORE_COLLECTION` on; every other clinic never
 * sees this rule at all. BPJS and insurance payers are exempt whatever the
 * setting says, because their bill is not settled at the counter and refusing
 * their draw would refuse the patient the scheme exists to cover — presence of
 * a BPJS number is what marks them, since that is the only payer fact the
 * patient record carries.
 *
 * It lives here rather than in billing because it is a rule *about collecting*:
 * billing answers "is this visit settled", and the lab decides what to do about
 * the answer.
 */
@Injectable()
export class LabPaymentGateService {
  private readonly isPaymentRequired: boolean;

  constructor(
    private readonly billingService: BillingService,
    private readonly labOrderRepository: LabOrderRepository,
    configService: ConfigService,
  ) {
    this.isPaymentRequired = configService.get<string>(REQUIRE_PAYMENT_SETTING) === 'true';
  }

  async assertCollectionIsPaidFor(order: LabOrderRecord): Promise<void> {
    if (!this.isPaymentRequired) {
      return;
    }
    const worklistOrder = await this.labOrderRepository.findWorklistOrderById(order.id);
    if (!worklistOrder || !this.isAwaitingPayment(worklistOrder)) {
      return;
    }
    if (await this.billingService.hasSettledInvoiceForVisit(order.registrationId)) {
      return;
    }
    throw new ConflictException({
      error: {
        code: 'LAB_PAYMENT_REQUIRED',
        message: `Lab order ${order.orderNumber} must be paid before the specimen is collected`,
      },
    });
  }

  /**
   * Which of these orders carry the "belum bayar" badge. One query for the
   * whole worklist rather than one per row: the bench opens this screen every
   * few minutes, and a per-row settlement check would be the page's slowest
   * part for a rule most clinics have switched off.
   */
  async findOrderIdsAwaitingPayment(
    records: readonly LabWorklistOrderRecord[],
  ): Promise<ReadonlySet<string>> {
    if (!this.isPaymentRequired) {
      return new Set();
    }
    const candidates = records.filter((record) => this.isAwaitingPayment(record));
    if (candidates.length === 0) {
      return new Set();
    }
    const settledVisitIds = await this.billingService.findVisitIdsWithSettledInvoice(
      candidates.map((record) => record.registrationId),
    );

    return new Set(
      candidates
        .filter((record) => !settledVisitIds.has(record.registrationId))
        .map((record) => record.id),
    );
  }

  /** A patient with no BPJS number is *umum*, and is the only payer this rule touches. */
  private isAwaitingPayment(record: LabWorklistOrderRecord): boolean {
    return record.patient.bpjsNumberIndex === null;
  }
}
