import {
  AccommodationNightTally,
  AdmissionRecord,
  AdmissionRoomChargeResult,
  CreateInvoiceItemPayload,
  getCalendarDateInTimeZone,
  InvoiceGenerationGap,
  ServiceTariffRecord,
  tallyAccommodationNights,
} from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillingRepository } from '../repository/billing.repository';
import { ServiceTariffRepository } from '../repository/service-tariff.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const CENTS_PER_RUPIAH_UNIT = 100;

/**
 * Room charges for a finished stay (IMP-15).
 *
 * Lines land on the ordinary `Invoice` aggregate — same counter, same statuses,
 * same single payment path — because an inpatient bill is a bill. What is new
 * is only that it hangs off `admissionId` instead of `encounterId`: a patient
 * admitted directly has no outpatient consultation, and until now that meant
 * they could not be billed at all.
 *
 * Nothing here fails a discharge. A ward class with no live tariff becomes a
 * reported gap, not an exception — refusing to discharge a patient because the
 * price list is incomplete would put a billing problem in front of a clinical
 * one.
 */
@Injectable()
export class AccommodationBillingService {
  private readonly logger = new Logger(AccommodationBillingService.name);

  private readonly clinicTimeZone: string;

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly serviceTariffRepository: ServiceTariffRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async generateRoomCharges(params: {
    admission: AdmissionRecord;
    createdById: string;
  }): Promise<AdmissionRoomChargeResult> {
    const { admission, createdById } = params;
    const existing = await this.billingRepository.findLiveInvoiceByAdmissionId(admission.id);

    if (existing) {
      return { invoiceId: existing.id, totalAmount: 0, nights: 0, gaps: [] };
    }

    const tallies = tallyAccommodationNights({
      intervals: this.toStayIntervals(admission),
      timeZone: this.clinicTimeZone,
    });
    const nights = tallies.reduce((total, tally) => total + tally.nights, 0);

    if (nights === 0) {
      return { totalAmount: 0, nights: 0, gaps: [] };
    }

    const tariffs = await this.serviceTariffRepository.findActiveAccommodationTariffs();
    const { items, gaps } = this.collectRoomChargeItems({ tallies, tariffs });

    if (items.length === 0) {
      return { totalAmount: 0, nights, gaps };
    }

    const totalCents = items.reduce(
      (sum, item) => sum + Math.round(item.amount * CENTS_PER_RUPIAH_UNIT),
      0,
    );
    const invoice = await this.billingRepository.createInvoiceWithItems({
      admissionId: admission.id,
      patientId: admission.patientId,
      createdById,
      invoiceDate: this.resolveClinicToday(),
      totalAmount: totalCents / CENTS_PER_RUPIAH_UNIT,
      items,
    });

    this.logger.log(
      `Room charges for admission ${admission.id}: ${nights} night(s), invoice ${invoice.invoiceNumber}`,
    );

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      nights,
      gaps,
    };
  }

  /**
   * Only closed assignments are billable. An open one would mean the patient
   * is still in the bed, and pricing a night that has not finished is how a
   * bill charges for a stay the ward is still providing.
   */
  private toStayIntervals(admission: AdmissionRecord) {
    return admission.bedAssignments
      .filter((assignment) => assignment.endedAt !== null)
      .map((assignment) => ({
        roomClass: assignment.bed.roomClass,
        startedAt: assignment.startedAt,
        endedAt: assignment.endedAt as Date,
      }));
  }

  private collectRoomChargeItems(params: {
    tallies: readonly AccommodationNightTally[];
    tariffs: readonly ServiceTariffRecord[];
  }): { items: CreateInvoiceItemPayload[]; gaps: InvoiceGenerationGap[] } {
    const { tallies, tariffs } = params;
    const items: CreateInvoiceItemPayload[] = [];
    const gaps: InvoiceGenerationGap[] = [];

    for (const tally of tallies) {
      const tariff = tariffs.find(
        (candidate) => candidate.roomClass?.id === tally.roomClass.id,
      );
      // The class's own name, as the clinic writes it — so a clinic that
      // renamed "Kelas 1" sees that name on the bill rather than a label this
      // service kept a private copy of.
      const label = tally.roomClass.name;

      if (!tariff) {
        gaps.push({
          reason: 'NO_ACCOMMODATION_TARIFF',
          description: `${tally.nights} night(s) in ${label} could not be priced`,
          code: tally.roomClass.code,
        });
        continue;
      }

      items.push({
        itemType: 'ACCOMMODATION',
        serviceTariffId: tariff.id,
        // A snapshot, like every other line: repricing the ward tomorrow must
        // not rewrite a bill issued today.
        description: `${tariff.name} (${label}) — ${tally.nights} malam`,
        quantity: tally.nights,
        unitPrice: tariff.price,
        amount: tariff.price * tally.nights,
      });
    }

    return { items, gaps };
  }

  private resolveClinicToday(): Date {
    const today = getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    return new Date(`${today}T00:00:00.000Z`);
  }
}
