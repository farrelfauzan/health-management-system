import {
  ComputedTaxReport,
  CreateTaxReportInput,
  PP55_DEPOSIT_TYPE_CODE,
  PP55_RATE_PERCENT,
  PP55_TAX_ACCOUNT_CODE,
  TAX_REPORT_EXISTS_ERROR_CODE,
  TAX_REPORT_FINALIZED_ERROR_CODE,
  TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
  TAX_REPORT_PERIOD_IN_FUTURE_ERROR_CODE,
  TAX_REPORT_PERIOD_OPEN_ERROR_CODE,
  TaxReportCsvExport,
  TaxReportKindValue,
  TaxReportListItem,
  TaxReportPeriodRange,
  TaxReportRecord,
  TaxReportView,
  TaxReportsListMeta,
  computePp55MonthlyTax,
  diffTaxReportTotals,
  getCalendarDateInTimeZone,
  getStartOfCalendarDateInTimeZone,
  resolveTaxReportDueDates,
  summarizePpnOutput,
} from '@hms/shared-types';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { TaxProfileService } from '../../tax-core/service/tax-profile.service';
import { TaxReportRepository } from '../repository/tax-report.repository';
import { buildTaxReportCsv } from './build-tax-report-csv';

const DEFAULT_CLINIC_TIME_ZONE = 'Asia/Jakarta';
const TAX_REPORT_AUDIT_RESOURCE = 'tax-report';
const PERIOD_LENGTH = 7;
const DECEMBER = 12;

/**
 * The monthly tax report drafts (P27-T05, `docs/post-mvp/decisions.md` D-038):
 * what the clinic pays and files in Coretax itself — the product drafts, it
 * never files.
 *
 * PP 55 is cash basis: a month's omzet is what was paid in it. PPN keluaran is
 * read from the tax snapshot each invoice froze at issue (P27-T04). A DRAFT is
 * recomputed at will; finalizing freezes the figures once the month is over.
 * A finalized report is never rewritten: every read compares it with the
 * books as they are now and lists what no longer matches.
 */
@Injectable()
export class TaxReportService {
  private readonly clinicTimeZone: string;

  constructor(
    private readonly taxReportRepository: TaxReportRepository,
    private readonly taxProfileService: TaxProfileService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.clinicTimeZone = configService.get<string>('CLINIC_TIMEZONE') ?? DEFAULT_CLINIC_TIME_ZONE;
  }

  async listReports(
    year: number,
  ): Promise<{ items: TaxReportListItem[]; meta: TaxReportsListMeta }> {
    const [reports, applicableKinds] = await Promise.all([
      this.taxReportRepository.listReportsForYear(year),
      this.resolveApplicableKinds(),
    ]);
    const items = await Promise.all(
      reports.map(async (report) => {
        const view = await this.toView(report);
        return {
          id: report.id,
          period: report.period,
          kind: report.kind,
          status: report.status,
          taxDue:
            report.summary.kind === 'PP55_OMZET'
              ? report.summary.totals.taxDue
              : report.summary.totals.taxAmount,
          isOutOfDate: view.isOutOfDate,
        };
      }),
    );
    return { items, meta: { year, applicableKinds } };
  }

  async getReport(id: string): Promise<TaxReportView> {
    return this.toView(await this.findReportOrThrow(id));
  }

  async createReport(input: CreateTaxReportInput, actor: CurrentUser): Promise<TaxReportView> {
    this.assertPeriodNotInFuture(input.period);
    await this.assertApplicable(input.kind);
    if (await this.taxReportRepository.findReportByPeriodAndKind(input.period, input.kind)) {
      throw new ConflictException({
        code: TAX_REPORT_EXISTS_ERROR_CODE,
        message: `A ${input.kind} report for ${input.period} already exists; recompute it instead`,
      });
    }
    const computed = await this.computeReport(input.period, input.kind);
    const created = await this.taxReportRepository.createReport({
      ...computed,
      period: input.period,
      kind: input.kind,
      generatedById: actor.sub,
    });
    await this.recordAudit('CREATE', created, actor);
    return this.toView(created);
  }

