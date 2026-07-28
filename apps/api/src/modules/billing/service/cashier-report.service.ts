import {
  CashierDailyReport,
  CashierReportDoctorLine,
  CashierReportMethodLine,
  CashierReportPaymentRecord,
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
  PaymentMethodValue,
} from '@hms/shared-types';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CashierDailyReportQueryDto } from '../dto/cashier-daily-report-query.dto';
import { BillingRepository } from '../repository/billing.repository';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';

const CENTS_PER_RUPIAH_UNIT = 100;

const DAYS_PER_STEP = 1;

const UNATTRIBUTED_DOCTOR_ID = 'UNATTRIBUTED';

type MutableTotals = { count: number; totalCents: number };

function addPaymentToTotals(totals: MutableTotals, amountCents: number): void {
  totals.count += 1;
  totals.totalCents += amountCents;
}

function toRupiah(cents: number): number {
  return cents / CENTS_PER_RUPIAH_UNIT;
}

/**
 * The end-of-day report a clinic owner actually asks for first: what was
 * settled today, split by payment method (does the drawer reconcile?) and by
 * doctor (who produced the revenue?). Built from payments only, so unpaid and
 * voided invoices never inflate it; sums run in integer cents so a day of
 * odd amounts can not drift.
 */
@Injectable()
export class CashierReportService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly billingRepository: BillingRepository,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async getDailyReport(query: CashierDailyReportQueryDto): Promise<CashierDailyReport> {
    const date = query.date ?? getCalendarDateInTimeZone(new Date(), this.clinicTimeZone);
    const startInclusive = getStartOfCalendarDateInTimeZone(date, this.clinicTimeZone);
    const endExclusive = this.addDays(startInclusive, DAYS_PER_STEP);
    const payments = await this.billingRepository.findPaymentsForCashierReport({
      startInclusive,
      endExclusive,
    });

    return this.buildReport(date, payments);
  }

  private buildReport(date: string, payments: CashierReportPaymentRecord[]): CashierDailyReport {
    const overall: MutableTotals = { count: 0, totalCents: 0 };
    const byMethod = new Map<PaymentMethodValue, MutableTotals>();
    const byDoctor = new Map<string, MutableTotals & { doctorName: string }>();
    for (const payment of payments) {
      const amountCents = Math.round(payment.amount * CENTS_PER_RUPIAH_UNIT);
      addPaymentToTotals(overall, amountCents);
      addPaymentToTotals(this.resolveMethodLine(byMethod, payment.method), amountCents);
      addPaymentToTotals(this.resolveDoctorLine(byDoctor, payment), amountCents);
    }

    return {
      date,
      totals: { count: overall.count, totalAmount: toRupiah(overall.totalCents) },
      byMethod: this.toMethodLines(byMethod),
      byDoctor: this.toDoctorLines(byDoctor),
    };
  }

  private resolveMethodLine(
    byMethod: Map<PaymentMethodValue, MutableTotals>,
    method: PaymentMethodValue,
  ): MutableTotals {
    const existing = byMethod.get(method);
    if (existing) {
      return existing;
    }
    const created: MutableTotals = { count: 0, totalCents: 0 };
    byMethod.set(method, created);
    return created;
  }

  private resolveDoctorLine(
    byDoctor: Map<string, MutableTotals & { doctorName: string }>,
    payment: CashierReportPaymentRecord,
  ): MutableTotals {
    const doctorId = payment.doctor?.id ?? UNATTRIBUTED_DOCTOR_ID;
    const existing = byDoctor.get(doctorId);
    if (existing) {
      return existing;
    }
    const created = {
      count: 0,
      totalCents: 0,
      doctorName: payment.doctor?.fullName ?? 'Unattributed',
    };
    byDoctor.set(doctorId, created);
    return created;
  }

  private toMethodLines(byMethod: Map<PaymentMethodValue, MutableTotals>): CashierReportMethodLine[] {
    return [...byMethod.entries()]
      .map(([method, totals]) => ({
        method,
        count: totals.count,
        totalAmount: toRupiah(totals.totalCents),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount);
  }

  private toDoctorLines(
    byDoctor: Map<string, MutableTotals & { doctorName: string }>,
  ): CashierReportDoctorLine[] {
    return [...byDoctor.entries()]
      .map(([doctorId, totals]) => ({
        doctorId,
        doctorName: totals.doctorName,
        count: totals.count,
        totalAmount: toRupiah(totals.totalCents),
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount);
  }

  private addDays(instant: Date, days: number): Date {
    const shifted = new Date(instant);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted;
  }
}