  async recomputeReport(id: string, actor: CurrentUser): Promise<TaxReportView> {
    const report = await this.findDraftOrThrow(id);
    const computed = await this.computeReport(report.period, report.kind);
    const updated = await this.taxReportRepository.updateReportComputation({
      ...computed,
      id,
      generatedById: actor.sub,
    });
    return this.toView(updated);
  }

  /**
   * Freezes the month. Refused while the month is still running — a figure
   * that can still grow is not one to pay from — and computed afresh in the
   * same step, so what is frozen is what the books say at that moment.
   */
  async finalizeReport(id: string, actor: CurrentUser): Promise<TaxReportView> {
    const report = await this.findDraftOrThrow(id);
    if (report.period >= this.resolveCurrentPeriod()) {
      throw new ConflictException({
        code: TAX_REPORT_PERIOD_OPEN_ERROR_CODE,
        message: `${report.period} has not ended yet; finalize it once the month is over`,
      });
    }
    const computed = await this.computeReport(report.period, report.kind);
    const finalized = await this.taxReportRepository.finalizeReport({
      ...computed,
      id,
      finalizedById: actor.sub,
      finalizedAt: new Date(),
    });
    await this.recordAudit('TAX_REPORT_FINALIZED', finalized, actor);
    return this.toView(finalized);
  }

  async exportReport(id: string, actor: CurrentUser): Promise<TaxReportCsvExport> {
    const report = await this.findReportOrThrow(id);
    await this.recordAudit('EXPORT', report, actor);
    return {
      fileName: `pajak-${report.kind.toLowerCase().replace('_', '-')}-${report.period}.csv`,
      csv: buildTaxReportCsv(report),
    };
  }

  private async computeReport(
    period: string,
    kind: TaxReportKindValue,
  ): Promise<ComputedTaxReport> {
    return kind === 'PP55_OMZET' ? this.computePp55(period) : this.computePpnOutput(period);
  }

  private async computePp55(period: string): Promise<ComputedTaxReport> {
    const range = this.resolvePeriodRange(period);
    const yearStart = this.resolvePeriodRange(`${period.slice(0, 4)}-01`).start;
    const [payments, yearToDateOmzetBefore, settings] = await Promise.all([
      this.taxReportRepository.findPaymentsPaidBetween(range),
      this.taxReportRepository.sumPaymentsPaidBetween({ start: yearStart, end: range.start }),
      this.taxProfileService.getTaxSettings(),
    ]);
    const grossOmzet = payments.reduce((total, payment) => total + payment.amount, 0);
    const tax = computePp55MonthlyTax({
      monthOmzet: grossOmzet,
      yearToDateOmzetBefore,
      taxpayerType: settings.taxpayerType,
    });
    return {
      summary: {
        kind: 'PP55_OMZET',
        taxpayerType: settings.taxpayerType,
        ratePercent: PP55_RATE_PERCENT,
        paymentCount: payments.length,
        yearToDateOmzetBefore,
        nonTaxableAllowanceUsed: tax.nonTaxableAllowanceUsed,
        totals: { grossOmzet, taxableOmzet: tax.taxableOmzet, taxDue: tax.taxDue },
        taxAccountCode: PP55_TAX_ACCOUNT_CODE,
        depositTypeCode: PP55_DEPOSIT_TYPE_CODE,
        ...resolveTaxReportDueDates(period, 'PP55_OMZET'),
      },
      lines: payments.map((payment) => ({ ...payment, paidAt: payment.paidAt.toISOString() })),
    };
  }

  private async computePpnOutput(period: string): Promise<ComputedTaxReport> {
    const lines = await this.taxReportRepository.findIssuedInvoiceLinesBetween(
      this.resolvePeriodRange(period),
    );
    return summarizePpnOutput({
      lines,
      dueDates: resolveTaxReportDueDates(period, 'PPN_OUTPUT'),
    });
  }

  /**
   * Which reports the clinic's tax profile calls for (P27-T02): PP 55 on the
   * 0.5% regime, PPN keluaran for a PKP.
   */
  private async resolveApplicableKinds(): Promise<TaxReportKindValue[]> {
    const settings = await this.taxProfileService.getTaxSettings();
    return [
      ...(settings.incomeTaxRegime === 'PP55_FINAL' ? (['PP55_OMZET'] as const) : []),
      ...(settings.isPkp ? (['PPN_OUTPUT'] as const) : []),
    ];
  }

  private async assertApplicable(kind: TaxReportKindValue): Promise<void> {
    if ((await this.resolveApplicableKinds()).includes(kind)) {
      return;
    }
    throw new ConflictException({
      code: TAX_REPORT_NOT_APPLICABLE_ERROR_CODE,
      message:
        kind === 'PP55_OMZET'
          ? 'The clinic is not on the PP 55 final regime; set it in the tax profile first'
          : 'The clinic is not a PKP, so it has no output PPN to report',
    });
  }

  private assertPeriodNotInFuture(period: string): void {
    if (period > this.resolveCurrentPeriod()) {
      throw new ConflictException({
        code: TAX_REPORT_PERIOD_IN_FUTURE_ERROR_CODE,
        message: `${period} has not started yet`,
      });
    }
  }

  private async findReportOrThrow(id: string): Promise<TaxReportRecord> {
    const report = await this.taxReportRepository.findReportById(id);
    if (!report) {
      throw new NotFoundException('Tax report not found');
    }
    return report;
  }

  private async findDraftOrThrow(id: string): Promise<TaxReportRecord> {
    const report = await this.findReportOrThrow(id);
    if (report.status !== 'DRAFT') {
      throw new ConflictException({
        code: TAX_REPORT_FINALIZED_ERROR_CODE,
        message: `The ${report.period} report is finalized; it is kept as filed`,
      });
    }
    return report;
  }

  private async recordAudit(
    action: 'CREATE' | 'EXPORT' | 'TAX_REPORT_FINALIZED',
    report: TaxReportRecord,
    actor: CurrentUser,
  ): Promise<void> {
    await this.auditService.record({
      action,
      resource: TAX_REPORT_AUDIT_RESOURCE,
      resourceId: report.id,
      actorUserId: actor.sub,
      metadata: { period: report.period, kind: report.kind, totals: report.summary.totals },
    });
  }

  private resolveCurrentPeriod(): string {
    return getCalendarDateInTimeZone(new Date(), this.clinicTimeZone).slice(0, PERIOD_LENGTH);
  }

  /** The clinic-timezone month as UTC instants, end exclusive. */
  private resolvePeriodRange(period: string): TaxReportPeriodRange {
    const [yearPart = '0', monthPart = '1'] = period.split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    const next =
      month === DECEMBER ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    return {
      start: getStartOfCalendarDateInTimeZone(`${period}-01`, this.clinicTimeZone),
      end: getStartOfCalendarDateInTimeZone(`${next}-01`, this.clinicTimeZone),
    };
  }

  private async toView(report: TaxReportRecord): Promise<TaxReportView> {
    const live = await this.computeReport(report.period, report.kind);
    const differences = diffTaxReportTotals(report.summary, live.summary);
    return {
      id: report.id,
      period: report.period,
      kind: report.kind,
      status: report.status,
      summary: report.summary,
      lines: report.lines,
      generatedAt: report.generatedAt.toISOString(),
      generatedById: report.generatedById ?? undefined,
      finalizedAt: report.finalizedAt?.toISOString(),
      finalizedById: report.finalizedById ?? undefined,
      isOutOfDate: differences.length > 0,
      differences,
    };
  }
}
